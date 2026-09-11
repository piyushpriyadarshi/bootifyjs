import { container } from '../core/di-container'
import { CACHE_STORE_TOKEN } from './cache.types'
import { InMemoryCacheStore } from './stores/in-memory-cache.store'

export interface BootstrapCacheOptions {
  /** LRU bound for the default store (A2). Omitted → unlimited. */
  maxEntries?: number
}

/**
 * Ensures a cache store is bound to CACHE_STORE_TOKEN. If the user has
 * already registered a custom store, this is a no-op. Idempotent and silent.
 *
 * @returns An unbootstrap function that unbinds the default store (tests/HMR).
 */
export function bootstrapCache(options: BootstrapCacheOptions = {}): () => void {
  if (!container.isRegistered(CACHE_STORE_TOKEN)) {
    container.register(CACHE_STORE_TOKEN, {
      useFactory: () => new InMemoryCacheStore(options),
      override: true,
    })
    return () => container.unregister(CACHE_STORE_TOKEN)
  }

  return () => undefined
}
