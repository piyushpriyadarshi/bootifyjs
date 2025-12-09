// import { Service, Autowired } from '../decorators'
import { Autowired, Service } from '../core/decorators'
import type { ICacheStore } from './cache.types'
import { CACHE_STORE_TOKEN } from './cache.types'

@Service() // Eagerly load to ensure it's ready
export class CacheService {
  constructor(@Autowired(CACHE_STORE_TOKEN) private readonly store: ICacheStore) { }

  public get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key)
  }

  public set(key: string, value: any, ttlInSeconds?: number): Promise<void> {
    return this.store.set(key, value, ttlInSeconds)
  }

  public del(key: string): Promise<void> {
    return this.store.del(key)
  }
}
