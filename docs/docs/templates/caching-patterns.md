---
id: caching-patterns
title: Caching Patterns Template
sidebar_label: Caching Patterns
description: Caching patterns and strategies with BootifyJS
keywords: [bootifyjs, caching, redis, performance, template]
---

# Caching Patterns Template

This template demonstrates various caching patterns and strategies using BootifyJS's caching module to improve application performance.

## Setup

### 1. Install Dependencies

```bash
npm install redis ioredis
```

### 2. Configure Cache

```typescript title="src/config/cache.config.ts"
import { CacheConfig } from "bootifyjs/cache";

export const cacheConfig: CacheConfig = {
  default: "memory",
  stores: {
    memory: {
      type: "memory",
      max: 1000,
      ttl: 300, // 5 minutes
    },
    redis: {
      type: "redis",
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
      ttl: 3600, // 1 hour
    },
  },
};
```

## Pattern 1: Method-Level Caching

Cache expensive method results automatically:

```typescript title="src/services/product.service.ts"
import { Injectable } from "bootifyjs";
import { Cacheable, CacheEvict } from "bootifyjs/cache";
import { ProductRepository } from "../repositories/product.repository";

@Injectable()
export class ProductService {
  constructor(private productRepository: ProductRepository) {}

  // Cache result for 5 minutes
  @Cacheable({ key: "products:all", ttl: 300 })
  async getAllProducts() {
    console.log("Fetching all products from database...");
    return this.productRepository.findAll();
  }

  // Cache with dynamic key based on parameter
  @Cacheable({ key: (id: string) => `product:${id}`, ttl: 600 })
  async getProductById(id: string) {
    console.log(`Fetching product ${id} from database...`);
    return this.productRepository.findById(id);
  }

  // Cache with multiple parameters
  @Cacheable({
    key: (category: string, page: number) =>
      `products:${category}:page:${page}`,
    ttl: 300,
  })
  async getProductsByCategory(category: string, page: number = 1) {
    console.log(`Fetching products for category ${category}, page ${page}...`);
    return this.productRepository.findByCategory(category, page);
  }

  // Evict cache when data changes
  @CacheEvict({ key: "products:all" })
  @CacheEvict({ key: (product: any) => `product:${product.id}` })
  async createProduct(product: any) {
    return this.productRepository.create(product);
  }

  @CacheEvict({ key: (id: string) => `product:${id}` })
  @CacheEvict({ key: "products:all" })
  async updateProduct(id: string, data: any) {
    return this.productRepository.update(id, data);
  }

  @CacheEvict({ key: (id: string) => `product:${id}` })
  @CacheEvict({ key: "products:all" })
  async deleteProduct(id: string) {
    return this.productRepository.delete(id);
  }
}
```

## Pattern 2: Manual Cache Management

For more control, use the CacheService directly:

```typescript title="src/services/user.service.ts"
import { Injectable } from "bootifyjs";
import { CacheService } from "bootifyjs/cache";
import { UserRepository } from "../repositories/user.repository";

@Injectable()
export class UserService {
  constructor(
    private userRepository: UserRepository,
    private cacheService: CacheService
  ) {}

  async getUserProfile(userId: string) {
    const cacheKey = `user:profile:${userId}`;

    // Try to get from cache
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      console.log("Cache hit");
      return cached;
    }

    // Cache miss - fetch from database
    console.log("Cache miss - fetching from database");
    const user = await this.userRepository.findById(userId);

    if (user) {
      // Store in cache for 10 minutes
      await this.cacheService.set(cacheKey, user, 600);
    }

    return user;
  }

  async updateUserProfile(userId: string, data: any) {
    const user = await this.userRepository.update(userId, data);

    // Update cache
    const cacheKey = `user:profile:${userId}`;
    await this.cacheService.set(cacheKey, user, 600);

    return user;
  }

  async invalidateUserCache(userId: string) {
    const cacheKey = `user:profile:${userId}`;
    await this.cacheService.delete(cacheKey);
  }
}
```

## Pattern 3: Cache-Aside (Lazy Loading)

Load data into cache only when requested:

```typescript title="src/services/analytics.service.ts"
import { Injectable } from "bootifyjs";
import { CacheService } from "bootifyjs/cache";

@Injectable()
export class AnalyticsService {
  constructor(private cacheService: CacheService) {}

  async getPageViews(pageId: string, date: string) {
    const cacheKey = `analytics:pageviews:${pageId}:${date}`;

    // Try cache first
    let views = await this.cacheService.get<number>(cacheKey);

    if (views === null) {
      // Calculate from raw data (expensive operation)
      views = await this.calculatePageViews(pageId, date);

      // Cache for 1 hour
      await this.cacheService.set(cacheKey, views, 3600);
    }

    return views;
  }

  private async calculatePageViews(
    pageId: string,
    date: string
  ): Promise<number> {
    // Expensive calculation
    console.log(`Calculating page views for ${pageId} on ${date}`);
    return Math.floor(Math.random() * 10000);
  }
}
```

## Pattern 4: Write-Through Cache

Update cache immediately when data changes:

```typescript title="src/services/settings.service.ts"
import { Injectable } from "bootifyjs";
import { CacheService } from "bootifyjs/cache";
import { SettingsRepository } from "../repositories/settings.repository";

@Injectable()
export class SettingsService {
  constructor(
    private settingsRepository: SettingsRepository,
    private cacheService: CacheService
  ) {}

  async getSetting(key: string) {
    const cacheKey = `settings:${key}`;

    // Try cache first
    let value = await this.cacheService.get(cacheKey);

    if (value === null) {
      // Load from database
      value = await this.settingsRepository.findByKey(key);

      if (value !== null) {
        // Cache indefinitely (settings rarely change)
        await this.cacheService.set(cacheKey, value);
      }
    }

    return value;
  }

  async updateSetting(key: string, value: any) {
    // Update database
    await this.settingsRepository.update(key, value);

    // Update cache immediately
    const cacheKey = `settings:${key}`;
    await this.cacheService.set(cacheKey, value);

    return value;
  }
}
```

## Pattern 5: Cache Warming

Pre-populate cache with frequently accessed data:

```typescript title="src/services/cache-warmer.service.ts"
import { Injectable } from "bootifyjs";
import { CacheService } from "bootifyjs/cache";
import { ProductRepository } from "../repositories/product.repository";

@Injectable()
export class CacheWarmerService {
  constructor(
    private cacheService: CacheService,
    private productRepository: ProductRepository
  ) {}

  async warmCache() {
    console.log("Warming cache...");

    // Load popular products
    const popularProducts = await this.productRepository.findPopular(100);
    for (const product of popularProducts) {
      await this.cacheService.set(`product:${product.id}`, product, 3600);
    }

    // Load categories
    const categories = await this.productRepository.findAllCategories();
    await this.cacheService.set("categories:all", categories, 3600);

    console.log("Cache warming complete");
  }

  async scheduleWarmup() {
    // Warm cache every hour
    setInterval(() => this.warmCache(), 3600000);
  }
}
```

## Pattern 6: Multi-Level Caching

Use multiple cache layers for optimal performance:

```typescript title="src/services/content.service.ts"
import { Injectable } from "bootifyjs";
import { CacheService } from "bootifyjs/cache";

@Injectable()
export class ContentService {
  private memoryCache: Map<string, { data: any; expires: number }> = new Map();

  constructor(private cacheService: CacheService) {}

  async getContent(contentId: string) {
    // Level 1: In-memory cache (fastest)
    const memCached = this.getFromMemory(contentId);
    if (memCached) {
      console.log("Memory cache hit");
      return memCached;
    }

    // Level 2: Redis cache
    const cacheKey = `content:${contentId}`;
    const redisCached = await this.cacheService.get(cacheKey);
    if (redisCached) {
      console.log("Redis cache hit");
      // Store in memory for next time
      this.setInMemory(contentId, redisCached, 60);
      return redisCached;
    }

    // Level 3: Database
    console.log("Cache miss - fetching from database");
    const content = await this.fetchFromDatabase(contentId);

    // Store in both caches
    await this.cacheService.set(cacheKey, content, 3600);
    this.setInMemory(contentId, content, 60);

    return content;
  }

  private getFromMemory(key: string) {
    const cached = this.memoryCache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }
    this.memoryCache.delete(key);
    return null;
  }

  private setInMemory(key: string, data: any, ttlSeconds: number) {
    this.memoryCache.set(key, {
      data,
      expires: Date.now() + ttlSeconds * 1000,
    });
  }

  private async fetchFromDatabase(contentId: string) {
    // Database fetch logic
    return { id: contentId, title: "Sample Content" };
  }
}
```

## Pattern 7: Cache Stampede Prevention

Prevent multiple simultaneous requests from hitting the database:

```typescript title="src/services/report.service.ts"
import { Injectable } from "bootifyjs";
import { CacheService } from "bootifyjs/cache";

@Injectable()
export class ReportService {
  private pendingRequests: Map<string, Promise<any>> = new Map();

  constructor(private cacheService: CacheService) {}

  async generateReport(reportId: string) {
    const cacheKey = `report:${reportId}`;

    // Check cache first
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Check if generation is already in progress
    const pending = this.pendingRequests.get(reportId);
    if (pending) {
      console.log("Waiting for pending report generation...");
      return pending;
    }

    // Start generation
    const promise = this.doGenerateReport(reportId);
    this.pendingRequests.set(reportId, promise);

    try {
      const report = await promise;

      // Cache the result
      await this.cacheService.set(cacheKey, report, 1800);

      return report;
    } finally {
      this.pendingRequests.delete(reportId);
    }
  }

  private async doGenerateReport(reportId: string) {
    console.log(`Generating report ${reportId}...`);
    // Expensive report generation
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return { id: reportId, data: "Report data" };
  }
}
```

## Pattern 8: Time-Based Cache Invalidation

Automatically refresh cache at specific intervals:

```typescript title="src/services/dashboard.service.ts"
import { Injectable } from "bootifyjs";
import { CacheService } from "bootifyjs/cache";

@Injectable()
export class DashboardService {
  constructor(private cacheService: CacheService) {
    this.scheduleRefresh();
  }

  async getDashboardData() {
    const cacheKey = "dashboard:data";
    let data = await this.cacheService.get(cacheKey);

    if (!data) {
      data = await this.fetchDashboardData();
      await this.cacheService.set(cacheKey, data, 300); // 5 minutes
    }

    return data;
  }

  private async fetchDashboardData() {
    console.log("Fetching fresh dashboard data...");
    // Aggregate data from multiple sources
    return {
      users: 1000,
      orders: 500,
      revenue: 50000,
      timestamp: new Date(),
    };
  }

  private scheduleRefresh() {
    // Refresh cache every 5 minutes
    setInterval(async () => {
      const data = await this.fetchDashboardData();
      await this.cacheService.set("dashboard:data", data, 300);
      console.log("Dashboard cache refreshed");
    }, 300000);
  }
}
```

## Pattern 9: Conditional Caching

Cache based on conditions:

```typescript title="src/services/search.service.ts"
import { Injectable } from "bootifyjs";
import { CacheService } from "bootifyjs/cache";

@Injectable()
export class SearchService {
  constructor(private cacheService: CacheService) {}

  async search(query: string, filters: any = {}) {
    // Only cache simple searches without filters
    const shouldCache = Object.keys(filters).length === 0 && query.length > 3;

    if (shouldCache) {
      const cacheKey = `search:${query}`;
      const cached = await this.cacheService.get(cacheKey);
      if (cached) {
        return cached;
      }

      const results = await this.performSearch(query, filters);
      await this.cacheService.set(cacheKey, results, 600);
      return results;
    }

    // Don't cache complex searches
    return this.performSearch(query, filters);
  }

  private async performSearch(query: string, filters: any) {
    console.log(`Searching for: ${query}`);
    // Search logic
    return [];
  }
}
```

## Best Practices

- **Cache Key Design**: Use hierarchical, descriptive keys (e.g., `user:profile:123`)
- **TTL Strategy**: Set appropriate TTL based on data volatility
- **Cache Invalidation**: Invalidate cache when data changes
- **Stampede Prevention**: Prevent multiple simultaneous cache misses
- **Monitoring**: Track cache hit rates and performance
- **Serialization**: Be mindful of what you cache (avoid large objects)
- **Error Handling**: Handle cache failures gracefully
- **Multi-Level**: Use memory + Redis for optimal performance

## Performance Tips

1. **Cache Hot Data**: Focus on frequently accessed data
2. **Appropriate TTL**: Balance freshness vs. performance
3. **Batch Operations**: Use multi-get/set when possible
4. **Compression**: Compress large cached values
5. **Monitoring**: Track cache metrics (hit rate, size, latency)

## Next Steps

- Implement cache metrics and monitoring
- Add cache warming on application startup
- Set up Redis cluster for high availability
- Implement distributed cache invalidation
- Add cache versioning for schema changes
- Integrate with CDN for static content

:::tip
Use the `@Cacheable` decorator for simple caching needs and manual `CacheService` for complex scenarios requiring fine-grained control.
:::
