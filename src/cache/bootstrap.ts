import { container } from '../core/di-container'
import { CACHE_STORE_TOKEN } from './cache.types'
import { InMemoryCacheStore } from './stores/in-memory-cache.store'

/**
 * Checks if a user has provided a custom cache store. If not, it registers
 * the default InMemoryCacheStore. This makes the caching system work out-of-the-box.
 */
export function bootstrapCache() {
  console.log('🔄 Bootstrapping Cache System...')

  if (!container.isRegistered(CACHE_STORE_TOKEN)) {
    console.log('  - No custom cache store provided. Binding default InMemoryCacheStore.')
    // The user didn't bind anything to the token, so we provide the default.
    container.register(CACHE_STORE_TOKEN, { useClass: InMemoryCacheStore })
  } else {
    console.log('  - Custom cache store detected. Skipping default binding.')
  }
  console.log('✅ Cache System bootstrapped successfully!\n')
}
