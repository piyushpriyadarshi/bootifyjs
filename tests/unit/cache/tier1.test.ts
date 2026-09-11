import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  singleFlight,
  SingleFlight,
  SingleFlightReentrancyError,
  stableStringify,
} from '../../../src/commons'
import { generateCacheKey, Cacheable, CachePut, CacheEvict } from '../../../src/cache/decorators'
import { CacheService } from '../../../src/cache/cache.service'
import { CACHE_STORE_TOKEN } from '../../../src/cache/cache.types'
import { InMemoryCacheStore } from '../../../src/cache/stores/in-memory-cache.store'
import { container } from '../../../src/core/di-container'

describe('SingleFlight', () => {
  it('coalesces concurrent callers into ONE execution', async () => {
    const sf = new SingleFlight()
    const fn = vi.fn().mockResolvedValue({ ok: 1 })

    const results = await Promise.all(
      Array.from({ length: 1000 }, () => sf.run('same-key', fn))
    )

    expect(fn).toHaveBeenCalledTimes(1)
    expect(results).toHaveLength(1000)
    expect(results[0]).toBe(results[999]) // identical value shared by identity
  })

  it('followers of a failed leader receive the error; the next caller retries fresh', async () => {
    const sf = new SingleFlight()
    let attempts = 0
    const fn = vi.fn().mockImplementation(async () => {
      attempts++
      if (attempts === 1) throw new Error('boom')
      return 'recovered'
    })

    const first = sf.run('k', fn)
    const second = sf.run('k', fn)
    await expect(first).rejects.toThrow('boom')
    await expect(second).rejects.toThrow('boom')

    const third = await sf.run('k', fn)
    expect(third).toBe('recovered') // failure was not memoized
    expect(fn).toHaveBeenCalledTimes(2) // leader + retry (followers never call fn)
  })

  it('sequential (non-overlapping) calls execute independently', async () => {
    const sf = new SingleFlight()
    const fn = vi.fn().mockResolvedValue('v')

    await sf.run('k', fn)
    await sf.run('k', fn)

    expect(fn).toHaveBeenCalledTimes(2) // notebook wiped between calls
  })

  it('different keys are independent flights', async () => {
    const sf = new SingleFlight()
    const fn = vi.fn().mockImplementation(async (key: string) => key)

    await Promise.all([sf.run('a', () => fn('a')), sf.run('b', () => fn('b'))])

    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('clear() mid-flight forgets the ticket; the leader still completes', async () => {
    const sf = new SingleFlight()
    const fn = vi.fn().mockResolvedValue('done')

    const promise = sf.run('k', fn)
    sf.clear()
    expect(await promise).toBe('done')

    // a new caller starts a FRESH execution
    await sf.run('k', fn)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('stale-delete guard: a late settle does not delete a newer flight', async () => {
    const sf = new SingleFlight()
    let releaseFirst!: (v: string) => void
    let releaseSecond!: (v: string) => void
    const first = sf.run('k', () => new Promise<string>((r) => (releaseFirst = r)))

    // first flight settled via clear() — entry removed
    sf.clear()

    // second flight starts for the same key (also gated — stays in flight)
    const second = sf.run('k', () => new Promise<string>((r) => (releaseSecond = r)))
    expect(sf.size).toBe(1)

    // the FIRST flight now settles — its finally must NOT delete the
    // SECOND flight's registration (that's the stale-delete guard)
    releaseFirst('late-first')
    await first
    expect(sf.size).toBe(1) // second flight still registered

    // second settles afterwards and cleans itself
    releaseSecond('second')
    expect(await second).toBe('second')
    expect(sf.size).toBe(0)
  })

  it('throws SingleFlightReentrancyError for same-key reentrant loaders', async () => {
    const sf = new SingleFlight()

    await expect(
      sf.run('re', async () => {
        // the loader calls run() with its own key — would deadlock
        return sf.run('re', async () => 1)
      })
    ).rejects.toThrow(SingleFlightReentrancyError)
  })

  it('allows nesting across DIFFERENT keys', async () => {
    const sf = new SingleFlight()

    const result = await sf.run('outer', async () => {
      return sf.run('inner', async () => 'inner-value')
    })

    expect(result).toBe('inner-value')
  })

  it('sync-throwing fn publishes nothing and propagates', async () => {
    const sf = new SingleFlight()
    const throwing = () => {
      throw new Error('sync boom')
    }

    await expect(sf.run('k', throwing as any)).rejects.toThrow('sync boom')
    expect(sf.size).toBe(0) // nothing published
  })

  it('size and keys reflect in-flight state', async () => {
    const sf = new SingleFlight()
    let release!: (v: string) => void
    const gate = new Promise<string>((r) => (release = r))

    const flight = sf.run('in-flight-key', () => gate)
    expect(sf.size).toBe(1)
    expect(sf.keys()).toEqual(['in-flight-key'])

    release('done')
    await flight
    expect(sf.size).toBe(0)

    void gate
  })
})

describe('CacheService.remember / rememberForever', () => {
  let store: InMemoryCacheStore
  let svc: CacheService

  beforeEach(() => {
    store = new InMemoryCacheStore()
    container.register(CACHE_STORE_TOKEN, { useFactory: () => store, override: true })
    container.register(CacheService, { useFactory: () => new CacheService(store), override: true })
    svc = container.resolve<CacheService>(CacheService)
  })

  afterEach(() => {
    container.unregister(CacheService)
    container.unregister(CACHE_STORE_TOKEN)
    singleFlight.clear()
  })

  it('miss runs the loader and stores; hit skips the loader', async () => {
    const loader = vi.fn().mockResolvedValue({ n: 1 })

    expect(await svc.remember('r:1', 60, loader)).toEqual({ n: 1 })
    expect(await svc.remember('r:1', 60, loader)).toEqual({ n: 1 })
    expect(loader).toHaveBeenCalledTimes(1)
    expect(await store.get('r:1')).toEqual({ n: 1 })
  })

  it('coalesces concurrent calls with single-flight', async () => {
    const loader = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10))
      return 'computed'
    })

    const results = await Promise.all(
      Array.from({ length: 50 }, () => svc.remember('r:2', 60, loader))
    )

    expect(loader).toHaveBeenCalledTimes(1)
    expect(results.every((r) => r === 'computed')).toBe(true)
  })

  it('a failing loader is not cached (next call retries)', async () => {
    const loader = vi.fn().mockRejectedValueOnce(new Error('transient')).mockResolvedValueOnce('ok')

    await expect(svc.remember('r:3', 60, loader)).rejects.toThrow('transient')
    expect(await svc.remember('r:3', 60, loader)).toBe('ok')
  })

  it('rememberForever stores without expiry; undefined results are not stored', async () => {
    const loader = vi.fn().mockResolvedValue(undefined)

    await svc.rememberForever('r:4', loader)
    expect(await store.get('r:4')).toBeUndefined() // miss sentinel — nothing stored

    await svc.rememberForever('r:5', async () => 'kept')
    expect(await store.get('r:5')).toBe('kept')
  })

  it('remember indexes tags when provided', async () => {
    await svc.remember('r:6', 60, async () => 'tagged', ['users', 'user:u1'])

    await svc.flushTags('user:u1')
    expect(await store.get('r:6')).toBeUndefined()
  })
})

