import { describe, expect, it, vi } from 'vitest'
import { AuthManager } from '../../../src/auth/AuthManager'
import { AuthError, AuthStrategyType } from '../../../src/auth/types'
import type { AuthContext, AuthStrategy, User } from '../../../src/auth/types'
import { FakeTokenStorage } from '../../helpers/fakes'

function fakeStrategy(
  name: string,
  type: AuthStrategyType,
  result: any = { success: true, user: { id: 'u1' } as User }
): AuthStrategy {
  return {
    name,
    type,
    initialize: vi.fn().mockResolvedValue(undefined),
    authenticate: vi.fn().mockResolvedValue(result),
    validate: vi.fn().mockResolvedValue(result),
    refresh: vi.fn().mockResolvedValue(result),
    revoke: vi.fn().mockResolvedValue(true),
  } as unknown as AuthStrategy
}

function context(headers: Record<string, string> = {}): AuthContext {
  return { type: 'login', strategy: '', request: {}, headers }
}

describe('AuthManager — strategy registration', () => {
  it('registers strategies and tracks the default', async () => {
    const manager = new AuthManager()
    const jwt = fakeStrategy('jwt', AuthStrategyType.JWT)

    await manager.registerStrategy(jwt, { strategy: 'jwt', options: {} })

    expect(manager.getStrategy('jwt')).toBe(jwt)
    expect(manager.getRegisteredStrategies()).toEqual(['jwt'])
    expect(manager.getStats()).toEqual({
      registeredStrategies: 1,
      strategyNames: ['jwt'],
      defaultStrategy: 'jwt',
    })
  })

  it('honors isDefault when registering multiple strategies', async () => {
    const manager = new AuthManager()
    await manager.registerStrategy(fakeStrategy('jwt', AuthStrategyType.JWT), {
      strategy: 'jwt',
      options: {},
    })
    await manager.registerStrategy(fakeStrategy('api-key', AuthStrategyType.API_KEY), {
      strategy: 'api-key',
      options: { isDefault: true },
    })

    expect(manager.getStats().defaultStrategy).toBe('api-key')
  })

  it('wraps initialization failures in STRATEGY_REGISTRATION_FAILED', async () => {
    const manager = new AuthManager()
    const broken = fakeStrategy('broken', AuthStrategyType.JWT)
    ;(broken.initialize as any).mockRejectedValue(new Error('bad config'))

    await expect(
      manager.registerStrategy(broken, { strategy: 'broken', options: {} })
    ).rejects.toMatchObject({ code: 'STRATEGY_REGISTRATION_FAILED' })
    expect(manager.getStrategy('broken')).toBeUndefined()
  })
})

describe('AuthManager — strategy selection', () => {
  it('auto-detects jwt from Bearer header and api-key from x-api-key', async () => {
    const manager = new AuthManager()
    const jwt = fakeStrategy('jwt', AuthStrategyType.JWT)
    const apiKey = fakeStrategy('api-key', AuthStrategyType.API_KEY)
    await manager.registerStrategy(jwt, { strategy: 'jwt', options: {} })
    await manager.registerStrategy(apiKey, { strategy: 'api-key', options: {} })

    await manager.authenticate(context({ authorization: 'Bearer tok' }))
    expect(jwt.authenticate).toHaveBeenCalled()

    await manager.authenticate(context({ 'x-api-key': 'ak_x' }))
    expect(apiKey.authenticate).toHaveBeenCalled()
  })

  it('prefers the explicit strategyName over detection', async () => {
    const manager = new AuthManager()
    const jwt = fakeStrategy('jwt', AuthStrategyType.JWT)
    const apiKey = fakeStrategy('api-key', AuthStrategyType.API_KEY)
    await manager.registerStrategy(jwt, { strategy: 'jwt', options: {} })
    await manager.registerStrategy(apiKey, { strategy: 'api-key', options: {} })

    await manager.authenticate(context({ 'x-api-key': 'ak_x' }), 'jwt')
    expect(jwt.authenticate).toHaveBeenCalled()
    expect(apiKey.authenticate).not.toHaveBeenCalled()
  })

  it('falls back to the default strategy when detection fails', async () => {
    const manager = new AuthManager({ defaultStrategy: 'jwt' })
    const jwt = fakeStrategy('jwt', AuthStrategyType.JWT)
    await manager.registerStrategy(jwt, { strategy: 'jwt', options: {} })

    await manager.authenticate(context({}))
    expect(jwt.authenticate).toHaveBeenCalled()
  })

  it('returns a failure when no strategy matches', async () => {
    const manager = new AuthManager()
    const result = await manager.authenticate(context({}))
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/No suitable authentication strategy/)
  })
})

describe('AuthManager — result handling', () => {
  it('persists session data on successful authentication', async () => {
    const storage = new FakeTokenStorage()
    const manager = new AuthManager({ tokenStorage: storage })
    const result = {
      success: true,
      user: { id: 'u1' } as User,
      tokens: { accessToken: 'a', refreshToken: 'r', expiresIn: 60, tokenType: 'Bearer' as const },
    }
    await manager.registerStrategy(fakeStrategy('jwt', AuthStrategyType.JWT, result), {
      strategy: 'jwt',
      options: {},
    })

    const authResult = await manager.authenticate(context({}))
    expect(authResult.success).toBe(true)

    const sessionKeys = storage.keys()
    expect(sessionKeys.some((k) => k.startsWith('session:u1:'))).toBe(true)
  })

  it('wraps strategy failures with the error code in metadata', async () => {
    const manager = new AuthManager()
    const failing = fakeStrategy('jwt', AuthStrategyType.JWT)
    ;(failing.authenticate as any).mockRejectedValue(
      new AuthError('expired', 'TOKEN_EXPIRED', 401)
    )
    await manager.registerStrategy(failing, { strategy: 'jwt', options: {} })

    const result = await manager.authenticate(context({}))
    expect(result.success).toBe(false)
    expect(result.error).toBe('expired')
    expect(result.metadata?.error).toBe('TOKEN_EXPIRED')
  })

  it('delegates validate and wraps failures', async () => {
    const manager = new AuthManager()
    const jwt = fakeStrategy('jwt', AuthStrategyType.JWT)
    await manager.registerStrategy(jwt, { strategy: 'jwt', options: {} })

    await manager.validate('token', context({}))
    expect(jwt.validate).toHaveBeenCalledWith('token', expect.anything())

    ;(jwt.validate as any).mockRejectedValue(new Error('boom'))
    const failed = await manager.validate('token', context({}))
    expect(failed.success).toBe(false)
    expect(failed.error).toBe('boom')
  })

  it('reports refresh as unsupported when the strategy lacks it', async () => {
    const manager = new AuthManager()
    const strategy = fakeStrategy('jwt', AuthStrategyType.JWT)
    delete (strategy as any).refresh
    await manager.registerStrategy(strategy, { strategy: 'jwt', options: {} })

    const result = await manager.refresh('r', context({}))
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not supported/)
  })

  it('revoke delegates to the strategy and cleans sessions', async () => {
    const storage = new FakeTokenStorage()
    const manager = new AuthManager({ tokenStorage: storage })
    const jwt = fakeStrategy('jwt', AuthStrategyType.JWT)
    await manager.registerStrategy(jwt, { strategy: 'jwt', options: {} })

    expect(await manager.revoke('tok', context({}))).toBe(true)
    expect(jwt.revoke).toHaveBeenCalledWith('tok', expect.anything())
  })
})
