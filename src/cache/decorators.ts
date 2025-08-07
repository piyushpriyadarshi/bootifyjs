import { container } from '../core/di-container'
import { CacheService } from './cache.service'

interface CacheableOptions {
  /** A base key for the cache entry. */
  key: string
  /** Time-to-live in seconds. */
  ttl?: number
}

// Helper to generate a unique key based on method arguments
function generateCacheKey(baseKey: string, args: any[]): string {
  // Simple JSON stringify is a decent way to serialize arguments.
  // For more complex cases, a more robust serialization might be needed.
  const argsString = args.map((arg) => JSON.stringify(arg)).join(':')
  return `${baseKey}::${argsString}`
}

export const Cacheable = (options: CacheableOptions): MethodDecorator => {
  return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value

    descriptor.value = async function (...args: any[]) {
      const cacheService = container.resolve<CacheService>(CacheService)
      const cacheKey = generateCacheKey(options.key, args)

      // 1. Try to get the value from the cache
      const cachedValue = await cacheService.get(cacheKey)
      if (cachedValue !== undefined) {
        console.log(`[Cache] HIT for key: ${cacheKey}`)
        return cachedValue
      }

      console.log(`[Cache] MISS for key: ${cacheKey}`)

      // 2. If it's a cache miss, call the original method
      const result = await originalMethod.apply(this, args)

      // 3. Store the result in the cache
      await cacheService.set(cacheKey, result, options.ttl)

      return result
    }

    return descriptor
  }
}

export const CacheEvict = (options: { key: string }): MethodDecorator => {
  return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value

    descriptor.value = async function (...args: any[]) {
      // 1. Call the original method first
      const result = await originalMethod.apply(this, args)

      // 2. After it succeeds, evict the cache entry
      const cacheService = container.resolve<CacheService>(CacheService)
      const cacheKey = generateCacheKey(options.key, args)

      console.log(`[Cache] EVICT for key: ${cacheKey}`)
      await cacheService.del(cacheKey)

      return result
    }

    return descriptor
  }
}
