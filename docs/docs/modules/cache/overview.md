---
id: cache-overview
title: Cache Module Overview
sidebar_label: Overview
description: Learn about BootifyJS's powerful caching system with support for multiple stores and method-level decorators
keywords: [bootifyjs, cache, caching, redis, in-memory, performance]
---

# Cache Module Overview

The Cache module provides a comprehensive caching system for BootifyJS applications with support for multiple cache store implementations, method-level caching decorators, and seamless dependency injection integration.

## Why Use Caching?

Caching is essential for building high-performance applications. It helps you:

- **Reduce database load** by storing frequently accessed data in memory
- **Improve response times** by avoiding expensive computations
- **Scale your application** by reducing backend resource usage
- **Lower costs** by minimizing external API calls

## Key Features

### Multiple Cache Stores

BootifyJS supports different cache store implementations out of the box:

- **In-Memory Cache**: Fast, simple caching using JavaScript Map (default)
- **Redis Cache**: Distributed caching for multi-instance deployments
- **Custom Stores**: Implement your own cache store for any backend

### Method-Level Decorators

Use decorators to add caching to your methods with minimal code:

```typescript
@Cacheable({ key: 'users', ttl: 300 })
async getUsers() {
  return await this.database.query('SELECT * FROM users');
}
```

### Automatic Key Generation

The cache system automatically generates unique cache keys based on method arguments, so you don't have to worry about key collisions.

### TTL Support

Set time-to-live (TTL) values to automatically expire cached data after a specified duration.

### Dependency Injection

The cache system integrates seamlessly with BootifyJS's DI container, making it easy to inject and use throughout your application.

## Quick Start

### Basic Usage

```typescript
import { Service, Autowired } from "bootifyjs";
import { CacheService } from "bootifyjs/cache";

@Service()
export class UserService {
  constructor(@Autowired() private cacheService: CacheService) {}

  async getUser(id: string) {
    // Check cache first
    const cached = await this.cacheService.get<User>(`user:${id}`);
    if (cached) {
      return cached;
    }

    // Fetch from database
    const user = await this.fetchUserFromDB(id);

    // Store in cache with 5-minute TTL
    await this.cacheService.set(`user:${id}`, user, 300);

    return user;
  }
}
```

### Using Decorators

For even simpler caching, use the `@Cacheable` decorator:

```typescript
import { Service } from "bootifyjs";
import { Cacheable, CacheEvict } from "bootifyjs/cache";

@Service()
export class UserService {
  @Cacheable({ key: "user", ttl: 300 })
  async getUser(id: string) {
    return await this.fetchUserFromDB(id);
  }

  @CacheEvict({ key: "user" })
  async updateUser(id: string, data: Partial<User>) {
    return await this.updateUserInDB(id, data);
  }
}
```

## How It Works

### Cache Flow

1. **Cache Hit**: When data is found in cache, it's returned immediately
2. **Cache Miss**: When data is not in cache, the original method executes
3. **Cache Store**: The result is stored in cache for future requests
4. **Cache Eviction**: Data is removed when updated or expired

```
Request → Check Cache → Hit? → Return Cached Data
                      ↓ Miss
                Execute Method → Store Result → Return Data
```

### Automatic Bootstrapping

The cache system automatically initializes during application startup:

1. Checks for custom cache store registrations
2. Falls back to `InMemoryCacheStore` if none found
3. Registers the `CacheService` for dependency injection

You don't need to manually configure anything to start using caching!

## Module Structure

```
src/cache/
├── index.ts                      # Main module exports
├── bootstrap.ts                  # Cache system initialization
├── cache.service.ts              # Main cache service
├── cache.types.ts                # Interfaces and tokens
├── decorators.ts                 # @Cacheable and @CacheEvict
└── stores/                       # Cache store implementations
    ├── in-memory-cache.store.ts  # Default in-memory store
    └── redis-cache.store.ts      # Redis store
```

## When to Use Caching

### Good Use Cases

- Database query results that don't change frequently
- Expensive computations or transformations
- External API responses
- User session data
- Configuration data

### When to Avoid Caching

- Frequently changing data
- User-specific sensitive data (unless properly secured)
- Data that must always be fresh
- Very large objects that consume too much memory

## Best Practices

1. **Set appropriate TTL values** to balance freshness and performance
2. **Cache expensive operations** like database queries or API calls
3. **Use cache eviction** when data is updated to prevent stale data
4. **Monitor memory usage** when using in-memory caching
5. **Use Redis for distributed systems** to share cache across instances
6. **Consider cache warming** for critical data on application startup

## Next Steps

- Learn about [Cache Decorators](./decorators.md) for method-level caching
- Explore [Cache Stores](./stores.md) for different storage backends
- Create [Custom Cache Stores](./custom-stores.md) for your specific needs

## API Reference

### CacheService

The main service for interacting with the cache:

- `get<T>(key: string): Promise<T | undefined>` - Retrieve cached value
- `set(key: string, value: any, ttlInSeconds?: number): Promise<void>` - Store value
- `del(key: string): Promise<void>` - Delete cached value

### Decorators

- `@Cacheable(options)` - Automatically cache method results
- `@CacheEvict(options)` - Automatically evict cache entries

### Interfaces

- `ICacheStore` - Contract for implementing custom cache stores
- `CACHE_STORE_TOKEN` - DI token for registering cache stores
