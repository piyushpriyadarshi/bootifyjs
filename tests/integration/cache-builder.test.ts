import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { Cacheable } from '../../src/cache/decorators'
import { CacheService } from '../../src/cache/cache.service'
import { CACHE_STORE_TOKEN } from '../../src/cache/cache.types'
import type { ICacheStore } from '../../src/cache/cache.types'
import { InMemoryCacheStore } from '../../src/cache/stores/in-memory-cache.store'
import { RedisCacheStore } from '../../src/cache/stores/redis-cache.store'
import type { CacheRedisClient } from '../../src/cache/stores/redis-client'
import { createTestApp } from '../../src/testing'
import type { CreateTestAppOptions } from '../../src/testing'
import { container as globalContainer } from '../../src/core/di-container'
import { ConfigValidationError } from '../../src/config/errors'
import { CacheError } from '../../src/cache/errors'

const cleanup: Array<() => Promise<void> | void> = []

afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn()
  cleanup.length = 0
  globalContainer.unregister(CACHE_STORE_TOKEN)
})

afterAll(async () => {
  globalContainer.unregister(CACHE_STORE_TOKEN)
})

async function makeApp(
  setupOrOptions?: CreateTestAppOptions['setup'] | CreateTestAppOptions
) {
  const options: CreateTestAppOptions =
    typeof setupOrOptions === 'function'
      ? { setup: setupOrOptions }
      : { ...(setupOrOptions ?? {}) }
  const app = await createTestApp(options)
  cleanup.push(() => app.close())
  return app
}

function fakeRedis(): CacheRedisClient {
  const data = new Map<string, string>()
  return {
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => {
      data.set(k, v)
      return 'OK'
    },
    del: async (k) => (data.delete(k) ? 1 : 0),
    ping: async () => 'PONG',
  }
}

describe('enableCache — default-ON', () => {
  it('binds InMemoryCacheStore to BOTH containers with zero configuration', async () => {
    const app = await makeApp()

    const storeFromApp = app.container.resolve<any>(CACHE_STORE_TOKEN)
    const storeFromGlobal = globalContainer.resolve<any>(CACHE_STORE_TOKEN)
    expect(storeFromApp).toBeInstanceOf(InMemoryCacheStore)
    expect(storeFromGlobal).toBe(storeFromApp) // dual-container, same instance

    // CacheService is eagerly resolved — and the decorator path works
    const svc = app.container.resolve<CacheService>(CacheService)
    await svc.set('k', 'v')
    expect(await svc.get('k')).toBe('v')
  })

  it('a @Cacheable service just works with zero calls', async () => {
    const underlying = vi.fn().mockResolvedValue({ hello: 'cached' })

    class Svc {
      @Cacheable({ key: 'builder.default', ttl: 60 })
      async load(id: string) {
        return underlying(id)
      }
    }

    const app = await makeApp({
      setup: (_a, c) => c.register(Svc, { useClass: Svc, override: true }),
    })

    const svc = app.container.resolve<Svc>(Svc)
    await svc.load('1')
    await svc.load('1')
    expect(underlying).toHaveBeenCalledTimes(1) // second call served from cache
  })
})

describe('enableCache — custom backends', () => {
  it('store option: your instance is bound to both containers, unmodified', async () => {
    const myStore = new InMemoryCacheStore()
    const app = await makeApp((a) => a.enableCache({ store: myStore }))

    expect(app.container.resolve(CACHE_STORE_TOKEN)).toBe(myStore)
    expect(globalContainer.resolve(CACHE_STORE_TOKEN)).toBe(myStore)
  })

  it('client option: your Redis client is wrapped in RedisCacheStore (no second connection)', async () => {
    const client = fakeRedis()
    const app = await makeApp((a) => a.enableCache({ client }))

    const store = app.container.resolve<ICacheStore>(CACHE_STORE_TOKEN)
    expect(store).toBeInstanceOf(RedisCacheStore)

    await store.set('user:1', { name: 'Piyush' })
    // namespaced under cache: — the client sees the prefixed key
    // (fakeRedis has no introspection here, so verify through the store)
    expect(await store.get('user:1')).toEqual({ name: 'Piyush' })
  })

  it('client option: rejects objects without get/set/del at build', async () => {
    const bad: any = { onlyGet: async () => 'x' }
    await expect(
      makeApp((a) => a.enableCache({ client: bad }))
    ).rejects.toThrow(/expects a Redis client exposing get\/set\/del/)
  })

  it('maxEntries option: binds a bounded default store to both containers', async () => {
    const app = await makeApp((a) => a.enableCache({ maxEntries: 2 }))

    const store = app.container.resolve<ICacheStore>(CACHE_STORE_TOKEN)
    expect(store).toBeInstanceOf(InMemoryCacheStore)
    expect(globalContainer.resolve(CACHE_STORE_TOKEN)).toBe(store)

    await store.set('a', 1)
    await store.set('b', 2)
    await store.set('c', 3) // evicts the oldest ('a')
    expect(await store.get('a')).toBeUndefined()
    expect(await store.get('c')).toBe(3)
  })

  it('maxEntries option: rejects invalid bounds at build', async () => {
    await expect(
      makeApp((a) => a.enableCache({ maxEntries: 0 }))
    ).rejects.toThrow(/maxEntries must be a positive integer/)
  })
})

