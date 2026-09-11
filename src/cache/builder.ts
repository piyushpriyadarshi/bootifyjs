import { ConfigValidationError } from '../config/errors'
import { RedisCacheStore } from './stores/redis-cache.store'
import { InMemoryCacheStore } from './stores/in-memory-cache.store'
import type { CacheRedisClient } from './stores/redis-client'
import type { ICacheStore } from './cache.types'

/**
 * Options for `createBootifyApp().enableCache(...)`.
 *
 * Exactly ONE of `store` / `client` / `maxEntries` may be provided; omitting
 * all three binds the default `InMemoryCacheStore`.
 *
 * The framework never creates a Redis client (A5): pass your own via
 * `client`, or provide a complete `store`.
 */
export interface EnableCacheOptions {
  /** A. Your own store implementation — used as-is. */
  store?: ICacheStore
  /** B. A Redis client you own (ioredis-shaped) — wrapped in RedisCacheStore. */
  client?: CacheRedisClient
  /** C. Sugar — default InMemoryCacheStore with an LRU bound (A2). */
  maxEntries?: number
}

function assertRedisClient(client: unknown): CacheRedisClient {
  const candidate = client as Partial<CacheRedisClient> | null
  if (
    !candidate ||
    typeof candidate.get !== 'function' ||
    typeof candidate.set !== 'function' ||
    typeof candidate.del !== 'function'
  ) {
    throw new ConfigValidationError(
      'enableCache({ client }) expects a Redis client exposing get/set/del (e.g. an ioredis instance).'
    )
  }
  return candidate as CacheRedisClient
}

/**
 * Resolve `enableCache()` options into a concrete store. Fail-fast:
 * validation problems throw ConfigValidationError at build time.
 */
export async function resolveCacheStoreFromOptions(
  options: EnableCacheOptions
): Promise<ICacheStore> {
  const provided = [options.store, options.client, options.maxEntries].filter(
    (value) => value !== undefined
  )
  if (provided.length > 1) {
    throw new ConfigValidationError(
      'enableCache() accepts only ONE of: store, client, maxEntries.'
    )
  }

  if (options.store) {
    return options.store
  }

  if (options.client) {
    const client = assertRedisClient(options.client)
    return new RedisCacheStore({ client })
  }

  if (options.maxEntries !== undefined) {
    return new InMemoryCacheStore({ maxEntries: options.maxEntries })
  }

  return new InMemoryCacheStore()
}
