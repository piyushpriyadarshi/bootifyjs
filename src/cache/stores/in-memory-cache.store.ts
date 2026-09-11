import { Service } from '../../core/decorators'
import { ICacheStore } from '../cache.types'
import { CacheError } from '../errors'
import { normalizeTtlInSeconds } from '../ttl'

export interface InMemoryCacheStoreOptions {
  /**
   * Optional LRU bound (A2). When set, the least-recently-used entry is
   * evicted once the store reaches this many entries. Omitted → unlimited
   * (back-compat default).
   */
  maxEntries?: number
}

/**
 * A simple in-memory cache store using a Map.
 *
 * Values are stored by reference (no serialization) — mutating a cached
 * object mutates the cache. Redis serializes; see LLD-CACHE.md §3.9.
 *
 * With `maxEntries`, the Map insertion order doubles as LRU order: reads
 * refresh recency by delete + re-set; writes evict the oldest key at
 * capacity. All operations stay O(1).
 */
@Service()
export class InMemoryCacheStore implements ICacheStore {
  private readonly cache = new Map<string, { value: any; expiry: number | null }>()
  private readonly maxEntries?: number

  constructor(options: InMemoryCacheStoreOptions = {}) {
    if (options.maxEntries !== undefined) {
      if (!Number.isInteger(options.maxEntries) || options.maxEntries <= 0) {
        throw new CacheError(
          `[Cache] maxEntries must be a positive integer (received ${options.maxEntries})`
        )
      }
      this.maxEntries = options.maxEntries
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.cache.get(key)
    if (!entry) return undefined

    // Check for expiration
    if (entry.expiry && entry.expiry <= Date.now()) {
      this.cache.delete(key)
      return undefined
    }

    // LRU recency: delete + re-set moves the key to the newest position.
    this.cache.delete(key)
    this.cache.set(key, entry)

    return entry.value as T
  }

  async set(key: string, value: any, ttlInSeconds?: number): Promise<void> {
    const ttl = normalizeTtlInSeconds(ttlInSeconds)

    if (this.cache.has(key)) {
      // Refresh recency without consuming capacity.
      this.cache.delete(key)
    } else if (this.maxEntries !== undefined && this.cache.size >= this.maxEntries) {
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) this.cache.delete(oldest)
    }

    const expiry = ttl ? Date.now() + ttl * 1000 : null
    this.cache.set(key, { value, expiry })
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key)
  }

  async healthCheck(): Promise<boolean> {
    return true
  }
}
