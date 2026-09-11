import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InMemoryCacheStore } from '../../../src/cache/stores/in-memory-cache.store'
import { RedisCacheStore } from '../../../src/cache/stores/redis-cache.store'
import { generateCacheKey, Cacheable, CacheEvict } from '../../../src/cache/decorators'
import { CacheService } from '../../../src/cache/cache.service'
import { CACHE_STORE_TOKEN, isCacheStore } from '../../../src/cache/cache.types'
import { bootstrapCache } from '../../../src/cache/bootstrap'
import { CacheConnectionError, CacheError } from '../../../src/cache/errors'
import { container } from '../../../src/core/di-container'
import type { CacheRedisClient } from '../../../src/cache/stores/redis-client'

function fakeRedis() {
  const data = new Map<string, string>()
  const listeners: Array<(error: Error) => void> = []
  const client: CacheRedisClient = {
    get: vi.fn(async (k) => data.get(k) ?? null),
    set: vi.fn(async (k, v) => {
      data.set(k, v)
      return 'OK'
    }),
    del: vi.fn(async (k) => data.delete(k) ? 1 : 0),
    ping: vi.fn(async () => 'PONG'),
    on: vi.fn((_event: 'error', listener: (error: Error) => void) => {
      listeners.push(listener)
    }),
  }
  const emit = (error: Error) => listeners.forEach((listener) => listener(error))
  return { client, data, emit }
}

describe('InMemoryCacheStore', () => {
  it('stores, gets and deletes values', async () => {
    const store = new InMemoryCacheStore()
    await store.set('k', { v: 1 })
    expect(await store.get('k')).toEqual({ v: 1 })
    await store.del('k')
    expect(await store.get('k')).toBeUndefined()
  })

  it('expires entries after their TTL', async () => {
    vi.useFakeTimers()
    const store = new InMemoryCacheStore()
    await store.set('k', 'fresh', 10)

    vi.advanceTimersByTime(9_000)
    expect(await store.get('k')).toBe('fresh')

    vi.advanceTimersByTime(1_000)
    expect(await store.get('k')).toBeUndefined()
    vi.useRealTimers()
  })

  it('reports healthy', async () => {
    expect(await new InMemoryCacheStore().healthCheck()).toBe(true)
  })

  it('evicts the least-recently-used entry when maxEntries is reached (A2)', async () => {
    const store = new InMemoryCacheStore({ maxEntries: 2 })
    await store.set('a', 1)
    await store.set('b', 2)

    // touch 'a' so 'b' becomes the LRU entry
    expect(await store.get('a')).toBe(1)

    await store.set('c', 3)
    expect(await store.get('b')).toBeUndefined() // evicted
    expect(await store.get('a')).toBe(1)
    expect(await store.get('c')).toBe(3)
  })

  it('updating an existing key at capacity refreshes recency without evicting (A2)', async () => {
    const store = new InMemoryCacheStore({ maxEntries: 2 })
    await store.set('a', 1)
    await store.set('b', 2)

    await store.set('a', 10) // update, no capacity cost
    await store.set('c', 3)  // evicts 'b' (now the LRU)

    expect(await store.get('a')).toBe(10)
    expect(await store.get('b')).toBeUndefined()
    expect(await store.get('c')).toBe(3)
  })

  it('maxEntries omitted means unlimited (A2/⚖️9)', async () => {
    const store = new InMemoryCacheStore()
    for (let i = 0; i < 50; i++) await store.set(`k${i}`, i)
    expect(await store.get('k0')).toBe(0)
    expect(await store.get('k49')).toBe(49)
  })

  it('rejects invalid maxEntries (A2)', () => {
    for (const bad of [0, -1, 1.5, NaN]) {
      expect(() => new InMemoryCacheStore({ maxEntries: bad })).toThrow(/maxEntries must be a positive integer/)
    }
  })

  it('normalizes TTL: 0/undefined mean no expiry (A4)', async () => {
    vi.useFakeTimers()
    const store = new InMemoryCacheStore()
    await store.set('zero', 'v', 0)
    await store.set('undef', 'v')

    vi.advanceTimersByTime(10 * 24 * 3600 * 1000) // 10 days
    expect(await store.get('zero')).toBe('v')
    expect(await store.get('undef')).toBe('v')
    vi.useRealTimers()
  })

  it('rejects negative TTL (A4)', async () => {
    const store = new InMemoryCacheStore()
    await expect(store.set('k', 'v', -1)).rejects.toThrow(/ttlInSeconds must be >= 0/)
  })
})

