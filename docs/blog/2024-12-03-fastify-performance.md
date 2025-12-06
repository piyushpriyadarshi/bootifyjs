---
slug: why-fastify-performance-matters
title: "Why We Built on Fastify: Performance That Scales"
authors: [piyush]
tags: [performance, fastify, architecture]
---

When we set out to build BootifyJS, choosing the right foundation was critical. After extensive benchmarking and evaluation, we chose Fastify. Here's why performance was non-negotiable and how BootifyJS leverages Fastify's speed.

<!-- truncate -->

## The Performance Gap

Let's look at some real-world benchmarks comparing popular Node.js frameworks:

| Framework | Requests/sec | Latency (avg) |
| --------- | ------------ | ------------- |
| Fastify   | 76,835       | 1.2ms         |
| Koa       | 54,848       | 1.8ms         |
| Express   | 38,510       | 2.5ms         |
| NestJS\*  | 35,200       | 2.8ms         |

\*NestJS with Express adapter

Fastify is **2x faster** than Express and significantly outperforms other frameworks. This matters when you're handling thousands of requests per second.

## Why Fastify?

### 1. Schema-Based Validation

Fastify uses JSON Schema for request/response validation, compiled to highly optimized code:

```typescript
@Controller("/api/users")
class UserController {
  @Post("/")
  @Schema({
    body: {
      type: "object",
      required: ["email", "name"],
      properties: {
        email: { type: "string", format: "email" },
        name: { type: "string", minLength: 2 },
      },
    },
  })
  createUser(@Body() data: CreateUserDto) {
    return this.userService.create(data);
  }
}
```

This validation is **10x faster** than runtime validation libraries.

### 2. Efficient Serialization

Fastify's `fast-json-stringify` serializes responses up to 2x faster than `JSON.stringify`:

```typescript
@Get('/')
@Schema({
  response: {
    200: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          name: { type: 'string' },
          email: { type: 'string' },
        },
      },
    },
  },
})
getUsers() {
  return this.userService.findAll();
}
```

### 3. Plugin Architecture

Fastify's encapsulated plugin system prevents memory leaks and enables clean separation:

```typescript
// BootifyJS automatically registers your modules as Fastify plugins
@Module({
  controllers: [UserController],
  providers: [UserService],
})
class UserModule {}
```

### 4. Async/Await Native

Fastify was built from the ground up for async/await, avoiding callback hell and promise overhead:

```typescript
@Get('/:id')
async getUser(@Param('id') id: string) {
  const user = await this.userService.findById(id);
  if (!user) {
    throw new NotFoundException('User not found');
  }
  return user;
}
```

## BootifyJS Optimizations

We've added several optimizations on top of Fastify:

### Decorator Compilation

Decorators are processed at startup, not runtime:

```typescript
// This metadata is compiled once at startup
@Controller("/api/products")
class ProductController {
  @Get("/")
  @Cache({ ttl: 60 })
  getProducts() {
    return this.productService.findAll();
  }
}
```

### Efficient DI Resolution

Dependencies are resolved and cached at startup:

```typescript
// Resolution happens once, not per request
@Injectable({ scope: "singleton" })
class ProductService {
  constructor(private db: DatabaseService, private cache: CacheService) {}
}
```

### Request Context Pooling

For request-scoped services, we use object pooling to reduce GC pressure:

```typescript
@Injectable({ scope: "request" })
class RequestContext {
  // Pooled and reused across requests
}
```

## Real-World Impact

In production, these optimizations translate to:

- **Lower infrastructure costs** - Handle more traffic with fewer servers
- **Better user experience** - Faster response times
- **Higher reliability** - Less CPU pressure means more headroom for spikes

## Benchmarking Your App

BootifyJS includes built-in performance monitoring:

```typescript
import { BootifyApp } from "bootifyjs";

const app = new BootifyApp({
  metrics: {
    enabled: true,
    endpoint: "/metrics",
  },
});
```

Access Prometheus-compatible metrics at `/metrics` to monitor:

- Request latency percentiles
- Requests per second
- Error rates
- Memory usage

## Conclusion

Performance isn't just about bragging rights—it directly impacts your bottom line and user experience. By building on Fastify and adding our own optimizations, BootifyJS delivers enterprise features without sacrificing speed.

Ready to experience the performance? Check out our [getting started guide](/docs/intro).
