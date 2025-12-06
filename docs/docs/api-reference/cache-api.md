---
id: cache-api
title: Cache API Reference
sidebar_label: Cache API
description: Complete reference for BootifyJS caching system classes and methods
keywords: [bootifyjs, cache, api, reference, redis]
---

# Cache API Reference

This page documents the caching system classes and methods for implementing high-performance caching in BootifyJS applications.

## Core Cache Service

### CacheService

The main service for interacting with the cache store.

#### Constructor

```typescript
constructor(@Autowired(CACHE_STORE_TOKEN) private readonly store: ICacheStore)
```

The CacheService is automatically registered in the DI container and can be injected into your services.

**Example:**

```typescript
import { Service, Autowired, CacheService } from "bootifyjs";

@Service()
export class UserService {
  @Autowired()
  private cache!: CacheService;
}
```

---

#### Methods

##### get()

Retrieves a value from the cache.

**Signature:**

```typescript
get<T>(key: string): Promise<T | undefined>
```

**Parameters:**

- `key`: Cache key to retrieve

**Returns:**

- The cached value, or `undefined` if not found or expired

**Example:**

```typescript
import { Service, Autowired, CacheService } from "bootifyjs";

@Service()
export class UserService {
  @Autowired()
  private cache!: CacheService;

  async getUserById(id: string) {
    // Try to get from cache first
    const cached = await this.cache.get<User>(`user:${id}`);
    if (cached) {
      return cached;
    }

    // Fetch from database
    const user = await this.userRepo.findById(id);

    // Store in cache
    await this.cache.set(`user:${id}`, user, 300); // 5 minutes

    return user;
  }
}
```

---

##### set()

Stores a value in the cache.

**Signature:**

```typescript
set(key: string, value: any, ttlInSeconds?: number): Promise<void>
```

**Parameters:**

- `key`: Cache key
- `value`: Value to cache (will be serialized)
- `ttlInSeconds` (optional): Time-to-live in seconds

**Example:**

```typescript
// Cache for 5 minutes
await this.cache.set("user:123", userData, 300);

// Cache indefinitely (if supported by store)
await this.cache.set("config:app", appConfig);

// Cache complex objects
await this.cache.set(
  "dashboard:stats",
  {
    users: 1000,
    orders: 5000,
    revenue: 99999.99,
  },
  60
);
```

---

##### del()

Deletes a value from the cache.

**Signature:**

```typescript
del(key: string): Promise<void>
```

**Parameters:**

- `key`: Cache key to delete

**Example:**

```typescript
// Delete single key
await this.cache.del('user:123');

// Delete after update
async updateUser(id: string, data: any) {
  const user = await this.userRepo.update(id, data);
  await this.cache.del(`user:${id}`); // Invalidate cache
  return user;
}
```

---

## Cache Stores

### ICacheStore

Interface that all cache store implementations must implement.

**Definition:**

```typescript
interface ICacheStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: any, ttlInSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
}
```

---

### InMemoryCacheStore

Simple in-memory cache store for development and testing.

#### Constructor

```typescript
constructor();
```

**Example:**

```typescript
import { InMemoryCacheStore, CACHE_STORE_TOKEN, container } from "bootifyjs";

// Register in-memory cache
container.register(CACHE_STORE_TOKEN, {
  useClass: InMemoryCacheStore,
  scope: "singleton",
});
```

---

#### Methods

Implements all `ICacheStore` methods with in-memory storage.

**Features:**

- Automatic TTL expiration
- Memory-efficient storage
- No external dependencies
- Suitable for development and testing

**Limitations:**

- Not shared across multiple instances
- Lost on application restart
- Limited by available memory

**Example:**

```typescript
import { InMemoryCacheStore } from "bootifyjs";

const cache = new InMemoryCacheStore();

// Store value
await cache.set("key1", "value1", 60);

// Retrieve value
const value = await cache.get("key1");

// Delete value
await cache.del("key1");
```

---

### RedisCacheStore

Production-ready Redis cache store.

#### Constructor

```typescript
constructor(options: RedisOptions)
```

**Parameters:**

- `options`: Redis connection options
  - `host`: Redis server host
  - `port`: Redis server port
  - `password`: Redis password (optional)
  - `db`: Redis database number (optional)
  - Additional ioredis options

**Example:**

```typescript
import { RedisCacheStore, CACHE_STORE_TOKEN, container } from "bootifyjs";

// Register Redis cache
const redisStore = new RedisCacheStore({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD,
  db: 0,
});

container.register(CACHE_STORE_TOKEN, {
  useFactory: () => redisStore,
  scope: "singleton",
});
```

---

#### Methods

Implements all `ICacheStore` methods with Redis backend.

**Features:**

- Shared across multiple instances
- Persistent storage (configurable)
- High performance
- Advanced features (pub/sub, transactions, etc.)

**Example:**

```typescript
import { RedisCacheStore } from "bootifyjs";

const cache = new RedisCacheStore({
  host: "localhost",
  port: 6379,
});

// Store with TTL
await cache.set("session:abc123", sessionData, 3600);

// Retrieve
const session = await cache.get("session:abc123");

// Delete
await cache.del("session:abc123");
```

