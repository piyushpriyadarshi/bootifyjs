import { describe, expect, it, vi } from 'vitest'
import { ApiKeyStrategy } from '../../../src/auth/strategies/ApiKeyStrategy'
import type { AuthContext, User } from '../../../src/auth/types'
import { FakeTokenStorage } from '../../helpers/fakes'

const testUser: User = {
  id: 'user-1',
  email: 'user@example.com',
  roles: ['service'],
  permissions: ['read:todos', 'write:todos', 'admin:settings'],
  createdAt: new Date('2026-01-01'),
}

function createContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    type: 'generate',
    strategy: 'api-key',
    request: {},
    headers: {},
    ...overrides,
  }
}

async function makeStrategy(overrides: Record<string, any> = {}) {
  const storage = new FakeTokenStorage()
  const strategy = new ApiKeyStrategy()
  await strategy.initialize({
    strategy: 'api-key',
    options: {
      tokenStorage: storage,
      userProvider: vi.fn().mockResolvedValue(testUser),
      ...overrides,
    },
  })
  return { strategy, storage }
}

async function createKey(
  strategy: ApiKeyStrategy,
  overrides: Record<string, any> = {}
) {
  const result = (await strategy.authenticate(
    createContext({ body: { userId: 'user-1', name: 'ci-key', ...overrides } })
  )) as any
  if (!result.success) throw new Error(`key creation failed: ${result.error}`)
  return result
}

describe('ApiKeyStrategy — configuration', () => {
  it('requires tokenStorage', async () => {
    const strategy = new ApiKeyStrategy()
    await expect(
      strategy.initialize({
        strategy: 'api-key',
        options: { userProvider: vi.fn() } as any,
      })
    ).rejects.toMatchObject({ code: 'INVALID_CONFIG' })
  })

  it('requires userProvider', async () => {
    const strategy = new ApiKeyStrategy()
    await expect(
      strategy.initialize({
        strategy: 'api-key',
        options: { tokenStorage: new FakeTokenStorage() } as any,
      })
    ).rejects.toMatchObject({ code: 'INVALID_CONFIG' })
  })

  it('applies documented defaults', async () => {
    const { strategy } = await makeStrategy()
    const result = await createKey(strategy)
    expect(result.tokens.accessToken.startsWith('ak_')).toBe(true)
    expect(result.metadata.scopes).toEqual(['read'])
  })
})

describe('ApiKeyStrategy — authenticate (key creation)', () => {
  it('creates a scoped key with refresh capability', async () => {
    const { strategy, storage } = await makeStrategy()
    const result = await createKey(strategy, { scopes: ['read', 'write'] })

    const key = result.tokens.accessToken
    expect(result.tokens.tokenType).toBe('API-Key')
    expect(key.startsWith('ak_')).toBe(true)
    expect(result.tokens.refreshToken).toContain('refresh_')

    const [keyId] = key.slice('ak_'.length).split('.')
    const stored = await storage.get(`apikey:${keyId}`)
    expect(stored.isActive).toBe(true)
    expect(stored.scopes).toEqual(['read', 'write'])
    expect(stored.userId).toBe('user-1')
  })

  it('rejects creation without userId/name', async () => {
    const { strategy } = await makeStrategy()
    const result = await strategy.authenticate(createContext({ body: { userId: 'u1' } }))
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/userId and name are required/)
  })

  it('rejects creation for unknown users', async () => {
    const { strategy } = await makeStrategy({
      userProvider: vi.fn().mockResolvedValue(null),
    })
    const result = await strategy.authenticate(
      createContext({ body: { userId: 'ghost', name: 'k' } })
    )
    expect(result.success).toBe(false)
    expect(result.error).toBe('User not found')
  })

  it('enforces maxKeysPerUser', async () => {
    const { strategy } = await makeStrategy({ maxKeysPerUser: 1 })
    await createKey(strategy)
    const second = await strategy.authenticate(
      createContext({ body: { userId: 'user-1', name: 'second' } })
    )
    expect(second.success).toBe(false)
    expect(second.error).toContain('Maximum API keys limit')
  })
})