describe('@CachePut', () => {
  let store: InMemoryCacheStore
  let svc: CacheService

  beforeEach(() => {
    store = new InMemoryCacheStore()
    container.register(CACHE_STORE_TOKEN, { useFactory: () => store, override: true })
    container.register(CacheService, { useFactory: () => new CacheService(store), override: true })
    svc = container.resolve<CacheService>(CacheService)
  })

  afterEach(() => {
    container.unregister(CacheService)
    container.unregister(CACHE_STORE_TOKEN)
  })

  function wiredClass(underlying: any, options: any) {
    class Writable {
      @CachePut(options)
      async save(input: string) {
        return underlying(input)
      }
    }
    return new Writable()
  }

  it('always executes and writes the result through', async () => {
    const underlying = vi.fn().mockResolvedValue('v1')
    const obj = wiredClass(underlying, { key: 'product' })

    expect(await obj.save('a')).toBe('v1')
    expect(await obj.save('a')).toBe('v1')
    expect(underlying).toHaveBeenCalledTimes(2) // ALWAYS executes
    expect(await store.get('product::"a"')).toBe('v1')
  })

  it('skips storing undefined results', async () => {
    const underlying = vi.fn().mockResolvedValue(undefined)
    const obj = wiredClass(underlying, { key: 'nope' })

    expect(await obj.save('x')).toBeUndefined()
    expect(await store.get('nope::"x"')).toBeUndefined()
  })

  it('unless skips storing but still returns the value', async () => {
    const obj = wiredClass(vi.fn().mockResolvedValue('v'), { key: 'unless', unless: () => true })
    const res = await obj.save('x')
    expect(res).toBe('v')
    expect(await store.get('unless::"x"')).toBeUndefined()
  })

  it('condition bypasses the put entirely', async () => {
    const underlying = vi.fn().mockResolvedValue('v')
    const obj = wiredClass(underlying, { key: 'cond', condition: () => false })

    await obj.save('x')
    expect(underlying).toHaveBeenCalledTimes(1)
    expect(await store.get('cond::"x"')).toBeUndefined()
  })

  it('works on sync methods and indexes tags', async () => {
    class SyncPut {
      @CachePut({ key: 'sync', tags: ['sync-tag'] })
      save(input: string) {
        return `sync:${input}`
      }
    }

    const obj = new SyncPut()
    await obj.save('a')
    expect(await store.get('sync::"a"')).toBe('sync:a')

    await svc.flushTags('sync-tag')
    expect(await store.get('sync::"a"')).toBeUndefined()
  })
})

