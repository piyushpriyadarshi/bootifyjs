import { Service } from '../../core/decorators'
import { ICacheStore } from '../cache.types'

// A simple in-memory cache store using a Map.
@Service()
export class InMemoryCacheStore implements ICacheStore {
  private readonly cache = new Map<string, { value: any; expiry: number | null }>()

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.cache.get(key)
    if (!entry) return undefined

    // Check for expiration
    if (entry.expiry && entry.expiry < Date.now()) {
      this.cache.delete(key)
      return undefined
    }

    return entry.value as T
  }

  async set(key: string, value: any, ttlInSeconds?: number): Promise<void> {
    const expiry = ttlInSeconds ? Date.now() + ttlInSeconds * 1000 : null
    this.cache.set(key, { value, expiry })
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key)
  }
}