describe('ApiKeyStrategy — validate', () => {
  it('validates a generated key and filters permissions by scopes', async () => {
    const { strategy } = await makeStrategy()
    const created = await createKey(strategy, { scopes: ['read'] })

    const result = await strategy.validate(created.tokens.accessToken, createContext())

    expect(result.success).toBe(true)
    expect(result.user?.id).toBe('user-1')
    // write:*/admin:* filtered out, read:* kept
    expect(result.user?.permissions).toEqual(['read:todos'])
    expect(result.metadata?.scopes).toEqual(['read'])
  })

  it('rejects malformed keys', async () => {
    const { strategy } = await makeStrategy()
    const result = await strategy.validate('totally-invalid', createContext())
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Invalid API key format/)
  })

  it('rejects unknown keys', async () => {
    const { strategy } = await makeStrategy()
    const result = await strategy.validate('ak_unknown.abc123', createContext())
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/API key not found/)
  })

  it('rejects a tampered secret (hash mismatch)', async () => {
    const { strategy } = await makeStrategy()
    const created = await createKey(strategy)
    const [keyId] = created.tokens.accessToken.slice(3).split('.')
    const tampered = `ak_${keyId}.0000000000000000000000000000000000000000000000000000000000000000`

    const result = await strategy.validate(tampered, createContext())
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Invalid API key/)
  })

  it('rejects disabled (revoked) keys', async () => {
    const { strategy } = await makeStrategy()
    const created = await createKey(strategy)
    await strategy.revoke(created.tokens.accessToken, createContext())

    const result = await strategy.validate(created.tokens.accessToken, createContext())
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/API key is disabled/)
  })

  it('rejects expired keys', async () => {
    const { strategy } = await makeStrategy()
    // negative expiresIn → expiresAt already in the past
    const created = await createKey(strategy, { expiresIn: -1 })
    const result = await strategy.validate(created.tokens.accessToken, createContext())
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/API key has expired/)
  })
})

describe('ApiKeyStrategy — refresh (rotation)', () => {
  it('rotates the secret and invalidates the old key', async () => {
    const { strategy, storage } = await makeStrategy()
    const created = await createKey(strategy, { scopes: ['read'] })
    const oldKey = created.tokens.accessToken
    const keyId = oldKey.slice(3).split('.')[0]

    const hashBefore = (await storage.get(`apikey:${keyId}`)).hashedSecret

    const rotated = await strategy.refresh(created.tokens.refreshToken, createContext())

    expect(rotated.success).toBe(true)
    expect(rotated.metadata?.rotated).toBe(true)
    expect(rotated.tokens!.accessToken).not.toBe(oldKey)

    const hashAfter = (await storage.get(`apikey:${keyId}`)).hashedSecret
    expect(hashAfter).not.toBe(hashBefore)

    // old secret no longer validates
    const oldResult = await strategy.validate(oldKey, createContext())
    expect(oldResult.success).toBe(false)
  })

  it('rejects an invalid refresh key', async () => {
    const { strategy } = await makeStrategy()
    await createKey(strategy)
    const bad = await strategy.refresh('ak_forged.wrongsecret', createContext())
    expect(bad.success).toBe(false)
  })
})

describe('ApiKeyStrategy — key management', () => {
  it('lists keys without sensitive hashes and hides revoked keys', async () => {
    const { strategy } = await makeStrategy()
    const first = await createKey(strategy, { name: 'one' })
    await createKey(strategy, { name: 'two' })
    await strategy.revoke(first.tokens.accessToken, createContext())

    const keys = await strategy.listUserApiKeys('user-1')
    expect(keys).toHaveLength(1)
    expect(keys[0].name).toBe('two')
    expect(JSON.stringify(keys)).not.toContain('hashedSecret')
  })

  it('deleteApiKey removes the key permanently', async () => {
    const { strategy, storage } = await makeStrategy()
    const created = await createKey(strategy)
    const keyId = created.tokens.accessToken.slice(3).split('.')[0]

    expect(await strategy.deleteApiKey(keyId, 'user-1')).toBe(true)
    expect(await storage.get(`apikey:${keyId}`)).toBeNull()
    expect(await strategy.listUserApiKeys('user-1')).toHaveLength(0)
  })
})
