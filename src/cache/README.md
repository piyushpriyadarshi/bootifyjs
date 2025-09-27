# Cache Module

A comprehensive caching system for the BootifyJS framework with support for multiple cache store implementations, decorators for method-level caching, and dependency injection integration.

## Features

- **Multiple Cache Stores**: In-memory and Redis implementations
- **Method-level Caching**: `@Cacheable` and `@CacheEvict` decorators
- **Dependency Injection**: Seamless integration with the DI container
- **TTL Support**: Time-to-live configuration for cache entries
- **Automatic Bootstrapping**: Smart detection of custom cache stores

## Quick Start

### Basic Usage

```typescript
import { CacheService } from '@bootifyjs/cache'

@Service()
class UserService {
  constructor(private cacheService: CacheService) {}

  async getUser(id: string) {
    // Manual caching
    const cached = await this.cacheService.get(`user:${id}`)
    if (cached) return cached

    const user = await this.fetchUserFromDB(id)
    await this.cacheService.set(`user:${id}`, user, 300) // 5 minutes TTL
    return user
  }
}
```

### Using Decorators

```typescript
import { Cacheable, CacheEvict } from '@bootifyjs/cache'

@Service()
class UserService {
  @Cacheable({ key: 'user', ttl: 300 })
  async getUser(id: string) {
    return await this.fetchUserFromDB(id)
  }

  @CacheEvict({ key: 'user' })
  async updateUser(id: string, data: any) {
    return await this.updateUserInDB(id, data)
  }
}
```

## Cache Store Implementations

### In-Memory Cache Store

The default cache store that uses a JavaScript Map for storage.

```typescript
import { InMemoryCacheStore } from '@bootifyjs/cache'

// Automatically used if no custom store is provided
```

### Redis Cache Store

A Redis-based cache store implementation (currently using Map as placeholder).

```typescript
import { RedisCacheStore } from '@bootifyjs/cache'

// Import to register with DI container
import '@bootifyjs/cache/stores/redis-cache.store'
```

## Custom Cache Store

Implement the `ICacheStore` interface to create custom cache stores:

```typescript
import { ICacheStore, CACHE_STORE_TOKEN, Service } from '@bootifyjs/cache'

@Service({ bindTo: [CACHE_STORE_TOKEN] })
export class CustomCacheStore implements ICacheStore {
  async get<T>(key: string): Promise<T | undefined> {
    // Your implementation
  }

  async set(key: string, value: any, ttlInSeconds?: number): Promise<void> {
    // Your implementation
  }

  async del(key: string): Promise<void> {
    // Your implementation
  }
}
```

## Module Structure

```
src/cache/
├── index.ts                 # Main module exports
├── bootstrap.ts             # Cache system initialization
├── cache.service.ts         # Main cache service
├── cache.types.ts           # Interfaces and tokens
├── decorators.ts            # @Cacheable and @CacheEvict decorators
├── stores/                  # Cache store implementations
│   ├── index.ts            # Store exports
│   ├── in-memory-cache.store.ts
│   └── redis-cache.store.ts
└── README.md               # This file
```

## Configuration

The cache system automatically bootstraps during application startup:

1. Checks for custom cache store registrations
2. Falls back to `InMemoryCacheStore` if none found
3. Registers the `CacheService` for dependency injection

## Best Practices

1. **Use appropriate TTL values** to prevent stale data
2. **Cache expensive operations** like database queries or API calls
3. **Use cache eviction** when data is updated
4. **Consider memory usage** when using in-memory caching
5. **Import cache stores** to ensure proper registration

## API Reference

### CacheService

- `get<T>(key: string): Promise<T | undefined>` - Retrieve cached value
- `set(key: string, value: any, ttlInSeconds?: number): Promise<void>` - Store value
- `del(key: string): Promise<void>` - Delete cached value

### Decorators

- `@Cacheable(options)` - Cache method results
- `@CacheEvict(options)` - Evict cache entries

### Interfaces

- `ICacheStore` - Contract for cache store implementations
- `CACHE_STORE_TOKEN` - DI token for cache stores