describe('RedisCacheStore', () => {
  it('requires an app-owned client at construction (A5)', () => {
    expect(() => new RedisCacheStore()).toThrow(CacheConnectionError)
    expect(() => new RedisCacheStore()).toThrow(/app-owned client/)
  })

  it('rejects client + clientFactory together (A5)', () => {
    const { client } = fakeRedis()
    expect(
      () => new RedisCacheStore({ client, clientFactory: async () => client })
    ).toThrow(/either `client` or `clientFactory`, not both/)
  })

  it('serializes values and namespaces keys under cache:', async () => {
    const { client, data } = fakeRedis()
    const store = new RedisCacheStore({ clientFactory: async () => client })

    await store.set('user:1', { name: 'Piyush' })
    expect(data.get('cache:user:1')).toBe(JSON.stringify({ name: 'Piyush' }))
    expect(await store.get<{ name: string }>('user:1')).toEqual({ name: 'Piyush' })
    expect(await store.get('missing')).toBeUndefined()

    await store.del('user:1')
    expect(await store.get('user:1')).toBeUndefined()
    expect(client.del).toHaveBeenCalledWith('cache:user:1')
  })

  it('passes TTL as EX to the SET command', async () => {
    const { client } = fakeRedis()
    const store = new RedisCacheStore({ clientFactory: async () => client })

    await store.set('k', 'v', 60)
    expect(client.set).toHaveBeenCalledWith('cache:k', JSON.stringify('v'), 'EX', 60)
  })

  it('normalizes TTL: 0/undefined skip EX, negative throws (A4)', async () => {
    const { client } = fakeRedis()
    const store = new RedisCacheStore({ clientFactory: async () => client })

    await store.set('a', 'v', 0)
    await store.set('b', 'v')
    expect(client.set).toHaveBeenCalledWith('cache:a', JSON.stringify('v'))
    expect(client.set).toHaveBeenCalledWith('cache:b', JSON.stringify('v'))

    await expect(store.set('c', 'v', -5)).rejects.toThrow(/ttlInSeconds must be >= 0/)
  })

  it('healthCheck pings the client', async () => {
    const healthy = fakeRedis()
    const down = fakeRedis()
    down.client.ping = vi.fn(async () => {
      throw new Error('connection refused')
    })

    expect(await new RedisCacheStore({ clientFactory: async () => healthy.client }).healthCheck()).toBe(true)
    expect(await new RedisCacheStore({ clientFactory: async () => down.client }).healthCheck()).toBe(false)
  })

  it('records client error events without throwing and reports unhealthy (A3)', async () => {
    const { client, emit } = fakeRedis()
    // no ping → healthCheck reflects the recorded error state directly
    client.ping = undefined
    const onError = vi.fn()
    const store = new RedisCacheStore({ clientFactory: async () => client, onError })

    // wait for the store to adopt the client (factory path attaches on first use)
    await store.get('warmup')

    const boom = new Error('connection reset')
    expect(() => emit(boom)).not.toThrow()
    expect(onError).toHaveBeenCalledWith(boom)
    expect(await store.healthCheck()).toBe(false)

    // a successful op clears the recorded error
    await store.get('warmup')
    expect(await store.healthCheck()).toBe(true)
  })

  it('wraps client failures in CacheError with the operation', async () => {
    const { client } = fakeRedis()
    client.get = vi.fn(async () => {
      throw new Error('REDIS DOWN')
    })
    const store = new RedisCacheStore({ clientFactory: async () => client })

    await expect(store.get('k')).rejects.toThrow(CacheError)
    await expect(store.get('k')).rejects.toThrow(/REDIS DOWN/)
  })
})

