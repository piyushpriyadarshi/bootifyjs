import { describe, expect, it, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import { JwtStrategy } from '../../../src/auth/strategies/JwtStrategy'
import type { JwtStrategyConfig } from '../../../src/auth/strategies/JwtStrategy'
import type { AuthContext, User } from '../../../src/auth/types'

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
  const strategy = new JwtStrategy()
  await strategy.initialize({
    strategy: 'jwt',
    options: {
      accessTokenSecret: 'access-secret',
      refreshTokenSecret: 'refresh-secret',
      accessTokenExpiry: '15m',
      refreshTokenExpiry: '7d',
      userProvider: vi.fn().mockResolvedValue(testUser),
      credentialValidator: vi.fn().mockResolvedValue(testUser),
      ...overrides,
    },
  })
  return { strategy }
}

async function login(strategy: JwtStrategy, context: AuthContext = createContext()) {
  return strategy.authenticate({
    ...context,
    body: { email: 'user@example.com', password: 'pw' },
  }) as any
}

describe('JwtStrategy — payloadBuilder', () => {
  it('lands custom claims in the access token next to the framework defaults', async () => {
    const { strategy } = await makeStrategy({
      payloadBuilder: (u) => ({ tenant: 'acme', plan: 'pro' }),
    })

    const result = await login(strategy)
    expect(result.success).toBe(true)

    const payload = jwt.decode(result.tokens.accessToken) as any
    expect(payload.tenant).toBe('acme')
    expect(payload.plan).toBe('pro')
    expect(payload.sub).toBe('user-1')
    expect(payload.email).toBe('user@example.com')
    expect(payload.roles).toEqual(['admin'])
    expect(payload.permissions).toEqual(['read:todos', 'write:todos'])
    expect(payload.jti).toBeDefined()
  })

  it('leaves the refresh token payload untouched', async () => {
    const { strategy } = await makeStrategy({
      payloadBuilder: (u) => ({ tenant: 'acme', plan: 'pro' }),
    })

    const result = await login(strategy)

    const refreshPayload = jwt.decode(result.tokens.refreshToken) as any
    expect(refreshPayload.tenant).toBeUndefined()
    expect(refreshPayload.plan).toBeUndefined()
    expect(refreshPayload.sub).toBe('user-1')
    expect(refreshPayload.type).toBe('refresh')
    expect(refreshPayload.jti).toBeDefined()
  })

  it('passes the resolved user and the auth context to the builder', async () => {
    const payloadBuilder = vi.fn(() => ({ device: 'web' }))
    const { strategy } = await makeStrategy({ payloadBuilder })

    const context = createContext({ body: { email: 'user@example.com', password: 'pw' } })
    await login(strategy, context)

    expect(payloadBuilder).toHaveBeenCalledTimes(1)
    expect(payloadBuilder).toHaveBeenCalledWith(testUser, context)
  })

  it('rejects reserved claims with JWT_PAYLOAD_CLAIM_RESERVED', async () => {
    const { strategy } = await makeStrategy({
      payloadBuilder: () => ({ sub: 'evil' }),
    })

    const result = await login(strategy)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Authentication failed:/)
    expect(result.error).toContain('payloadBuilder cannot set reserved claims: sub')
    expect(result.tokens).toBeUndefined()
  })

  it('allows overriding framework defaults (documented stripping use case)', async () => {
    const { strategy } = await makeStrategy({
      payloadBuilder: () => ({ permissions: [] }),
    })

    const result = await login(strategy)
    expect(result.success).toBe(true)

    const payload = jwt.decode(result.tokens.accessToken) as any
    expect(payload.permissions).toEqual([])
  })

  it('keeps the exact default payload shape when no builder is configured', async () => {
    const { strategy } = await makeStrategy()

    const result = await login(strategy)
    expect(result.success).toBe(true)

    const payload = jwt.decode(result.tokens.accessToken) as any
    expect(Object.keys(payload).sort()).toEqual([
      'email',
      'exp',
      'iat',
      'jti',
      'permissions',
      'roles',
      'sub',
      'type',
    ])
    expect(payload.exp - payload.iat).toBe(900)
  })

  it('converts a throwing builder into { success: false }', async () => {
    const { strategy } = await makeStrategy({
      payloadBuilder: () => {
        throw new Error('boom')
      },
    })

    const result = await login(strategy)

    expect(result.success).toBe(false)
    expect(result.error).toContain('boom')
    expect(result.tokens).toBeUndefined()
  })

  it('re-mints custom claims on refresh (new pair, still fresh claims)', async () => {
    const { strategy } = await makeStrategy({
      payloadBuilder: () => ({ tenant: 'acme' }),
    })

    const loginResult = await login(strategy)
    const refreshed = await strategy.refresh(
      loginResult.tokens.refreshToken,
      createContext({ type: 'refresh' })
    ) as any

    expect(refreshed.success).toBe(true)
    const payload = jwt.decode(refreshed.tokens.accessToken) as any
    expect(payload.tenant).toBe('acme')
  })

  it('rejects a non-function payloadBuilder at initialize', async () => {
    const strategy = new JwtStrategy()
    await expect(
      strategy.initialize({
        strategy: 'jwt',
        options: {
          accessTokenSecret: 'a',
          refreshTokenSecret: 'r',
          userProvider: vi.fn(),
          payloadBuilder: 'not-a-function',
        } as any,
      })
    ).rejects.toMatchObject({ code: 'INVALID_CONFIG' })
  })
})
