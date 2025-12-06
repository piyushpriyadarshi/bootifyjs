---
id: cache-stores
title: Cache Stores
sidebar_label: Cache Stores
description: Learn about built-in cache store implementations in BootifyJS including in-memory and Redis stores
keywords: [bootifyjs, cache, cache-store, in-memory, redis, storage]
---

# Cache Stores

BootifyJS provides multiple cache store implementations to suit different application needs. A cache store is the underlying storage mechanism that holds your cached data.

## Available Stores

### In-Memory Cache Store (Default)

The `InMemoryCacheStore` is the default cache store that uses a JavaScript `Map` for storage. It's fast, simple, and requires no external dependencies.

#### Features

- **Zero configuration**: Works out of the box
- **Fast access**: Data stored in application memory
- **TTL support**: Automatic expiration of cached entries
- **No dependencies**: No external services required

#### When to Use

- Development and testing
- Single-instance applications
- Small to medium datasets
- When you don't need cache persistence

#### Limitations

- **Not distributed**: Cache is not shared across multiple instances
- **Memory bound**: Limited by application memory
- **Not persistent**: Cache is lost on application restart
- **No eviction policy**: No LRU or other eviction strategies

#### Usage

The in-memory store is used automatically if no custom store is configured:

```typescript
import { BootifyApp } from "bootifyjs";

const app = new BootifyApp({
  // No cache configuration needed
  // InMemoryCacheStore is used by default
});

await app.start();
```

#### Example

```typescript
import { Service, Autowired } from "bootifyjs";
import { CacheService } from "bootifyjs/cache";

@Service()
export class UserService {
  constructor(@Autowired() private cacheService: CacheService) {}

  async getUser(id: string) {
    // Uses InMemoryCacheStore by default
    const cached = await this.cacheService.get<User>(`user:${id}`);
    if (cached) return cached;

    const user = await this.database.findUser(id);
    await this.cacheService.set(`user:${id}`, user, 300);
    return user;
  }
}
```

### Redis Cache Store

The `RedisCacheStore` provides distributed caching using Redis. It's ideal for production applications with multiple instances.

:::note
The current implementation uses an in-memory Map as a placeholder. To use actual Redis, you'll need to implement the Redis client integration.
:::

#### Features

- **Distributed**: Share cache across multiple application instances
- **Persistent**: Cache survives application restarts
- **Scalable**: Handle large datasets efficiently
- **TTL support**: Native Redis TTL functionality

#### When to Use

- Production environments
- Multi-instance deployments
- Large datasets
- When cache persistence is required
- Microservices architectures

#### Configuration

To use the Redis cache store, import it in your application:

```typescript
import { BootifyApp } from "bootifyjs";
// Import to register the Redis store
import "bootifyjs/cache/stores/redis-cache.store";

const app = new BootifyApp({
  // Redis store is now registered
});

await app.start();
```

#### Example with Redis

```typescript
// main.ts
import { BootifyApp } from "bootifyjs";
import "bootifyjs/cache/stores/redis-cache.store";

const app = new BootifyApp({
  controllers: [UserController],
  services: [UserService],
});

await app.start();
```

```typescript
// user.service.ts
import { Service } from "bootifyjs";
import { Cacheable, CacheEvict } from "bootifyjs/cache";

@Service()
export class UserService {
  // Cache is now stored in Redis
  @Cacheable({ key: "user", ttl: 300 })
  async getUser(id: string) {
    return await this.database.findUser(id);
  }

  @CacheEvict({ key: "user" })
  async updateUser(id: string, data: Partial<User>) {
    return await this.database.updateUser(id, data);
  }
}
```

## Store Comparison

| Feature              | In-Memory                    | Redis                      |
| -------------------- | ---------------------------- | -------------------------- |
| **Setup Complexity** | None                         | Requires Redis server      |
| **Performance**      | Very Fast                    | Fast (network overhead)    |
| **Distribution**     | No                           | Yes                        |
| **Persistence**      | No                           | Yes                        |
| **Memory Usage**     | Application memory           | Redis memory               |
| **Scalability**      | Limited                      | High                       |
| **Best For**         | Development, single instance | Production, multi-instance |

## How Cache Stores Work

### Store Interface

All cache stores implement the `ICacheStore` interface:

```typescript
interface ICacheStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: any, ttlInSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
}
```

### Store Registration

Cache stores are registered with the DI container using the `CACHE_STORE_TOKEN`:

```typescript
import { Service } from "bootifyjs";
import { CACHE_STORE_TOKEN, ICacheStore } from "bootifyjs/cache";

@Service({ bindTo: [CACHE_STORE_TOKEN] })
export class RedisCacheStore implements ICacheStore {
  // Implementation
}
```

### Automatic Bootstrapping

During application startup, the cache system:

1. Checks if a custom store is registered with `CACHE_STORE_TOKEN`
2. If found, uses the custom store
3. If not found, registers and uses `InMemoryCacheStore`