describe('generateCacheKey', () => {
  it('builds deterministic keys from arguments', () => {
    expect(generateCacheKey('base', [])).toBe('base::')
    expect(generateCacheKey('base', [1])).toBe('base::1')
    expect(generateCacheKey('base', [{ a: 1 }])).toBe('base::{"a":1}')
    expect(generateCacheKey('base', [{ a: 1 }, 'x'])).toBe('base::{"a":1}:"x"')
  })

  it('handles circular references without throwing', () => {
    const circular: any = { self: undefined }
    circular.self = circular
    expect(generateCacheKey('c', [circular])).toBe('c::{"self":"<circular>"}')
  })

  it('is property-ORDER insensitive for object arguments', () => {
    const a = generateCacheKey('k', [{ name: 'x', role: 'admin' }])
    const b = generateCacheKey('k', [{ role: 'admin', name: 'x' }])
    expect(a).toBe(b) // logically equal arguments -> same cache entry
  })

  it('hashes long keys (big object arguments) deterministically', () => {
    const big = { blob: 'x'.repeat(4096), nested: { deep: [1, 2, 3] } }
    const key = generateCacheKey('report.monthly', [big])

    // small, stable, deterministic — never the raw payload
    expect(key.startsWith('report.monthly::sha256:')).toBe(true)
    expect(key).toBe(generateCacheKey('report.monthly', [big]))
    expect(key.length).toBeLessThan(100) // 'report.monthly::sha256:' + 64 hex chars

    // different payload -> different hash
    const other = generateCacheKey('report.monthly', [{ blob: 'y' }])
    expect(other).not.toBe(key)
  })

  it('keeps Date arguments as ISO strings and undefined as a stable token', () => {
    const date = new Date('2026-01-01T00:00:00.000Z')
    expect(generateCacheKey('d', [date])).toBe('d::"2026-01-01T00:00:00.000Z"')
    expect(generateCacheKey('u', [undefined])).toBe('u::undefined')
  })
})

describe('@Cacheable / @CacheEvict', () => {
  // CacheService is a cached global singleton — bind a factory per test so
  // the decorators resolve a CacheService wired to THIS test's store.
  let store: InMemoryCacheStore

  beforeEach(() => {
    store = new InMemoryCacheStore()
    container.register(CACHE_STORE_TOKEN, { useFactory: () => store, override: true })
    container.register(CacheService, { useFactory: () => new CacheService(store), override: true })
  })

  afterEach(() => {
    container.unregister(CacheService)
    container.unregister(CACHE_STORE_TOKEN)
  })

  it('caches method results (second call is a hit, underlying fn runs once)', async () => {
    const underlying = vi.fn().mockResolvedValue({ result: 42 })

    class calc {
      @Cacheable({ key: 'calc' })
      async compute(input: number) {
        return underlying(input)
      }
    }

    const svc = new calc()
    const first = await svc.compute(1)
    const second = await svc.compute(1)

    expect(first).toEqual({ result: 42 })
    expect(second).toEqual({ result: 42 })
    expect(underlying).toHaveBeenCalledTimes(1)

    // different args -> different key -> miss
    await svc.compute(2)
    expect(underlying).toHaveBeenCalledTimes(2)
  })

  it('@CacheEvict removes the cached entry after the method succeeds', async () => {
    class writer {
      @Cacheable({ key: 'writer' })
      async read() {
        return 'value'
      }

      @CacheEvict({ key: 'writer' })
      async invalidate() {
        return 'done'
      }
    }

    const svc = new writer()
    await svc.read()
    expect(await store.get('writer::')).toBe('value')

    await svc.invalidate()
    expect(await store.get('writer::')).toBeUndefined()
  })
})

describe('bootstrapCache', () => {
  it('binds the default store when nothing is registered', () => {
    container.unregister(CACHE_STORE_TOKEN)

    const unbootstrap = bootstrapCache()

    expect(container.isRegistered(CACHE_STORE_TOKEN)).toBe(true)
    expect(isCacheStore(container.resolve(CACHE_STORE_TOKEN))).toBe(true)

    unbootstrap()
    expect(container.isRegistered(CACHE_STORE_TOKEN)).toBe(false)
  })

  it('is a no-op when a custom store is already bound', () => {
    const custom = new InMemoryCacheStore()
    container.register(CACHE_STORE_TOKEN, { useFactory: () => custom, override: true })

    const unbootstrap = bootstrapCache()
    expect(container.resolve(CACHE_STORE_TOKEN)).toBe(custom)

    unbootstrap()
    expect(container.isRegistered(CACHE_STORE_TOKEN)).toBe(true)
    container.unregister(CACHE_STORE_TOKEN)
  })
})

