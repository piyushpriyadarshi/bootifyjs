import { describe, expect, it, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import { JwtStrategy } from '../../../src/auth/strategies/JwtStrategy'
import type { JwtStrategyConfig } from '../../../src/auth/strategies/JwtStrategy'
import type { AuthContext, User } from '../../../src/auth/types'
import { FakeTokenStorage } from '../../helpers/fakes'

const testUser: User = {
  id: 'user-1',
  email: 'user@example.com',
  username: 'user1',
  roles: ['admin'],
  permissions: ['read:todos', 'write:todos'],
  createdAt: new Date('2026-01-01'),
}

function createContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    type: 'login',
    strategy: 'jwt',
    request: {},
    headers: {},
    ...overrides,
  }
}

async function makeStrategy(overrides: Partial<JwtStrategyConfig> = {}) {
  const storage = new FakeTokenStorage()
  const strategy = new JwtStrategy()
  await strategy.initialize({
    strategy: 'jwt',
    options: {
      accessTokenSecret: 'access-secret',
      refreshTokenSecret: 'refresh-secret',
      accessTokenExpiry: '15m',
      refreshTokenExpiry: '7d',
      issuer: 'test-issuer',
      userProvider: vi.fn().mockResolvedValue(testUser),
      credentialValidator: vi.fn().mockResolvedValue(testUser),
      tokenStorage: storage,
      ...overrides,
    },
  })
  return { strategy, storage }
}

describe('JwtStrategy — authenticate', () => {
  it('issues a token pair for valid credentials', async () => {
    const { strategy, storage } = await makeStrategy()

    const result = await strategy.authenticate(
      createContext({ body: { email: 'user@example.com', password: 'pw' } })
    )

    expect(result.success).toBe(true)
    expect(result.user?.id).toBe('user-1')
    expect(result.tokens?.tokenType).toBe('Bearer')
    expect(result.tokens?.expiresIn).toBe(900) // '15m'

    const payload = jwt.decode(result.tokens!.accessToken) as any
    expect(payload.sub).toBe('user-1')
    expect(payload.type).toBe('access')
    expect(payload.roles).toEqual(['admin'])

    // refresh token persisted in storage
    expect(payload.jti).toBeDefined()
    const refreshPayload = jwt.decode(result.tokens!.refreshToken) as any
    expect(await storage.exists(`refresh:${refreshPayload.jti}`)).toBe(true)
  })

  it('rejects missing credentials', async () => {
    const { strategy } = await makeStrategy()
    const result = await strategy.authenticate(createContext({ body: undefined }))
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Email\/username and password are required/)
  })

  it('rejects when credentialValidator returns null', async () => {
    const { strategy } = await makeStrategy({
      credentialValidator: vi.fn().mockResolvedValue(null),
    })
    const result = await strategy.authenticate(
      createContext({ body: { email: 'user@example.com', password: 'wrong' } })
    )
    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid credentials')
  })

  it('reports when no credentialValidator is configured', async () => {
    const { strategy } = await makeStrategy({ credentialValidator: undefined })
    const result = await strategy.authenticate(
      createContext({ body: { email: 'x@example.com', password: 'pw' } })
    )
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Credential validation not configured/)
  })

  it('wraps credentialValidator failures', async () => {
    const { strategy } = await makeStrategy({
      credentialValidator: vi.fn().mockRejectedValue(new Error('db down')),
    })
    const result = await strategy.authenticate(
      createContext({ body: { email: 'x@example.com', password: 'pw' } })
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('db down')
  })
})

describe('JwtStrategy — validate', () => {
  it('accepts a freshly issued access token and returns the user', async () => {
    const { strategy } = await makeStrategy()
    const { tokens } = await strategy.authenticate(
      createContext({ body: { email: 'u@example.com', password: 'pw' } })
    ) as any

    const result = await strategy.validate(tokens.accessToken, createContext())

    expect(result.success).toBe(true)
    expect(result.user?.id).toBe('user-1')
    expect(result.metadata?.tokenId).toBeDefined()
    expect(result.metadata?.expiresAt).toBeInstanceOf(Date)
  })

  it('rejects an expired access token with TOKEN_EXPIRED', async () => {
    const { strategy } = await makeStrategy()
    const expired = jwt.sign(
      { sub: 'user-1', type: 'access' },
      'access-secret',
      { expiresIn: -10, issuer: 'test-issuer' }
    )

    const result = await strategy.validate(expired, createContext())
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/expired/)
    expect(result.metadata?.code).toBe('TOKEN_EXPIRED')
  })

  it('rejects malformed tokens with INVALID_TOKEN', async () => {
    const { strategy } = await makeStrategy()
    const result = await strategy.validate('not-a-jwt', createContext())
    expect(result.success).toBe(false)
    expect(result.metadata?.code).toBe('INVALID_TOKEN')
  })

  it('rejects tokens signed with the wrong secret', async () => {
    const { strategy } = await makeStrategy()
    const forged = jwt.sign({ sub: 'user-1' }, 'wrong-secret', { issuer: 'test-issuer' })
    const result = await strategy.validate(forged, createContext())
    expect(result.success).toBe(false)
    expect(result.metadata?.code).toBe('INVALID_TOKEN')
  })

  it('rejects tokens without a subject', async () => {
    const { strategy } = await makeStrategy()
    const noSub = jwt.sign({ foo: 'bar' }, 'access-secret', { issuer: 'test-issuer' })
    const result = await strategy.validate(noSub, createContext())
    expect(result.success).toBe(false)
  })

  it('rejects when the userProvider no longer knows the user', async () => {
    const { strategy } = await makeStrategy({
      userProvider: vi.fn().mockResolvedValue(null),
    })
    const token = jwt.sign(
      { sub: 'ghost', type: 'access' },
      'access-secret',
      { issuer: 'test-issuer' }
    )
    const result = await strategy.validate(token, createContext())
    expect(result.success).toBe(false)
    expect(result.error).toContain('User not found')
  })
})