---

## Cache Decorators

### @Cacheable

Automatically caches method results.

**Signature:**

```typescript
@Cacheable(options: CacheableOptions): MethodDecorator
```

**Parameters:**

- `options`: Caching configuration
  - `key`: Base cache key
  - `ttl` (optional): Time-to-live in seconds

**Behavior:**

- Generates unique cache keys based on method arguments
- Returns cached value if available
- Executes method and caches result on cache miss
- Supports async methods

**Example:**

```typescript
import { Service, Cacheable } from "bootifyjs";

@Service()
export class UserService {
  // Cache for 5 minutes
  @Cacheable({ key: "user", ttl: 300 })
  async findById(id: string) {
    console.log("Fetching from database...");
    return await this.userRepo.findById(id);
  }

  // Cache indefinitely
  @Cacheable({ key: "user:all" })
  async findAll() {
    return await this.userRepo.findAll();
  }

  // Cache with multiple parameters
  @Cacheable({ key: "user:search", ttl: 60 })
  async search(query: string, page: number, limit: number) {
    return await this.userRepo.search(query, page, limit);
  }
}
```

**Cache Key Generation:**

```typescript
// Method: findById('123')
// Cache key: user::["123"]

// Method: search('john', 1, 10)
// Cache key: user:search::["john",1,10]
```

---

### @CacheEvict

Automatically evicts cache entries after method execution.

**Signature:**

```typescript
@CacheEvict(options: { key: string }): MethodDecorator
```

**Parameters:**

- `options`: Eviction configuration
  - `key`: Base cache key to evict

**Behavior:**

- Executes the method first
- Evicts cache entry after successful execution
- Generates cache key based on method arguments
- Useful for update/delete operations

**Example:**

```typescript
import { Service, Cacheable, CacheEvict } from "bootifyjs";

@Service()
export class UserService {
  @Cacheable({ key: "user", ttl: 300 })
  async findById(id: string) {
    return await this.userRepo.findById(id);
  }

  // Evict cache after update
  @CacheEvict({ key: "user" })
  async updateUser(id: string, data: any) {
    const user = await this.userRepo.update(id, data);
    return user;
  }

  // Evict cache after delete
  @CacheEvict({ key: "user" })
  async deleteUser(id: string) {
    await this.userRepo.delete(id);
  }
}
```

---

## Types and Interfaces

### CacheableOptions

Options for the `@Cacheable` decorator.

**Definition:**

```typescript
interface CacheableOptions {
  key: string;
  ttl?: number;
}
```

**Properties:**

- `key`: Base cache key
- `ttl`: Time-to-live in seconds (optional)

**Example:**

```typescript
import { CacheableOptions } from "bootifyjs";

const options: CacheableOptions = {
  key: "product",
  ttl: 600, // 10 minutes
};
```

---

### CACHE_STORE_TOKEN

DI token for cache store registration.

**Type:**

```typescript
const CACHE_STORE_TOKEN: symbol;
```

**Usage:**

```typescript
import { CACHE_STORE_TOKEN, container, InMemoryCacheStore } from "bootifyjs";

// Register cache store
container.register(CACHE_STORE_TOKEN, {
  useClass: InMemoryCacheStore,
  scope: "singleton",
});
```

---

## Custom Cache Store

You can implement custom cache stores by implementing the `ICacheStore` interface.

### Example: MongoDB Cache Store

```typescript
import { ICacheStore } from "bootifyjs";
import { MongoClient, Db } from "mongodb";

export class MongoDBCacheStore implements ICacheStore {
  private db!: Db;

  constructor(private connectionString: string) {}

  async connect() {
    const client = await MongoClient.connect(this.connectionString);
    this.db = client.db("cache");
  }

  async get<T>(key: string): Promise<T | undefined> {
    const doc = await this.db.collection("cache").findOne({ _id: key });

    if (!doc) return undefined;

    // Check expiration
    if (doc.expiresAt && doc.expiresAt < new Date()) {
      await this.del(key);
      return undefined;
    }

    return doc.value as T;
  }

  async set(key: string, value: any, ttlInSeconds?: number): Promise<void> {
    const doc: any = {
      _id: key,
      value,
      createdAt: new Date(),
    };

    if (ttlInSeconds) {
      doc.expiresAt = new Date(Date.now() + ttlInSeconds * 1000);
    }

    await this.db
      .collection("cache")
      .updateOne({ _id: key }, { $set: doc }, { upsert: true });
  }

  async del(key: string): Promise<void> {
    await this.db.collection("cache").deleteOne({ _id: key });
  }
}

// Register custom store
import { CACHE_STORE_TOKEN, container } from "bootifyjs";

const mongoStore = new MongoDBCacheStore("mongodb://localhost:27017");
await mongoStore.connect();

container.register(CACHE_STORE_TOKEN, {
  useFactory: () => mongoStore,
  scope: "singleton",
});
```

---

## Usage Examples