describe('condition / unless on @Cacheable', () => {
  let store: InMemoryCacheStore
  let svc: CacheService

  beforeEach(() => {
    store = new InMemoryCacheStore()
    container.register(CACHE_STORE_TOKEN, { useFactory: () => store, override: true })
    container.register(CacheService, { useFactory: () => new CacheService(store), override: true })
    svc = container.resolve<CacheService>(CacheService)
  })

  afterEach(() => {
    container.unregister(CacheService)
    container.unregister(CACHE_STORE_TOKEN)
    singleFlight.clear()
  })

  it('condition=false bypasses everything: no read, no flight, no write', async () => {
    const underlying = vi.fn().mockResolvedValue('fresh')
    const calls: string[] = []
    const spyGet = vi.spyOn(store, 'get').mockImplementation(async (k: string) => {
      calls.push(`get:${k}`)
      return undefined
    })

    class Bypassed {
      @Cacheable({ key: 'byp', condition: () => false })
      async load(id: string) {
        return underlying(id)
      }
    }

    const obj = new Bypassed()
    await expect(obj.load('1')).resolves.toBe('fresh')
    expect(underlying).toHaveBeenCalledTimes(1)
    expect(calls).toEqual([]) // no cache read at all
    expect(await store.get('byp::"1"')).toBeUndefined() // nothing stored

    spyGet.mockRestore()
  })

  it('unless=true executes and returns, but does not store', async () => {
    class Empty {
      @Cacheable({ key: 'search', unless: (result: any) => result.items.length === 0 })
      async search(q: string) {
        return { items: [] as string[], q }
      }
    }

    const obj = new Empty()
    const res = await obj.search('nothing')
    expect(res.items).toEqual([]) // value returned
    expect(await store.get(`search::${JSON.stringify('nothing')}`)).toBeUndefined()
  })

  it('async condition and unless predicates are supported', async () => {
    const asyncTrue = async () => true
    const asyncFalse = async () => false

    class AsyncPredicates {
      @Cacheable({ key: 'ap', condition: asyncTrue, unless: asyncFalse })
      async load(id: string) {
        return `loaded:${id}`
      }
    }

    const obj = new AsyncPredicates()
    await obj.load('a')
    expect(await store.get('ap::"a"')).toBe('loaded:a') // stored (unless false)
  })

  it('unless receives (result, args) — args enable caller-aware skipping (A6)', async () => {
    const seen: Array<{ result: any; args: any[] }> = []

    class Search {
      @Cacheable({
        key: 'ctx',
        unless: (result: any, args: any[]) => {
          seen.push({ result, args })
          return args[0] === 'admin' // don't cache admin searches
        },
      })
      async search(role: string, term: string) {
        return { role, term }
      }
    }

    const obj = new Search()
    await obj.search('admin', 'secret')
    await obj.search('user', 'public')

    expect(seen).toEqual([
      { result: { role: 'admin', term: 'secret' }, args: ['admin', 'secret'] },
      { result: { role: 'user', term: 'public' }, args: ['user', 'public'] },
    ])
    expect(await store.get('ctx::"admin":"secret"')).toBeUndefined() // skipped
    expect(await store.get('ctx::"user":"public"')).toEqual({ role: 'user', term: 'public' })
  })
})