describe('enableCache — validation', () => {
  it('rejects more than one of store/client/maxEntries', async () => {
    await expect(
      makeApp((a) => a.enableCache({ store: new InMemoryCacheStore(), maxEntries: 5 }))
    ).rejects.toThrow(ConfigValidationError)

    await expect(
      makeApp((a) =>
        a.enableCache({
          store: new InMemoryCacheStore(),
          client: fakeRedis(),
        })
      )
    ).rejects.toThrow(/accepts only ONE of/)

    await expect(
      makeApp((a) => a.enableCache({ client: fakeRedis(), maxEntries: 5 }))
    ).rejects.toThrow(/accepts only ONE of/)
  })
})

describe('disableCache + user-store precedence', () => {
  it('disableCache() keeps a user-registered store fully working', async () => {
    const userStore = new InMemoryCacheStore()
    globalContainer.register(CACHE_STORE_TOKEN, { useFactory: () => userStore })

    const app = await makeApp((a) => a.disableCache())

    // user's manual global binding survived untouched
    const bound = globalContainer.resolve<InMemoryCacheStore>(CACHE_STORE_TOKEN)
    expect(bound).toBe(userStore)

    // and @Cacheable keeps working against it (decorator uses the global container)
    class Works {
      @Cacheable({ key: 'user.store' })
      async load() {
        return 'x'
      }
    }
    const isolated = await createTestApp({ setup: (a) => a.disableCache() })
    cleanup.push(() => isolated.close())
    expect(await new Works().load()).toBe('x')
  })

  it('disableCache() with NO user store: @Cacheable fails with an actionable error', async () => {
    // drop any cached CacheService singleton from earlier tests — the whole
    // point is to observe the unbound state end to end
    globalContainer.unregister(CacheService)
    globalContainer.unregister(CACHE_STORE_TOKEN) // nothing bound anywhere

    const app = await makeApp((a) => a.disableCache())
    expect(globalContainer.isRegistered(CACHE_STORE_TOKEN)).toBe(false)
    expect(app.container.isRegistered(CACHE_STORE_TOKEN)).toBe(false)

    class Unbound {
      @Cacheable({ key: 'nope' })
      async load() {
        return 'x'
      }
    }
    const res = await new Unbound().load().catch((e: Error) => e)
    expect(res).toBeInstanceOf(CacheError)
    expect((res as Error).message).toMatch(/No cache store is bound/)
    expect((res as Error).message).toMatch(/disableCache/)

    // restore the class registration for later suites
    globalContainer.register(CacheService, { useClass: CacheService, override: true })
  })

  it('a user-bound store wins over the default (not clobbered), mirrored across containers', async () => {
    const userStore = new InMemoryCacheStore()
    globalContainer.register(CACHE_STORE_TOKEN, { useFactory: () => userStore })

    const app = await makeApp() // no enableCache call — default path

    expect(globalContainer.resolve<InMemoryCacheStore>(CACHE_STORE_TOKEN)).toBe(userStore)
    expect(app.container.resolve<InMemoryCacheStore>(CACHE_STORE_TOKEN)).toBe(userStore) // mirrored, not replaced
  })

  it('enableCache overrides a user-bound store explicitly (explicit intent wins)', async () => {
    const userStore = new InMemoryCacheStore()
    globalContainer.register(CACHE_STORE_TOKEN, { useFactory: () => userStore })

    const explicit = new RedisCacheStore({ clientFactory: async () => fakeRedis() })
    const app = await makeApp((a) => a.enableCache({ store: explicit }))

    expect(app.container.resolve(CACHE_STORE_TOKEN)).toBe(explicit)
    expect(globalContainer.resolve(CACHE_STORE_TOKEN)).toBe(explicit)
  })
})

describe('cache binding order (singleton freeze)', () => {
  it('binds the store BEFORE controllers/services resolve CacheService', async () => {
    const captured: { store?: unknown; cache?: CacheService } = {}

    class Probe {
      constructor() {
        // runs during registerControllers — the binding must already be done
        captured.store = globalContainer.resolve(CACHE_STORE_TOKEN)
        captured.cache = globalContainer.resolve<CacheService>(CacheService)
      }
    }

    const app = await createTestApp({
      controllers: [Probe],
      setup: (a, c) => c.register(Probe, { useClass: Probe, override: true }),
    })
    cleanup.push(() => app.close())

    expect(captured.store).toBeInstanceOf(InMemoryCacheStore)
    expect(captured.cache).toBeInstanceOf(CacheService)
  })
})
