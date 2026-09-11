import { Autowired, Service } from '../core/decorators'
import { singleFlight } from '../commons/single-flight'
import type { ICacheStore } from './cache.types'
import type { CacheTags } from './cache.types'
import { CACHE_STORE_TOKEN } from './cache.types'

/** Reserved key prefix — tag-index keys live here; user keys must avoid it. */
const TAG_INDEX_PREFIX = '__bc:tag:'

type TagMode = 'set' | 'rmw'

// import { Service, Autowired } from '../decorators'
@Service() // Eagerly load to ensure it's ready
export class CacheService {
  constructor(@Autowired(CACHE_STORE_TOKEN) private readonly store: ICacheStore) {}

  public get<T>(key: string): Promise<T | undefined> {
    return this.store.get<T>(key)
  }

  public set(key: string, value: any, ttlInSeconds?: number, tags?: string[]): Promise<void> {
    return this.put(key, value, ttlInSeconds, tags)
  }

  /**
   * Write-through primitive: always stores (tags indexed when provided).
   * `@CachePut` builds on this.
   */
  public async put(
    key: string,
    value: any,
    ttlInSeconds?: number,
    tags?: string[]
  ): Promise<void> {
    await this.store.set(key, value, ttlInSeconds)
    if (tags && tags.length > 0) {
      await this.indexTags(key, tags, ttlInSeconds)
    }
  }

  public del(key: string): Promise<void> {
    return this.store.del(key)
  }

  /**
   * Batch read: one round trip when the store implements `mget`, else
   * parallel gets. Input order is preserved 1:1 (B2).
   */
  public async mget<T>(keys: string[]): Promise<(T | undefined)[]> {
    if (keys.length === 0) return []
    if (this.store.mget) return this.store.mget<T>(keys)
    return Promise.all(keys.map((key) => this.store.get<T>(key)))
  }

  /**
   * Batch write: delegates to `store.mset` when available, else sequential
   * sets; tags are indexed for every entry (B2). Fail-fast on the first error.
   */
  public async mset(
    entries: Array<{ key: string; value: any; ttlInSeconds?: number; tags?: string[] }>
  ): Promise<void> {
    if (entries.length === 0) return

    if (this.store.mset) {
      await this.store.mset(entries)
    } else {
      for (const entry of entries) {
        await this.store.set(entry.key, entry.value, entry.ttlInSeconds)
      }
    }

    for (const entry of entries) {
      if (entry.tags && entry.tags.length > 0) {
        await this.indexTags(entry.key, entry.tags, entry.ttlInSeconds)
      }
    }
  }

  /**
   * Cache-aside with built-in single-flight: concurrent callers with the same
   * key share ONE loader execution. Misses are stored (unless the loader
   * returns `undefined` — the miss sentinel).
   */
  public async remember<T>(
    key: string,
    ttl: number | undefined,
    loader: () => Promise<T>,
    tags?: string[]
  ): Promise<T> {
    const cached = await this.get<T>(key)
    if (cached !== undefined) {
      return cached
    }

    return singleFlight.run(`load:${key}`, async () => {
      const value = await loader()
      if (value !== undefined) {
        await this.set(key, value, ttl, tags)
      }
      return value
    })
  }

  /** remember() without expiry. */
  public rememberForever<T>(key: string, loader: () => Promise<T>, tags?: string[]): Promise<T> {
    return this.remember(key, undefined, loader, tags)
  }

  /**
   * Delete every entry tagged with any of the given tags.
   * Returns the number of entries deleted. Expired members are harmless no-ops.
   */
  public async flushTags(...tags: string[]): Promise<number> {
    // Union members across tags first — an entry carrying two flushed tags is
    // deleted once and counted once.
    const unique = new Set<string>()
    const mode = await this.resolveTagMode()

    for (const tag of tags) {
      const indexKey = `${TAG_INDEX_PREFIX}${tag}`
      let members: string[]

      if (mode === 'set') {
        members = await this.store.sMembers!(indexKey)
        await this.store.del(indexKey)
      } else {
        members = await this.withTagLock(tag, async () => {
          const list = (await this.store.get<string[]>(indexKey)) ?? []
          await this.store.del(indexKey)
          return list
        })
      }

      for (const key of members) unique.add(key)
    }

    await Promise.all([...unique].map((key) => this.store.del(key)))
    return unique.size
  }

  /**
   * Append `key` to each tag's index.
   *
   * - Set path (B1): atomic `SADD` + `EXPIRE`, no mutex — safe across
   *   instances. A legacy JSON-string index raises WRONGTYPE; we delete and
   *   retry once so old indexes self-heal.
   * - RMW path: read-modify-write under a per-tag mutex (in-memory and
   *   minimal custom stores).
   *
   * Index TTL = entry TTL (or 1h for entries without expiry) + 60s buffer —
   * indexes self-expire shortly after their last member.
   */
  private async indexTags(key: string, tags: string[], ttlInSeconds?: number): Promise<void> {
    const indexTtl = (ttlInSeconds ?? 3600) + 60
    const mode = await this.resolveTagMode()

    for (const tag of tags) {
      const indexKey = `${TAG_INDEX_PREFIX}${tag}`

      if (mode === 'set') {
        try {
          await this.store.sAdd!(indexKey, key)
        } catch (error) {
          if (!isWrongType(error)) throw error
          // Legacy JSON-string index → replace with a set and retry once.
          await this.store.del(indexKey)
          await this.store.sAdd!(indexKey, key)
        }
        await this.store.expire!(indexKey, indexTtl)
      } else {
        await this.withTagLock(tag, async () => {
          const members = (await this.store.get<string[]>(indexKey)) ?? []
          if (!members.includes(key)) {
            await this.store.set(indexKey, [...members, key], indexTtl)
          }
        })
      }
    }
  }

  /**
   * Resolve the tag-index strategy once per store instance: atomic set ops
   * when the store provides them (and reports support), else RMW + mutex.
   */
  private readonly tagModeCache = new WeakMap<ICacheStore, Promise<TagMode>>()
  private resolveTagMode(): Promise<TagMode> {
    const store = this.store
    let mode = this.tagModeCache.get(store)
    if (!mode) {
      mode = (async (): Promise<TagMode> => {
        if (
          typeof store.sAdd !== 'function' ||
          typeof store.sMembers !== 'function' ||
          typeof store.expire !== 'function'
        ) {
          return 'rmw'
        }
        const supported = store.supportsTagSets ? await store.supportsTagSets() : true
        return supported ? 'set' : 'rmw'
      })()
      this.tagModeCache.set(store, mode)
    }
    return mode
  }

  /**
   * Per-tag promise-chain mutex: serializes read-modify-write index updates
   * within this process so concurrent appends never lose members. Entries
   * are pruned once their chain settles to keep the map bounded.
   */
  private readonly tagLocks = new Map<string, Promise<unknown>>()
  private withTagLock<T>(tag: string, fn: () => Promise<T>): Promise<T> {
    const tail = this.tagLocks.get(tag) ?? Promise.resolve()
    const run = tail.then(fn, fn)
    const marker = run.then(
      () => undefined,
      () => undefined
    )
    this.tagLocks.set(tag, marker)
    void marker.finally(() => {
      if (this.tagLocks.get(tag) === marker) {
        this.tagLocks.delete(tag)
      }
    })
    return run
  }
}

/** Redis WRONGTYPE: a legacy JSON-string tag index where a Set is expected. */
function isWrongType(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /WRONGTYPE/i.test(message)
}