### Basic Caching

```typescript
import { Service, Autowired, CacheService } from "bootifyjs";

@Service()
export class ProductService {
  @Autowired()
  private cache!: CacheService;

  async getProduct(id: string) {
    const cacheKey = `product:${id}`;

    // Try cache first
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      console.log("Cache hit!");
      return cached;
    }

    // Fetch from database
    console.log("Cache miss, fetching from DB...");
    const product = await this.productRepo.findById(id);

    // Cache for 10 minutes
    await this.cache.set(cacheKey, product, 600);

    return product;
  }
}
```

### Decorator-Based Caching

```typescript
import { Service, Cacheable, CacheEvict } from "bootifyjs";

@Service()
export class ProductService {
  @Cacheable({ key: "product", ttl: 600 })
  async getProduct(id: string) {
    return await this.productRepo.findById(id);
  }

  @Cacheable({ key: "products:list", ttl: 300 })
  async listProducts(category: string, page: number) {
    return await this.productRepo.findByCategory(category, page);
  }

  @CacheEvict({ key: "product" })
  async updateProduct(id: string, data: any) {
    return await this.productRepo.update(id, data);
  }

  @CacheEvict({ key: "product" })
  async deleteProduct(id: string) {
    await this.productRepo.delete(id);
  }
}
```

### Multi-Level Caching

```typescript
import { Service, Autowired, CacheService } from "bootifyjs";

@Service()
export class UserService {
  @Autowired()
  private cache!: CacheService;

  private localCache = new Map<string, any>();

  async getUserById(id: string) {
    const cacheKey = `user:${id}`;

    // Level 1: Local memory cache
    if (this.localCache.has(cacheKey)) {
      console.log("Local cache hit");
      return this.localCache.get(cacheKey);
    }

    // Level 2: Redis cache
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      console.log("Redis cache hit");
      this.localCache.set(cacheKey, cached);
      return cached;
    }

    // Level 3: Database
    console.log("Database fetch");
    const user = await this.userRepo.findById(id);

    // Populate caches
    this.localCache.set(cacheKey, user);
    await this.cache.set(cacheKey, user, 300);

    return user;
  }
}
```

### Cache Warming

```typescript
import { Service, Autowired, CacheService } from "bootifyjs";

@Service()
export class CacheWarmingService {
  @Autowired()
  private cache!: CacheService;

  @Autowired()
  private productService!: ProductService;

  async warmCache() {
    console.log("Warming cache...");

    // Fetch popular products
    const popularProducts = await this.productService.getPopularProducts();

    // Cache each product
    for (const product of popularProducts) {
      await this.cache.set(
        `product:${product.id}`,
        product,
        3600 // 1 hour
      );
    }

    console.log(`Cached ${popularProducts.length} products`);
  }
}
```

---

## Best Practices

### Cache Key Naming

Use a consistent, hierarchical naming convention:

```typescript
// Good
"user:123";
"user:123:profile";
"product:456";
"product:category:electronics";
"session:abc123";

// Avoid
"user123";
"userProfile123";
"prod_456";
```

### TTL Selection

Choose appropriate TTL values based on data volatility:

```typescript
// Frequently changing data: Short TTL
@Cacheable({ key: 'stock:price', ttl: 10 }) // 10 seconds
async getStockPrice(symbol: string) { }

// Moderately changing data: Medium TTL
@Cacheable({ key: 'user:profile', ttl: 300 }) // 5 minutes
async getUserProfile(id: string) { }

// Rarely changing data: Long TTL
@Cacheable({ key: 'config:app', ttl: 3600 }) // 1 hour
async getAppConfig() { }

// Static data: No TTL
@Cacheable({ key: 'country:list' })
async getCountries() { }
```

### Cache Invalidation

Always invalidate cache when data changes:

```typescript
@Service()
export class UserService {
  @Cacheable({ key: "user", ttl: 300 })
  async getUser(id: string) {
    return await this.userRepo.findById(id);
  }

  @CacheEvict({ key: "user" })
  async updateUser(id: string, data: any) {
    return await this.userRepo.update(id, data);
  }

  @CacheEvict({ key: "user" })
  async deleteUser(id: string) {
    await this.userRepo.delete(id);
  }
}
```

### Error Handling

Handle cache errors gracefully:

```typescript
@Service()
export class ProductService {
  async getProduct(id: string) {
    try {
      const cached = await this.cache.get(`product:${id}`);
      if (cached) return cached;
    } catch (error) {
      console.error("Cache error:", error);
      // Continue to database fetch
    }

    const product = await this.productRepo.findById(id);

    try {
      await this.cache.set(`product:${id}`, product, 600);
    } catch (error) {
      console.error("Cache set error:", error);
      // Don't fail the request
    }

    return product;
  }
}
```

---

## See Also

- [Cache Module Overview](../modules/cache/overview.md)
- [Cache Decorators Guide](../modules/cache/decorators.md)
- [Cache Stores Guide](../modules/cache/stores.md)
- [Custom Cache Stores Guide](../modules/cache/custom-stores.md)
