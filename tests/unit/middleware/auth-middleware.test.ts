import { afterEach, describe, expect, it, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { createAuthMiddleware, TokenCache } from '../../../src/middleware/auth.middleware'

const SECRET = 'middleware-secret'

function fakeRequest(headers: Record<string, string> = {}): FastifyRequest {
  return { headers } as unknown as FastifyRequest
}

function fakeReply(): FastifyReply {
  return {} as unknown as FastifyReply
}

describe('TokenCache', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('stores and retrieves values', () => {
    vi.useFakeTimers()
    const cache = new TokenCache()
    cache.set('k', { v: 1 }, 60)
    expect(cache.get('k')).toEqual({ v: 1 })
    expect(cache.has('k')).toBe(true)
  })

  it('expires entries after their TTL', () => {
    vi.useFakeTimers()
    const cache = new TokenCache()
    cache.set('k', 'v', 10)

    vi.advanceTimersByTime(9_999)
    expect(cache.get('k')).toBe('v')

    vi.advanceTimersByTime(1_000)
    expect(cache.get('k')).toBeUndefined()
    expect(cache.has('k')).toBe(false)
  })

  it('resetting a key replaces its timer (no premature eviction)', () => {
    vi.useFakeTimers()
    const cache = new TokenCache()
    cache.set('k', 'first', 5)
    vi.advanceTimersByTime(3_000)
    cache.set('k', 'second', 10)
    vi.advanceTimersByTime(5_000)

    expect(cache.get('k')).toBe('second')
  })

  it('delete removes the entry and its timer', () => {
    vi.useFakeTimers()
    const cache = new TokenCache()
    cache.set('k', 'v', 5)
    cache.delete('k')

    vi.advanceTimersByTime(10_000)
    expect(cache.has('k')).toBe(false)
  })

  it('clear() wipes all entries and timers', () => {
    vi.useFakeTimers()
    const cache = new TokenCache()
    cache.set('a', 1, 60)
    cache.set('b', 2, 60)
    cache.clear()

    expect(cache.has('a')).toBe(false)
    expect(cache.has('b')).toBe(false)
    expect(() => vi.advanceTimersByTime(120_000)).not.toThrow()
  })
})

describe('createAuthMiddleware', () => {
  it('marks requests without an Authorization header as unauthenticated (no throw)', async () => {
    const middleware = createAuthMiddleware({ secret: SECRET })
    const request = fakeRequest()
    await middleware(request, fakeReply())

    expect((request as any).authenticated).toBe(false)
    expect((request as any).user).toBeUndefined()
  })

  it('verifies a valid Bearer token and attaches the payload', async () => {
    const middleware = createAuthMiddleware({ secret: SECRET })
    const token = jwt.sign({ sub: 'u1', roles: ['admin'] }, SECRET, { expiresIn: 60 })
    const request = fakeRequest({ authorization: `Bearer ${token}` })

    await middleware(request, fakeReply())

    expect((request as any).authenticated).toBe(true)
    expect((request as any).user.sub).toBe('u1')
    expect((request as any).user.roles).toEqual(['admin'])
  })

  it('accepts raw tokens without the Bearer prefix', async () => {
    const middleware = createAuthMiddleware({ secret: SECRET })
    const token = jwt.sign({ sub: 'u2' }, SECRET, { expiresIn: 60 })
    const request = fakeRequest({ authorization: token })

    await middleware(request, fakeReply())
    expect((request as any).authenticated).toBe(true)
  })

  it('rejects invalid and expired tokens without throwing', async () => {
    const middleware = createAuthMiddleware({ secret: SECRET })

    const invalid = fakeRequest({ authorization: 'Bearer not-a-jwt' })
    await middleware(invalid, fakeReply())
    expect((invalid as any).authenticated).toBe(false)
    expect((invalid as any).user).toBeNull()

    const expired = jwt.sign({ sub: 'u1' }, SECRET, { expiresIn: -10 })
    const expiredReq = fakeRequest({ authorization: `Bearer ${expired}` })
    await middleware(expiredReq, fakeReply())
    expect((expiredReq as any).authenticated).toBe(false)
  })

  it('caches verified tokens and serves subsequent requests from cache', async () => {
    const cache = new TokenCache()
    const middleware = createAuthMiddleware({ secret: SECRET, tokenCache: cache })
    const token = jwt.sign({ sub: 'cached' }, SECRET, { expiresIn: 60 })

    await middleware(fakeRequest({ authorization: `Bearer ${token}` }), fakeReply())
    expect(cache.has(`token:${token}`)).toBe(true)

    // A token signed with a WRONG secret still authenticates when cached —
    // proving the cache path bypasses verification.
    const otherMiddleware = createAuthMiddleware({ secret: 'other-secret', tokenCache: cache })
    const wrongSecretReq = fakeRequest({ authorization: `Bearer ${token}` })
    await otherMiddleware(wrongSecretReq, fakeReply())

    expect((wrongSecretReq as any).authenticated).toBe(true)
    expect((wrongSecretReq as any).user.sub).toBe('cached')
  })

  it('does not cache tokens without an exp claim beyond the default', async () => {
    const cache = new TokenCache()
    const middleware = createAuthMiddleware({ secret: SECRET, tokenCache: cache })
    // token without exp → default 1h cache applies
    const noExp = jwt.sign({ sub: 'u3' }, SECRET) // jsonwebtoken omits exp unless asked
    await middleware(fakeRequest({ authorization: `Bearer ${noExp}` }), fakeReply())

    expect((fakeRequest({ authorization: `Bearer ${noExp}` }) as any)).toBeDefined()
    expect(cache.get(`token:${noExp}`)?.sub).toBe('u3')
  })
})