describe('tags', () => {
  let store: InMemoryCacheStore
  let svc: CacheService

  beforeEach(() => {
    store = new InMemoryCacheStore()
    container.register(CACHE_STORE_TOKEN, { useFactory: () => store, override: true })
    container.register(CacheService, { useFactory: () => new CacheService(store), override: true })
    svc = container.resolve<CacheService>(CacheService)
  })

  afterEach(() => {
    container.unregister(CacheService)
    container.unregister(CACHE_STORE_TOKEN)
  })

  it('set with tags + flushTags deletes exactly the tagged entries', async () => {
    await svc.set('dash:u1', 'one', 60, ['users', 'user:u1'])
    await svc.set('dash:u2', 'two', 60, ['users', 'user:u2'])
    await svc.set('other', 'three', 60)

    const deleted = await svc.flushTags('user:u1')

    expect(deleted).toBe(1)
    expect(await store.get('dash:u1')).toBeUndefined()
    expect(await store.get('dash:u2')).toBe('two')
    expect(await store.get('other')).toBe('three')
  })

  it('concurrent appends to the same tag never lose members (per-tag mutex)', async () => {
    await Promise.all(
      Array.from({ length: 50 }, (_, i) => svc.set(`k:${i}`, i, 60, ['bulk']))
    )

    const deleted = await svc.flushTags('bulk')
    expect(deleted).toBe(50)
  })

  it('flushing an already-expired member is a harmless no-op', async () => {
    await svc.set('gone', 'v', 60, ['expiring'])
    await store.del('gone') // entry expires/disappears behind the index's back

    const deleted = await svc.flushTags('expiring')
    expect(deleted).toBe(1) // index listed it; del of a missing key is a no-op
    expect(await store.get('gone')).toBeUndefined()
  })

  it('multi-tag flush crosses tag boundaries', async () => {
    await svc.set('a', 1, 60, ['t1'])
    await svc.set('b', 2, 60, ['t2'])
    await svc.set('c', 3, 60, ['t1', 't2'])

    const deleted = await svc.flushTags('t1', 't2')
    expect(deleted).toBe(3)
    expect(await store.get('a')).toBeUndefined()
    expect(await store.get('b')).toBeUndefined()
    expect(await store.get('c')).toBeUndefined()
  })

  it('@Cacheable tags index the entry; @CacheEvict tags flush it', async () => {
    const underlying = vi.fn().mockResolvedValue('data')

    class Tagged {
      @Cacheable({ key: 'tagged', tags: (args) => [`user:${args[0]}`] })
      async load(userId: string) {
        return underlying(userId)
      }

      @CacheEvict({ tags: (args) => [`user:${args[0]}`] })
      async invalidate(userId: string) {
        return 'done'
      }
    }

    const obj = new Tagged()
    await obj.load('u9')
    expect(await store.get(`tagged::"u9"`)).toBe('data')

    await obj.invalidate('u9')
    expect(await store.get(`tagged::"u9"`)).toBeUndefined()
  })

  it('flushTags with args-derived tags works through CacheService', async () => {
    await svc.set('profile:u7', { name: 'Piyush' }, 60, ['user:u7'])

    const deleted = await svc.flushTags('user:u7')
    expect(deleted).toBe(1)
    expect(await store.get('profile:u7')).toBeUndefined()
  })
})

describe('commons exports', () => {
  it('exposes the single-flight and stable-stringify utilities', () => {
    expect(singleFlight).toBeInstanceOf(SingleFlight)
    expect(stableStringify({ b: 2, a: 1 })).toBe('{"a":1,"b":2}')
  })
})
