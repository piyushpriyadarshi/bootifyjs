/**
 * A unique Symbol to use as the DI token for the cache store.
 */
export const CACHE_STORE_TOKEN = Symbol.for('CacheStore')

/**
 * The contract that any cache store must adhere to.
 * This can be implemented for in-memory, Redis, Memcached, etc.
 */
export interface ICacheStore {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: any, ttlInSeconds?: number): Promise<void>
  del(key: string): Promise<void>
}

// Type guard for Bun bundler compatibility (ensures interface is not tree-shaken)
export function isCacheStore(obj: unknown): obj is ICacheStore {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'get' in obj &&
    'set' in obj &&
    'del' in obj
  )
}
