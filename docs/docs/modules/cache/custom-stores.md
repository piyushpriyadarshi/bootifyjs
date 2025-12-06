---
id: cache-custom-stores
title: Custom Cache Stores
sidebar_label: Custom Stores
description: Learn how to create custom cache store implementations for BootifyJS
keywords:
  [bootifyjs, cache, custom-store, memcached, dynamodb, custom-implementation]
---

# Custom Cache Stores

BootifyJS makes it easy to create custom cache store implementations for any backend storage system. Whether you need to integrate with Memcached, DynamoDB, or a proprietary caching solution, you can implement the `ICacheStore` interface and plug it into the framework.

## Why Create a Custom Store?

You might need a custom cache store when:

- Using a specific caching technology (Memcached, DynamoDB, etc.)
- Integrating with existing infrastructure
- Implementing custom eviction policies
- Adding monitoring or logging
- Supporting multi-tier caching
- Meeting specific compliance requirements

## The ICacheStore Interface

All cache stores must implement the `ICacheStore` interface:

```typescript
interface ICacheStore {
  /**
   * Retrieve a value from the cache
   * @param key - The cache key
   * @returns The cached value or undefined if not found/expired
   */
  get<T>(key: string): Promise<T | undefined>;

  /**
   * Store a value in the cache
   * @param key - The cache key
   * @param value - The value to cache
   * @param ttlInSeconds - Optional time-to-live in seconds
   */
  set(key: string, value: any, ttlInSeconds?: number): Promise<void>;

  /**
   * Delete a value from the cache
   * @param key - The cache key
   */
  del(key: string): Promise<void>;
}
```

## Creating a Custom Store

### Step 1: Implement the Interface

Create a class that implements `ICacheStore`:

```typescript
import { Service } from "bootifyjs";
import { ICacheStore, CACHE_STORE_TOKEN } from "bootifyjs/cache";

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

### Step 2: Register with DI Container

Use the `@Service` decorator with `bindTo` to register your store:

```typescript
@Service({ bindTo: [CACHE_STORE_TOKEN] })
export class CustomCacheStore implements ICacheStore {
  // Implementation
}
```

The `bindTo: [CACHE_STORE_TOKEN]` tells the DI container to use this class whenever `CACHE_STORE_TOKEN` is requested.

### Step 3: Import in Your Application

Import your custom store before creating the application:

```typescript
import { BootifyApp } from "bootifyjs";
import "./cache/custom-cache.store"; // Import to register

const app = new BootifyApp({
  controllers: [UserController],
  services: [UserService],
});

await app.start();
```

## Example Implementations

### Memcached Store

```typescript
import { Service } from "bootifyjs";
import { ICacheStore, CACHE_STORE_TOKEN } from "bootifyjs/cache";
import Memcached from "memcached";

@Service({ bindTo: [CACHE_STORE_TOKEN] })
export class MemcachedStore implements ICacheStore {
  private client: Memcached;

  constructor() {
    this.client = new Memcached("localhost:11211");
  }

