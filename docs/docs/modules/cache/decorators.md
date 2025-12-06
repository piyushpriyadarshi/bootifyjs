---
id: cache-decorators
title: Cache Decorators
sidebar_label: Decorators
description: Learn how to use @Cacheable and @CacheEvict decorators for method-level caching in BootifyJS
keywords: [bootifyjs, cache, decorators, cacheable, cache-evict, method-caching]
---

# Cache Decorators

BootifyJS provides powerful decorators for method-level caching that make it easy to add caching to your application with minimal code changes.

## @Cacheable

The `@Cacheable` decorator automatically caches the return value of a method. When the method is called again with the same arguments, the cached value is returned instead of executing the method.

### Basic Usage

```typescript
import { Service } from "bootifyjs";
import { Cacheable } from "bootifyjs/cache";

@Service()
export class ProductService {
  @Cacheable({ key: "product" })
  async getProduct(id: string) {
    console.log("Fetching product from database...");
    return await this.database.findProduct(id);
  }
}
```

When you call `getProduct('123')`:

- **First call**: Executes the method, stores result in cache
- **Subsequent calls**: Returns cached value immediately

### With TTL (Time-To-Live)

Set an expiration time for cached values:

```typescript
@Service()
export class UserService {
  // Cache for 5 minutes (300 seconds)
  @Cacheable({ key: "user", ttl: 300 })
  async getUser(id: string) {
    return await this.database.findUser(id);
  }

  // Cache for 1 hour
  @Cacheable({ key: "user-profile", ttl: 3600 })
  async getUserProfile(id: string) {
    return await this.database.findUserProfile(id);
  }
}
```

### Automatic Key Generation

The cache key is automatically generated based on the base key and method arguments:

```typescript
@Service()
export class OrderService {
  @Cacheable({ key: "order" })
  async getOrder(orderId: string, includeItems: boolean) {
    return await this.database.findOrder(orderId, includeItems);
  }
}

// Each call generates a unique cache key:
// getOrder('123', true)  → 'order::"123":true'
// getOrder('123', false) → 'order::"123":false'
// getOrder('456', true)  → 'order::"456":true'
```

### Multiple Arguments

The decorator handles multiple arguments automatically:

```typescript
@Service()
export class SearchService {
  @Cacheable({ key: "search-results", ttl: 600 })
  async search(query: string, page: number, limit: number) {
    return await this.performSearch(query, page, limit);
  }
}

// Cache key: 'search-results::"laptop":1:10'
const results = await searchService.search("laptop", 1, 10);
```

### Complex Objects as Arguments

The decorator serializes complex objects using JSON.stringify:

```typescript
interface SearchFilters {
  category: string;
  minPrice: number;
  maxPrice: number;
}

@Service()
export class ProductService {
  @Cacheable({ key: "filtered-products", ttl: 300 })
  async searchProducts(filters: SearchFilters) {
    return await this.database.searchProducts(filters);
  }
}

// Cache key includes serialized filter object
const products = await productService.searchProducts({
  category: "electronics",
  minPrice: 100,
  maxPrice: 500,
});
```

## @CacheEvict

The `@CacheEvict` decorator removes entries from the cache. Use it on methods that modify data to ensure the cache stays fresh.

### Basic Usage

```typescript
import { Service } from "bootifyjs";
import { Cacheable, CacheEvict } from "bootifyjs/cache";

@Service()
export class UserService {
  @Cacheable({ key: "user", ttl: 300 })
  async getUser(id: string) {
    return await this.database.findUser(id);
  }

  @CacheEvict({ key: "user" })
  async updateUser(id: string, data: Partial<User>) {
    const updated = await this.database.updateUser(id, data);
    // Cache is automatically evicted after successful update
    return updated;
  }

  @CacheEvict({ key: "user" })
  async deleteUser(id: string) {
    await this.database.deleteUser(id);
    // Cache is automatically evicted after successful deletion
  }
}
```

### Execution Order

The `@CacheEvict` decorator:

1. Executes the original method first
2. If successful, evicts the cache entry
3. Returns the method result

This ensures cache is only evicted if the operation succeeds.

### Matching Cache Keys

The eviction key must match the caching key for the same arguments:

```typescript
@Service()
export class ProductService {
  // Cache key: 'product::"123"'
  @Cacheable({ key: "product" })
  async getProduct(id: string) {
    return await this.database.findProduct(id);
  }

  // Evicts cache key: 'product::"123"'
  @CacheEvict({ key: "product" })
  async updateProduct(id: string, data: Partial<Product>) {
    return await this.database.updateProduct(id, data);
  }
}
```

## Combining Decorators

You can use both decorators in the same service:

```typescript
@Service()
export class BlogService {
  @Cacheable({ key: "blog-post", ttl: 600 })
  async getPost(id: string) {
    return await this.database.findPost(id);
  }

  @Cacheable({ key: "blog-posts", ttl: 300 })
  async getAllPosts() {
    return await this.database.findAllPosts();
  }

  @CacheEvict({ key: "blog-post" })
  async updatePost(id: string, data: Partial<Post>) {
    return await this.database.updatePost(id, data);
  }

  @CacheEvict({ key: "blog-post" })
  async deletePost(id: string) {
    await this.database.deletePost(id);
  }
}
```

## Real-World Examples

### E-commerce Product Catalog

```typescript
@Service()
export class CatalogService {
  // Cache individual products for 1 hour
  @Cacheable({ key: "product", ttl: 3600 })
  async getProduct(productId: string) {
    return await this.database.products.findById(productId);
  }

  // Cache category listings for 10 minutes
  @Cacheable({ key: "category-products", ttl: 600 })
  async getProductsByCategory(categoryId: string, page: number) {
    return await this.database.products.findByCategory(categoryId, page);
  }

  // Evict product cache when updated
  @CacheEvict({ key: "product" })
  async updateProduct(productId: string, updates: ProductUpdate) {
    return await this.database.products.update(productId, updates);
  }

  // Evict product cache when inventory changes
  @CacheEvict({ key: "product" })
  async updateInventory(productId: string, quantity: number) {
    return await this.database.products.updateInventory(productId, quantity);
  }
}
```

### User Profile Service

```typescript
@Service()
export class ProfileService {
  // Cache user profiles for 5 minutes
  @Cacheable({ key: "user-profile", ttl: 300 })
  async getProfile(userId: string) {
    const user = await this.database.users.findById(userId);
    const preferences = await this.database.preferences.findByUserId(userId);
    return { ...user, preferences };
  }

  // Evict profile cache when user updates their info
  @CacheEvict({ key: "user-profile" })
  async updateProfile(userId: string, data: ProfileUpdate) {
    await this.database.users.update(userId, data);
    return await this.getProfile(userId);
  }

  // Evict profile cache when preferences change
  @CacheEvict({ key: "user-profile" })
  async updatePreferences(userId: string, preferences: UserPreferences) {
    await this.database.preferences.update(userId, preferences);
  }
}
```

### API Integration Service

```typescript
@Service()
export class WeatherService {
  // Cache weather data for 15 minutes
  @Cacheable({ key: "weather", ttl: 900 })
  async getWeather(city: string) {
    console.log(`Fetching weather for ${city} from external API...`);
    const response = await fetch(`https://api.weather.com/v1/${city}`);
    return await response.json();
  }

  // Cache forecast for 1 hour
  @Cacheable({ key: "forecast", ttl: 3600 })
  async getForecast(city: string, days: number) {
    console.log(`Fetching ${days}-day forecast for ${city}...`);
    const response = await fetch(
      `https://api.weather.com/v1/forecast/${city}?days=${days}`
    );
    return await response.json();
  }
}
```

## Configuration Options

### @Cacheable Options

```typescript
interface CacheableOptions {
  /** Base key for the cache entry */
  key: string;

