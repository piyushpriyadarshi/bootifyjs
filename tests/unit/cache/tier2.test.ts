import { beforeEach, describe, expect, it } from 'vitest'
import { CacheService } from '../../../src/cache/cache.service'
import { InMemoryCacheStore } from '../../../src/cache/stores/in-memory-cache.store'
import { RedisCacheStore } from '../../../src/cache/stores/redis-cache.store'
import type { CacheRedisClient } from '../../../src/cache/stores/redis-client'
import { FakeRedisClient } from '../../../src/testing/fakes'

describe('B1 — atomic tag indexes via Redis sets', () => {
  let client: FakeRedisClient
  let store: RedisCacheStore
  let svc: CacheService

  beforeEach(() => {
    client = new FakeRedisClient()
    store = new RedisCacheStore({ client })
    svc = new CacheService(store)
  })

  it('indexes tags with SADD + EXPIRE and flushes them', async () => {
    await svc.set('entry:a', { v: 1 }, 300, ['user:u1'])
    await svc.set('entry:b', { v: 2 }, 300, ['user:u1'])

    expect(client.rawSet('cache:__bc:tag:user:u1').sort()).toEqual(['entry:a', 'entry:b'])
    expect(await client.ttl('cache:__bc:tag:user:u1')).toBeGreaterThan(0)

    const deleted = await svc.flushTags('user:u1')
    expect(deleted).toBe(2)
    expect(await svc.get('entry:a')).toBeUndefined()
    expect(await svc.get('entry:b')).toBeUndefined()
    expect(client.rawSet('cache:__bc:tag:user:u1')).toEqual([])
  })

  it('does not lose members under concurrent appends from two instances (G8)', async () => {
    const svcA = new CacheService(store)
    const svcB = new CacheService(store)

    await Promise.all([
      ...Array.from({ length: 10 }, (_, i) => svcA.set(`a:${i}`, i, 60, ['shared'])),
      ...Array.from({ length: 10 }, (_, i) => svcB.set(`b:${i}`, i, 60, ['shared'])),
    ])

    const members = client.rawSet('cache:__bc:tag:shared')
    expect(members).toHaveLength(20)
  })

  it('self-heals a legacy JSON-string index (WRONGTYPE → DEL + retry)', async () => {
    // pre-existing index from the RMW era
    await client.set('cache:__bc:tag:legacy', JSON.stringify(['old:entry']))

    await svc.set('new:entry', 'v', 60, ['legacy'])

    expect(client.rawSet('cache:__bc:tag:legacy')).toEqual(['new:entry'])
    expect(await svc.get('new:entry')).toBe('v')
  })

  it('falls back to RMW when the client has no set primitives', async () => {
    const data = new Map<string, string>()
    const bare: CacheRedisClient = {
      get: async (k) => data.get(k) ?? null,
      set: async (k, v) => {
        data.set(k, v)
        return 'OK'
      },
      del: async (k) => (data.delete(k) ? 1 : 0),
    }
    const bareStore = new RedisCacheStore({ client: bare })
    const bareSvc = new CacheService(bareStore)

    expect(await bareStore.supportsTagSets()).toBe(false)

    await bareSvc.set('entry:x', 'v', 60, ['tag:x'])
    expect(JSON.parse(data.get('cache:__bc:tag:tag:x')!)).toEqual(['entry:x'])
    expect(await bareSvc.flushTags('tag:x')).toBe(1)
    expect(await bareSvc.get('entry:x')).toBeUndefined()
  })
})

describe('B1 — in-memory tags stay exact via the RMW path', () => {
  it('concurrent appends on the shared singleton never lose members', async () => {
    const store = new InMemoryCacheStore()
    const svc = new CacheService(store)

    await Promise.all(
      Array.from({ length: 20 }, (_, i) => svc.set(`entry:${i}`, i, 60, ['shared']))
    )

    expect(await svc.flushTags('shared')).toBe(20)
  })
})

describe('B2 — mget / mset', () => {
  it('Redis store: mget preserves input order and maps misses to undefined', async () => {
    const client = new FakeRedisClient()
    const svc = new CacheService(new RedisCacheStore({ client }))

    await svc.mset([
      { key: 'a', value: 1 },
      { key: 'b', value: { deep: true }, ttlInSeconds: 60 },
    ])

    expect(await svc.mget(['a', 'b', 'missing'])).toEqual([1, { deep: true }, undefined])
    expect(await svc.mget([])).toEqual([])
  })

  it('Redis store: mset indexes tags for every entry', async () => {
    const client = new FakeRedisClient()
    const svc = new CacheService(new RedisCacheStore({ client }))

    await svc.mset([
      { key: 'a', value: 1, tags: ['batch'] },
      { key: 'b', value: 2, tags: ['batch'] },
    ])

    expect(client.rawSet('cache:__bc:tag:batch').sort()).toEqual(['a', 'b'])
    expect(await svc.flushTags('batch')).toBe(2)
  })

  it('falls back to loops on a store without batch methods (same observable state)', async () => {
    const store = new InMemoryCacheStore()
    const svc = new CacheService(store)

    await svc.mset([
      { key: 'x', value: 'one', ttlInSeconds: 60 },
      { key: 'y', value: 'two', tags: ['t'] },
    ])

    expect(await svc.mget(['x', 'y', 'z'])).toEqual(['one', 'two', undefined])
    expect(await svc.flushTags('t')).toBe(1)
  })
})