  async get<T>(key: string): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      this.client.get(key, (err, data) => {
        if (err) {
          console.error("Memcached get error:", err);
          resolve(undefined);
          return;
        }
        resolve(data as T);
      });
    });
  }

  async set(key: string, value: any, ttlInSeconds: number = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.set(key, value, ttlInSeconds, (err) => {
        if (err) {
          console.error("Memcached set error:", err);
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  async del(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.del(key, (err) => {
        if (err) {
          console.error("Memcached del error:", err);
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
}
```

### DynamoDB Store

```typescript
import { Service } from "bootifyjs";
import { ICacheStore, CACHE_STORE_TOKEN } from "bootifyjs/cache";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

@Service({ bindTo: [CACHE_STORE_TOKEN] })
export class DynamoDBCacheStore implements ICacheStore {
  private client: DynamoDBDocumentClient;
  private tableName: string;

  constructor() {
    const dynamoClient = new DynamoDBClient({ region: "us-east-1" });
    this.client = DynamoDBDocumentClient.from(dynamoClient);
    this.tableName = process.env.CACHE_TABLE_NAME || "cache";
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const result = await this.client.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { key },
        })
      );

      if (!result.Item) return undefined;

      // Check expiration
      if (result.Item.expiry && result.Item.expiry < Date.now()) {
        await this.del(key);
        return undefined;
      }

      return result.Item.value as T;
    } catch (error) {
      console.error("DynamoDB get error:", error);
      return undefined;
    }
  }

  async set(key: string, value: any, ttlInSeconds?: number): Promise<void> {
    const expiry = ttlInSeconds ? Date.now() + ttlInSeconds * 1000 : null;

    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          key,
          value,
          expiry,
          createdAt: Date.now(),
        },
      })
    );
  }

  async del(key: string): Promise<void> {
    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { key },
      })
    );
  }
}
```

### File System Store

```typescript
import { Service } from "bootifyjs";
import { ICacheStore, CACHE_STORE_TOKEN } from "bootifyjs/cache";
import { promises as fs } from "fs";
import path from "path";

interface CacheEntry {
  value: any;
  expiry: number | null;
}

@Service({ bindTo: [CACHE_STORE_TOKEN] })
export class FileSystemCacheStore implements ICacheStore {
  private cacheDir: string;

  constructor() {
    this.cacheDir = path.join(process.cwd(), ".cache");
    this.ensureCacheDir();
  }

  private async ensureCacheDir(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch (error) {
      console.error("Failed to create cache directory:", error);
    }
  }

  private getFilePath(key: string): string {
    // Sanitize key for file system
    const sanitized = key.replace(/[^a-z0-9]/gi, "_");
    return path.join(this.cacheDir, `${sanitized}.json`);
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const filePath = this.getFilePath(key);
      const content = await fs.readFile(filePath, "utf-8");
      const entry: CacheEntry = JSON.parse(content);

      // Check expiration
      if (entry.expiry && entry.expiry < Date.now()) {
        await this.del(key);
        return undefined;
      }

      return entry.value as T;
    } catch (error) {
      // File doesn't exist or can't be read
      return undefined;
    }
  }

  async set(key: string, value: any, ttlInSeconds?: number): Promise<void> {
    const expiry = ttlInSeconds ? Date.now() + ttlInSeconds * 1000 : null;

    const entry: CacheEntry = { value, expiry };
    const filePath = this.getFilePath(key);

    await fs.writeFile(filePath, JSON.stringify(entry), "utf-8");
  }

  async del(key: string): Promise<void> {
    try {
      const filePath = this.getFilePath(key);
      await fs.unlink(filePath);
    } catch (error) {
      // File doesn't exist, ignore
    }
  }
}
```

## Advanced Patterns

### Multi-Tier Caching

Combine multiple cache stores for optimal performance:

```typescript
import { Service } from "bootifyjs";
import { ICacheStore, CACHE_STORE_TOKEN } from "bootifyjs/cache";

@Service({ bindTo: [CACHE_STORE_TOKEN] })
export class MultiTierCacheStore implements ICacheStore {
  private l1Cache: Map<string, any>; // In-memory (fast)
  private l2Cache: ICacheStore; // Redis (distributed)

  constructor() {
    this.l1Cache = new Map();
    this.l2Cache = new RedisCacheStore();
  }

  async get<T>(key: string): Promise<T | undefined> {
    // Try L1 cache first
    if (this.l1Cache.has(key)) {
      console.log("[L1 Cache] HIT");
      return this.l1Cache.get(key) as T;
    }

    // Try L2 cache
    const value = await this.l2Cache.get<T>(key);
    if (value !== undefined) {
      console.log("[L2 Cache] HIT");
      // Promote to L1
      this.l1Cache.set(key, value);
      return value;
    }

    console.log("[Cache] MISS");
    return undefined;
  }

