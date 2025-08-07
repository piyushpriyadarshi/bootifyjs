# Cache Module

The Cache module provides a flexible caching system for the Bootify framework, allowing you to improve performance by storing frequently accessed data.

## Features

- **Pluggable Cache Stores**: Support for different cache backends
- **Method-level Caching**: Declarative caching with decorators
- **TTL Support**: Automatic expiration of cached items
- **In-Memory Default**: Built-in in-memory cache store

## Usage

### Basic Caching

```typescript
import { CacheService } from 'bootify/cache';
import { Service, Autowired } from 'bootify/core';

@Service()
export class UserService {
  constructor(@Autowired() private cacheService: CacheService) {}
  
  async getUserById(id: string) {
    // Try to get from cache first
    const cacheKey = `user:${id}`;
    const cachedUser = await this.cacheService.get<User>(cacheKey);
    
    if (cachedUser) {
      return cachedUser;
    }
    
    // If not in cache, fetch from database
    const user = await this.fetchUserFromDatabase(id);
    
    // Store in cache for 5 minutes (300 seconds)
    await this.cacheService.set(cacheKey, user, 300);
    
    return user;
  }
  
  private async fetchUserFromDatabase(id: string) {
    // Database fetch logic
    return { id, name: 'John Doe' };
  }
}
```

### Method Caching with Decorator

```typescript
import { Cached } from 'bootify/cache';
import { Service } from 'bootify/core';

@Service()
export class ProductService {
  @Cached('products', 600) // Cache key prefix and TTL in seconds
  async getAllProducts() {
    console.log('Fetching products from database...');
    // This will only execute when cache is empty
    return [
      { id: 1, name: 'Product 1' },
      { id: 2, name: 'Product 2' }
    ];
  }
  
  @Cached('product:{0}', 300) // {0} refers to the first parameter
  async getProductById(id: number) {
    console.log(`Fetching product ${id} from database...`);
    return { id, name: `Product ${id}` };
  }
}
```

### Cache Invalidation

```typescript
import { CacheService } from 'bootify/cache';
import { Service, Autowired } from 'bootify/core';

@Service()
export class ProductManager {
  constructor(
    @Autowired() private cacheService: CacheService,
    @Autowired() private productService: ProductService
  ) {}
  
  async updateProduct(id: number, data: any) {
    // Update product in database
    // ...
    
    // Invalidate specific product cache
    await this.cacheService.del(`product:${id}`);
    
    // Invalidate all products list cache
    await this.cacheService.del('products');
    
    return { id, ...data };
  }
}
```

### Custom Cache Store

```typescript
import { ICacheStore, CACHE_STORE_TOKEN } from 'bootify/cache';
import { Service } from 'bootify/core';
import Redis from 'ioredis';

@Service({ bindTo: [CACHE_STORE_TOKEN] })
export class RedisCacheStore implements ICacheStore {
  private client: Redis;
  
  constructor() {
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379')
    });
  }
  
  async get<T>(key: string): Promise<T | undefined> {
    const value = await this.client.get(key);
    if (!value) return undefined;
    return JSON.parse(value) as T;
  }
  
  async set(key: string, value: any, ttlInSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlInSeconds) {
      await this.client.setex(key, ttlInSeconds, serialized);
    } else {
      await this.client.set(key, serialized);
    }
  }
  
  async del(key: string): Promise<void> {
    await this.client.del(key);
  }
}
```

## API Reference

### CacheService

- `get<T>(key: string): Promise<T | undefined>`: Retrieve a cached item
- `set(key: string, value: any, ttlInSeconds?: number): Promise<void>`: Store an item in cache
- `del(key: string): Promise<void>`: Remove an item from cache

### Decorators

- `@Cached(keyPattern, ttlInSeconds?)`: Cache the result of a method