describe('CacheService', () => {
  it('delegates to the bound store', async () => {
    const store = new InMemoryCacheStore()
    const svc = new CacheService(store)

    await svc.set('k', 'v')
    expect(await svc.get('k')).toBe('v')
    await svc.del('k')
    expect(await svc.get('k')).toBeUndefined()
  })
})

describe('key customization', () => {
  it('generateCacheKey honors the hashArgs option (PII never reaches keys)', () => {
    const key = generateCacheKey('profile', ['u1', { ssn: '123-45-6789' }], { hashArgs: true })
    expect(key.startsWith('profile::sha256:')).toBe(true)
    expect(key).not.toContain('ssn')
    expect(key).not.toContain('123-45-6789')

    // without the option, small keys stay readable
    expect(generateCacheKey('profile', ['u1'])).toBe('profile::"u1"')
  })

  it('keyBuilder fully overrides the key format', async () => {
    container.register(CACHE_STORE_TOKEN, { useFactory: () => new InMemoryCacheStore(), override: true })
    container.register(CacheService, {
      useFactory: () => new CacheService(new InMemoryCacheStore()),
      override: true,
    })

    const underlying = vi.fn().mockResolvedValue('result')
    const productKey = (args: any[]) => `product:${args[0]}` // readable, no JSON quoting

    class Catalog {
      @Cacheable({ keyBuilder: productKey, ttl: 60 })
      async get(productId: string) {
        return underlying(productId)
      }

      @CacheEvict({ keyBuilder: productKey })
      async invalidate(productId: string) {
        return 'done'
      }
    }

    const svc = new Catalog()
    await svc.get('p-42')
    await svc.get('p-42')
    expect(underlying).toHaveBeenCalledTimes(1) // cached under the custom key

    await svc.invalidate('p-42')
    await svc.get('p-42')
    expect(underlying).toHaveBeenCalledTimes(2) // evicted via the SAME builder
  })

  it('keyBuilder with hashArgs-style privacy: args never hit the key', async () => {
    const capturedKeys: string[] = []
    const spyStore = new InMemoryCacheStore()
    const origSet = spyStore.set.bind(spyStore)
    spyStore.set = async (key: string, value: any, ttl?: number) => {
      capturedKeys.push(key)
      return origSet(key, value, ttl)
    }
    container.register(CACHE_STORE_TOKEN, { useFactory: () => spyStore, override: true })
    container.register(CacheService, {
      useFactory: () => new CacheService(spyStore), // SAME instance the spy wraps
      override: true,
    })

    class Sensitive {
      @Cacheable({ keyBuilder: () => 'sensitive:hashed', ttl: 10 })
      async load(_secret: string) {
        return 'payload'
      }
    }

    await new Sensitive().load('top-secret-value')
    expect(capturedKeys).toEqual(['sensitive:hashed'])
    expect(capturedKeys[0]).not.toContain('top-secret')

    container.unregister(CacheService)
    container.unregister(CACHE_STORE_TOKEN)
  })

  it('rejects keyBuilder results that are not non-empty strings', async () => {
    container.register(CACHE_STORE_TOKEN, { useFactory: () => new InMemoryCacheStore(), override: true })
    container.register(CacheService, {
      useFactory: () => new CacheService(new InMemoryCacheStore()),
      override: true,
    })

    class Broken {
      @Cacheable({ keyBuilder: () => '' })
      async load() {
        return 'x'
      }
    }

    // the wrapper is async — the rejection surfaces through the promise
    await expect(new Broken().load()).rejects.toThrow(/keyBuilder must return a non-empty string/)

    container.unregister(CacheService)
    container.unregister(CACHE_STORE_TOKEN)
  })
})