  async set(key: string, value: any, ttlInSeconds?: number): Promise<void> {
    // Write to both caches
    this.l1Cache.set(key, value);
    await this.l2Cache.set(key, value, ttlInSeconds);
  }

  async del(key: string): Promise<void> {
    // Delete from both caches
    this.l1Cache.delete(key);
    await this.l2Cache.del(key);
  }
}
```

### Cache with Monitoring

Add monitoring and metrics to your cache store:

```typescript
import { Service } from "bootifyjs";
import { ICacheStore, CACHE_STORE_TOKEN } from "bootifyjs/cache";

interface CacheMetrics {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
}

@Service({ bindTo: [CACHE_STORE_TOKEN] })
export class MonitoredCacheStore implements ICacheStore {
  private store: ICacheStore;
  private metrics: CacheMetrics;

  constructor() {
    this.store = new InMemoryCacheStore();
    this.metrics = { hits: 0, misses: 0, sets: 0, deletes: 0 };
  }

  async get<T>(key: string): Promise<T | undefined> {
    const value = await this.store.get<T>(key);

    if (value !== undefined) {
      this.metrics.hits++;
      console.log(`[Cache] HIT - Total: ${this.metrics.hits}`);
    } else {
      this.metrics.misses++;
      console.log(`[Cache] MISS - Total: ${this.metrics.misses}`);
    }

    return value;
  }

  async set(key: string, value: any, ttlInSeconds?: number): Promise<void> {
    this.metrics.sets++;
    await this.store.set(key, value, ttlInSeconds);
  }

  async del(key: string): Promise<void> {
    this.metrics.deletes++;
    await this.store.del(key);
  }

  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  getHitRate(): number {
    const total = this.metrics.hits + this.metrics.misses;
    return total > 0 ? this.metrics.hits / total : 0;
  }
}
```

### Cache with Compression

Compress large values to save memory:

```typescript
import { Service } from "bootifyjs";
import { ICacheStore, CACHE_STORE_TOKEN } from "bootifyjs/cache";
import { gzip, gunzip } from "zlib";
import { promisify } from "util";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

@Service({ bindTo: [CACHE_STORE_TOKEN] })
export class CompressedCacheStore implements ICacheStore {
  private store: ICacheStore;
  private compressionThreshold: number;

  constructor() {
    this.store = new InMemoryCacheStore();
    this.compressionThreshold = 1024; // 1KB
  }

  async get<T>(key: string): Promise<T | undefined> {
    const compressed = await this.store.get<Buffer>(key);
    if (!compressed) return undefined;

    try {
      const decompressed = await gunzipAsync(compressed);
      return JSON.parse(decompressed.toString()) as T;
    } catch (error) {
      // Not compressed, return as-is
      return compressed as unknown as T;
    }
  }

  async set(key: string, value: any, ttlInSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);

    // Compress if above threshold
    if (serialized.length > this.compressionThreshold) {
      const compressed = await gzipAsync(serialized);
      await this.store.set(key, compressed, ttlInSeconds);
      console.log(
        `[Cache] Compressed ${serialized.length} → ${compressed.length} bytes`
      );
    } else {
      await this.store.set(key, value, ttlInSeconds);
    }
  }

  async del(key: string): Promise<void> {
    await this.store.del(key);
  }
}
```

## Testing Custom Stores

### Unit Tests

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { CustomCacheStore } from "./custom-cache.store";

describe("CustomCacheStore", () => {
  let store: CustomCacheStore;

  beforeEach(() => {
    store = new CustomCacheStore();
  });

  it("should store and retrieve values", async () => {
    await store.set("key1", "value1");
    const value = await store.get("key1");
    expect(value).toBe("value1");
  });

  it("should return undefined for missing keys", async () => {
    const value = await store.get("nonexistent");
    expect(value).toBeUndefined();
  });

  it("should delete values", async () => {
    await store.set("key1", "value1");
    await store.del("key1");
    const value = await store.get("key1");
    expect(value).toBeUndefined();
  });

  it("should respect TTL", async () => {
    await store.set("key1", "value1", 1); // 1 second TTL

    // Should exist immediately
    let value = await store.get("key1");
    expect(value).toBe("value1");

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // Should be expired
    value = await store.get("key1");
    expect(value).toBeUndefined();
  });

  it("should handle complex objects", async () => {
    const obj = { id: 1, name: "Test", nested: { value: 42 } };
    await store.set("key1", obj);
    const value = await store.get("key1");
    expect(value).toEqual(obj);
  });
});
```

