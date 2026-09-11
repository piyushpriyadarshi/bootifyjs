import { describe, expect, it } from 'vitest'
import { RedisTokenStorage } from '../../../src/auth/storage/RedisTokenStorage'
import { FakeRedisClient } from '../../helpers/fakes'

function makeStorage(overrides: Record<string, any> = {}) {
  const client = new FakeRedisClient()
  const storage = new RedisTokenStorage({ client, ...overrides })
  return { client, storage }
}

describe('RedisTokenStorage — core operations', () => {
  it('stores and retrieves JSON-serializable values with a key prefix', async () => {
    const { client, storage } = makeStorage()

    await storage.store('token:abc', { userId: 'u1', roles: ['admin'] })
    expect(await storage.get('token:abc')).toEqual({ userId: 'u1', roles: ['admin'] })
    expect(client.raw('auth:token:abc')).toBe(JSON.stringify({ userId: 'u1', roles: ['admin'] }))
  })

  it('returns null for missing keys', async () => {
    const { storage } = makeStorage()
    expect(await storage.get('missing')).toBeNull()
  })

  it('applies per-entry TTL and default TTL', async () => {
    const { client, storage } = makeStorage({ defaultTTL: 120 })

    await storage.store('with-ttl', 'x', 30)
    await storage.store('default-ttl', 'y')
    expect(await client.ttl('auth:with-ttl')).toBeGreaterThan(0)
    expect(await client.ttl('auth:with-ttl')).toBeLessThanOrEqual(30)
    expect(await client.ttl('auth:default-ttl')).toBeLessThanOrEqual(120)
    expect(await client.ttl('auth:default-ttl')).toBeGreaterThan(0)
  })

  it('delete removes and exists reflects presence', async () => {
    const { storage } = makeStorage()
    await storage.store('k', { v: 1 })

    expect(await storage.exists('k')).toBe(true)
    await storage.delete('k')
    expect(await storage.exists('k')).toBe(false)
    expect(await storage.get('k')).toBeNull()
  })

  it('setTTL/getTTL manage expiry on existing keys', async () => {
    const { storage } = makeStorage()
    await storage.store('k', 'v')

    await storage.setTTL('k', 60)
    const ttl = await storage.getTTL('k')
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(60)
  })
})

describe('RedisTokenStorage — batch operations', () => {
  it('storeBatch/getBatch/deleteBatch handle multiple keys', async () => {
    const { storage } = makeStorage()

    await storage.storeBatch([
      { key: 'a', value: { n: 1 }, ttl: 60 },
      { key: 'b', value: { n: 2 } },
    ])
    expect(await storage.getBatch(['a', 'b', 'missing'])).toEqual({
      a: { n: 1 },
      b: { n: 2 },
      missing: null,
    })

    await storage.deleteBatch(['a', 'b'])
    expect(await storage.exists('a')).toBe(false)
    expect(await storage.exists('b')).toBe(false)
  })
})

describe('RedisTokenStorage — serializers and errors', () => {
  it('supports a custom serializer', async () => {
    const { client, storage } = makeStorage({
      serializer: {
        serialize: (v: any) => Buffer.from(JSON.stringify(v)).toString('base64'),
        deserialize: (v: string) => JSON.parse(Buffer.from(v, 'base64').toString()),
      },
    })

    await storage.store('encoded', { hello: 'world' })
    expect(client.raw('auth:encoded')).not.toContain('hello')
    expect(await storage.get('encoded')).toEqual({ hello: 'world' })
  })

  it('wraps client failures with operation context', async () => {
    const client = new FakeRedisClient()
    client.failingOps = new Set(['get'])
    const storage = new RedisTokenStorage({ client })

    await expect(storage.get('k')).rejects.toThrow(/Failed to get value from Redis/)
  })

  it('wraps store failures', async () => {
    const client = new FakeRedisClient()
    client.failingOps = new Set(['set'])
    const storage = new RedisTokenStorage({ client })

    await expect(storage.store('k', 'v')).rejects.toThrow(/Failed to store value in Redis/)
  })
})

describe('RedisTokenStorage — health and stats', () => {
  it('reports healthy when read/write/delete succeed', async () => {
    const { storage } = makeStorage()
    expect(await storage.healthCheck()).toEqual({ status: 'healthy' })
    expect(await storage.getStats()).toMatchObject({
      keyPrefix: 'auth:',
      connectionStatus: 'healthy',
    })
  })

  it('reports unhealthy when the client fails', async () => {
    const client = new FakeRedisClient()
    client.failingOps = new Set(['set'])
    const storage = new RedisTokenStorage({ client })

    const health = await storage.healthCheck()
    expect(health.status).toBe('unhealthy')
    expect(health.details).toContain('Health check failed')

    expect((await storage.getStats()).connectionStatus).toBe('unhealthy')
  })
})