describe('JwtStrategy — refresh (rotation)', () => {
  it('rotates a valid refresh token and invalidates the old one', async () => {
    const { strategy, storage } = await makeStrategy()
    const login = await strategy.authenticate(
      createContext({ body: { email: 'u@example.com', password: 'pw' } })
    ) as any
    const oldRefresh = login.tokens.refreshToken
    const oldJti = (jwt.decode(oldRefresh) as any).jti

    const refreshed = await strategy.refresh(oldRefresh, createContext())

    expect(refreshed.success).toBe(true)
    expect(refreshed.metadata?.refreshed).toBe(true)
    expect(refreshed.metadata?.oldTokenId).toBe(oldJti)

    const newJti = (jwt.decode(refreshed.tokens!.refreshToken) as any).jti
    expect(newJti).not.toBe(oldJti)
    expect(await storage.exists(`refresh:${newJti}`)).toBe(true)
    expect(await storage.exists(`refresh:${oldJti}`)).toBe(false)
  })

  it('rejects re-using a rotated (revoked) refresh token', async () => {
    const { strategy } = await makeStrategy()
    const login = await strategy.authenticate(
      createContext({ body: { email: 'u@example.com', password: 'pw' } })
    ) as any

    await strategy.refresh(login.tokens.refreshToken, createContext())
    const reuse = await strategy.refresh(login.tokens.refreshToken, createContext())

    expect(reuse.success).toBe(false)
    expect(reuse.error).toContain('not found or revoked')
  })

  it('rejects an expired refresh token', async () => {
    const { strategy } = await makeStrategy()
    const expired = jwt.sign(
      { sub: 'user-1', type: 'refresh', jti: 'jti-exp' },
      'refresh-secret',
      { expiresIn: -10, issuer: 'test-issuer' }
    )
    const result = await strategy.refresh(expired, createContext())
    expect(result.success).toBe(false)
    expect(result.metadata?.code).toBe('REFRESH_TOKEN_EXPIRED')
  })

  it('rejects access tokens used as refresh tokens', async () => {
    const { strategy } = await makeStrategy()
    const login = await strategy.authenticate(
      createContext({ body: { email: 'u@example.com', password: 'pw' } })
    ) as any

    const result = await strategy.refresh(login.tokens.accessToken, createContext())
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid refresh token')
  })
})

describe('JwtStrategy — revoke', () => {
  it('blacklists the token and removes the refresh entry', async () => {
    const { strategy, storage } = await makeStrategy()
    const login = await strategy.authenticate(
      createContext({ body: { email: 'u@example.com', password: 'pw' } })
    ) as any
    const refreshJti = (jwt.decode(login.tokens.refreshToken) as any).jti

    const revoked = await strategy.revoke(login.tokens.refreshToken, createContext())
    expect(revoked).toBe(true)
    expect(await storage.exists(`refresh:${refreshJti}`)).toBe(false)
    expect(await storage.exists(`blacklist:${refreshJti}`)).toBe(true)

    // revoked token can no longer be refreshed
    const reuse = await strategy.refresh(login.tokens.refreshToken, createContext())
    expect(reuse.success).toBe(false)
  })

  it('returns false for tokens without a jti', async () => {
    const { strategy } = await makeStrategy()
    const noJti = jwt.sign({ sub: 'user-1' }, 'access-secret')
    expect(await strategy.revoke(noJti, createContext())).toBe(false)
  })
})

describe('JwtStrategy — configuration', () => {
  it('rejects initialization without secrets', async () => {
    const strategy = new JwtStrategy()
    await expect(
      strategy.initialize({
        strategy: 'jwt',
        options: { userProvider: vi.fn() } as any,
      })
    ).rejects.toMatchObject({ code: 'INVALID_CONFIG' })
  })

  it('rejects initialization without a userProvider', async () => {
    const strategy = new JwtStrategy()
    await expect(
      strategy.initialize({
        strategy: 'jwt',
        options: { accessTokenSecret: 'a', refreshTokenSecret: 'r' } as any,
      })
    ).rejects.toMatchObject({ code: 'INVALID_CONFIG' })
  })
})