### Integration Tests

```typescript
import { describe, it, expect } from "vitest";
import { BootifyApp } from "bootifyjs";
import { CacheService } from "bootifyjs/cache";
import "./custom-cache.store"; // Import to register

describe("Custom Cache Store Integration", () => {
  it("should use custom store in application", async () => {
    const app = new BootifyApp({
      services: [TestService],
    });

    await app.start();

    const cacheService = app.container.resolve(CacheService);
    await cacheService.set("test", "value");
    const value = await cacheService.get("test");

    expect(value).toBe("value");

    await app.stop();
  });
});
```

## Best Practices

### 1. Handle Errors Gracefully

```typescript
async get<T>(key: string): Promise<T | undefined> {
  try {
    return await this.client.get(key);
  } catch (error) {
    console.error('Cache get error:', error);
    // Return undefined instead of throwing
    return undefined;
  }
}
```

### 2. Implement Proper TTL

```typescript
async set(
  key: string,
  value: any,
  ttlInSeconds?: number
): Promise<void> {
  // Always respect TTL parameter
  if (ttlInSeconds) {
    await this.client.setex(key, ttlInSeconds, value);
  } else {
    await this.client.set(key, value);
  }
}
```

### 3. Use Connection Pooling

```typescript
constructor() {
  // Reuse connections
  this.client = new Redis({
    host: 'localhost',
    port: 6379,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true
  });
}
```

### 4. Add Logging

```typescript
async set(key: string, value: any, ttlInSeconds?: number): Promise<void> {
  console.log(`[Cache] SET ${key} (TTL: ${ttlInSeconds || 'none'})`);
  await this.store.set(key, value, ttlInSeconds);
}
```

### 5. Validate Data

```typescript
async get<T>(key: string): Promise<T | undefined> {
  const value = await this.store.get(key);

  // Validate retrieved data
  if (value && typeof value === 'object') {
    return value as T;
  }

  return undefined;
}
```

## Common Pitfalls

### 1. Not Handling Serialization

```typescript
// ❌ Bad: Assuming values are already serialized
async set(key: string, value: any): Promise<void> {
  await this.client.set(key, value); // May fail with objects
}

// ✅ Good: Serialize before storing
async set(key: string, value: any): Promise<void> {
  const serialized = JSON.stringify(value);
  await this.client.set(key, serialized);
}
```

### 2. Ignoring Connection Errors

```typescript
// ❌ Bad: No error handling
constructor() {
  this.client = new Redis();
}

// ✅ Good: Handle connection errors
constructor() {
  this.client = new Redis();
  this.client.on('error', (err) => {
    console.error('Redis connection error:', err);
  });
}
```

### 3. Not Cleaning Up Resources

```typescript
// ✅ Good: Implement cleanup
@Service({ bindTo: [CACHE_STORE_TOKEN] })
export class CustomCacheStore implements ICacheStore {
  async close(): Promise<void> {
    await this.client.quit();
  }
}
```

## Next Steps

- Review [Cache Stores](./stores.md) for built-in implementations
- Learn about [Cache Decorators](./decorators.md) for method-level caching
- Read the [Cache Overview](./overview.md) for architectural details