  /** Time-to-live in seconds (optional) */
  ttl?: number;
}
```

### @CacheEvict Options

```typescript
interface CacheEvictOptions {
  /** Base key for the cache entry to evict */
  key: string;
}
```

## Best Practices

### 1. Choose Appropriate TTL Values

```typescript
// Short TTL for frequently changing data
@Cacheable({ key: 'stock-price', ttl: 60 }) // 1 minute

// Medium TTL for semi-static data
@Cacheable({ key: 'product-details', ttl: 600 }) // 10 minutes

// Long TTL for rarely changing data
@Cacheable({ key: 'country-list', ttl: 86400 }) // 24 hours
```

### 2. Use Descriptive Cache Keys

```typescript
// Good: Descriptive and specific
@Cacheable({ key: 'user-orders' })
@Cacheable({ key: 'product-reviews' })
@Cacheable({ key: 'category-tree' })

// Avoid: Generic or ambiguous
@Cacheable({ key: 'data' })
@Cacheable({ key: 'result' })
```

### 3. Evict Related Caches

```typescript
@Service()
export class OrderService {
  @Cacheable({ key: "order", ttl: 300 })
  async getOrder(orderId: string) {
    return await this.database.findOrder(orderId);
  }

  @Cacheable({ key: "user-orders", ttl: 300 })
  async getUserOrders(userId: string) {
    return await this.database.findOrdersByUser(userId);
  }

  // Evict both order and user-orders caches
  async updateOrder(orderId: string, data: OrderUpdate) {
    const order = await this.database.updateOrder(orderId, data);

    // Manual eviction for related caches
    await this.cacheService.del(`order::"${orderId}"`);
    await this.cacheService.del(`user-orders::"${order.userId}"`);

    return order;
  }
}
```

### 4. Handle Errors Gracefully

```typescript
@Service()
export class DataService {
  @Cacheable({ key: "external-data", ttl: 600 })
  async fetchExternalData(id: string) {
    try {
      return await this.externalApi.getData(id);
    } catch (error) {
      // Don't cache errors
      throw error;
    }
  }
}
```

### 5. Monitor Cache Performance

```typescript
@Service()
export class MetricsService {
  @Cacheable({ key: "analytics", ttl: 300 })
  async getAnalytics(userId: string) {
    const start = Date.now();
    const data = await this.computeAnalytics(userId);
    const duration = Date.now() - start;

    console.log(`Analytics computation took ${duration}ms`);
    return data;
  }
}
```

## Limitations and Considerations

### Serialization

Arguments are serialized using `JSON.stringify`, which has limitations:

- Functions are not serialized
- Circular references cause errors
- Date objects become strings
- Map and Set objects become empty objects

```typescript
// Works well
@Cacheable({ key: 'data' })
async getData(id: string, options: { limit: number }) { }

// May have issues
@Cacheable({ key: 'data' })
async getData(callback: Function) { } // Functions not serialized
```

### Memory Usage

In-memory caching consumes application memory:

```typescript
// Be cautious with large datasets
@Cacheable({ key: 'large-dataset', ttl: 3600 })
async getLargeDataset() {
  // Returns 100MB of data
  return await this.database.getAllRecords();
}
```

Consider using Redis for large datasets or distributed systems.

### Cache Invalidation

Cache invalidation is one of the hardest problems in computer science. Plan your eviction strategy carefully:

```typescript
@Service()
export class ComplexService {
  // Multiple related caches may need coordination
  @Cacheable({ key: "entity-a" })
  async getEntityA(id: string) {}

  @Cacheable({ key: "entity-b" })
  async getEntityB(id: string) {}

  // Updating A might affect B
  @CacheEvict({ key: "entity-a" })
  async updateEntityA(id: string, data: any) {
    // Consider also evicting entity-b if related
  }
}
```

## Next Steps

- Learn about [Cache Stores](./stores.md) for different storage backends
- Create [Custom Cache Stores](./custom-stores.md) for specific requirements
- Review the [Cache Overview](./overview.md) for architectural details