```typescript
// bootstrap.ts (internal)
export function bootstrapCache() {
  if (!container.isRegistered(CACHE_STORE_TOKEN)) {
    // No custom store, use default
    container.register(CACHE_STORE_TOKEN, {
      useClass: InMemoryCacheStore,
    });
  }
}
```

## In-Memory Store Implementation

Here's how the in-memory store works internally:

```typescript
@Service()
export class InMemoryCacheStore implements ICacheStore {
  private readonly cache = new Map<
    string,
    { value: any; expiry: number | null }
  >();

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check for expiration
    if (entry.expiry && entry.expiry < Date.now()) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value as T;
  }

  async set(key: string, value: any, ttlInSeconds?: number): Promise<void> {
    const expiry = ttlInSeconds ? Date.now() + ttlInSeconds * 1000 : null;
    this.cache.set(key, { value, expiry });
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
  }
}
```

### Key Features

- **Expiry Checking**: Automatically removes expired entries on access
- **Null Expiry**: Entries without TTL never expire
- **Type Safety**: Generic `get<T>` method for type-safe retrieval

## Redis Store Implementation

The Redis store follows the same interface:

```typescript
@Service({ bindTo: [CACHE_STORE_TOKEN] })
export class RedisCacheStore implements ICacheStore {
  // Current implementation uses Map (placeholder)
  // Replace with actual Redis client
  private readonly cache = new Map<
    string,
    { value: any; expiry: number | null }
  >();

  async get<T>(key: string): Promise<T | undefined> {
    // TODO: Replace with Redis GET command
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (entry.expiry && entry.expiry < Date.now()) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value as T;
  }

  async set(key: string, value: any, ttlInSeconds?: number): Promise<void> {
    // TODO: Replace with Redis SET command with EX option
    const expiry = ttlInSeconds ? Date.now() + ttlInSeconds * 1000 : null;
    this.cache.set(key, { value, expiry });
  }

  async del(key: string): Promise<void> {
    // TODO: Replace with Redis DEL command
    this.cache.delete(key);
  }
}
```

## Choosing the Right Store

### Use In-Memory Store When:

- Building a prototype or MVP
- Running in development mode
- Deploying a single instance
- Cache size is small (< 100MB)
- Cache loss on restart is acceptable

### Use Redis Store When:

- Deploying to production
- Running multiple instances
- Need cache persistence
- Cache size is large
- Sharing cache across services
- Need advanced features (pub/sub, etc.)

## Performance Considerations

### In-Memory Store

**Advantages:**

- No network latency
- Fastest possible access
- No serialization overhead

**Disadvantages:**

- Consumes application memory
- Not shared across instances
- Limited by single machine resources

### Redis Store

**Advantages:**

- Distributed across instances
- Dedicated memory pool
- Persistent storage
- Advanced features

**Disadvantages:**

- Network latency (typically 1-5ms)
- Serialization overhead
- Requires Redis infrastructure

## Best Practices

### 1. Start with In-Memory

Begin development with the default in-memory store:

```typescript
// Development
const app = new BootifyApp({
  // Uses InMemoryCacheStore automatically
});
```

### 2. Switch to Redis for Production

Use environment-based configuration:

```typescript
// Production
if (process.env.NODE_ENV === "production") {
  import("bootifyjs/cache/stores/redis-cache.store");
}

const app = new BootifyApp({
  // Uses RedisCacheStore in production
});
```

### 3. Monitor Memory Usage

Track cache memory consumption:

```typescript
@Service()
export class CacheMonitorService {
  constructor(@Autowired() private cacheService: CacheService) {}

  async getCacheStats() {
    // Monitor your cache usage
    const memoryUsage = process.memoryUsage();
    return {
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
    };
  }
}
```

### 4. Set Appropriate TTLs

Prevent unbounded cache growth:

```typescript
// Always set TTL for in-memory cache
@Cacheable({ key: 'data', ttl: 300 }) // 5 minutes
async getData() {
  // ...
}

// Avoid indefinite caching
@Cacheable({ key: 'data' }) // No TTL - grows forever!
async getData() {
  // ...
}
```

### 5. Test with Production Store

Test your application with the production cache store before deploying:

```typescript
// test/integration/cache.test.ts
import "bootifyjs/cache/stores/redis-cache.store";

describe("Cache Integration", () => {
  it("should cache data in Redis", async () => {
    // Test with actual Redis store
  });
});
```

## Troubleshooting

### Cache Not Working

Check that the cache system is bootstrapped:

```typescript
// Should see this in logs
// 🔄 Bootstrapping Cache System...
// ✅ Cache System bootstrapped successfully!
```

### Memory Issues with In-Memory Store

Monitor and limit cache size:

```typescript
@Cacheable({ key: 'data', ttl: 60 }) // Short TTL
async getData() {
  // Limit cached data size
}
```

### Redis Connection Issues

Ensure Redis is running and accessible:

```bash
# Check Redis connection
redis-cli ping
# Should return: PONG
```

## Next Steps

- Learn how to create [Custom Cache Stores](./custom-stores.md)
- Review [Cache Decorators](./decorators.md) for method-level caching
- Read the [Cache Overview](./overview.md) for architectural details
