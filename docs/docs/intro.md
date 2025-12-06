---
sidebar_position: 1
slug: /intro
title: Introduction
---

# Welcome to BootifyJS

**BootifyJS** is a modern, declarative Node.js framework that brings the productivity and elegance of Spring Boot to the TypeScript ecosystem. Built on the high-performance foundations of **Fastify**, BootifyJS makes building complex, scalable, and maintainable backend applications not just possible, but elegant and enjoyable.

## Why BootifyJS?

If you've ever felt that Node.js frameworks require too much boilerplate, lack structure, or make dependency management cumbersome, BootifyJS is for you. We've taken the best ideas from enterprise frameworks and adapted them for the modern JavaScript ecosystem.

### The Problem

Traditional Node.js development often involves:

- **Manual dependency wiring** - Passing dependencies through constructors or using global singletons
- **Scattered routing logic** - Route definitions separated from their handlers
- **Boilerplate-heavy code** - Repetitive setup for common patterns like caching, validation, and error handling
- **Weak typing** - Configuration and environment variables that aren't type-safe
- **Complex event handling** - Building reliable event-driven systems from scratch

### The BootifyJS Solution

BootifyJS addresses these challenges with:

- **Powerful Dependency Injection** - Automatic dependency resolution with a full-featured DI container
- **Decorator-Driven Development** - Clean, self-documenting code using TypeScript decorators
- **Convention Over Configuration** - Sensible defaults that get you productive immediately
- **Type Safety Everywhere** - From configuration to API responses, everything is typed
- **Enterprise Features Built-In** - Events, caching, logging, and more, ready to use

## Core Philosophy

BootifyJS is built on several core principles:

### 1. Developer Experience First

Frameworks should reduce complexity, not add to it. Every feature in BootifyJS is designed to make your development faster and more enjoyable.

```typescript
// This is all you need for a working API endpoint
@Controller("/users")
export class UserController {
  @Get("/")
  getUsers() {
    return [{ id: 1, name: "John" }];
  }
}
```

### 2. Convention Over Configuration

We provide sensible defaults and automatic wiring so you can focus on business logic, not framework setup.

```typescript
// Dependencies are automatically injected
@Controller("/users")
export class UserController {
  constructor(private userService: UserService, private logger: Logger) {}
}
```

### 3. Robustness by Default

Production-ready features like startup validation, graceful shutdown, and resilient event handling are built-in.

```typescript
// Configuration is validated at startup
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  PORT: z.coerce.number().default(3000),
});

await createBootify().useConfig(envSchema).start();
```

### 4. Extensibility

While the framework works out-of-the-box, it's designed to be pluggable. Bring your own implementations for caching, authentication, databases, and more.

## Key Features

### 🎯 Decorator-Driven Architecture

Write clean, readable code with decorators for controllers, services, routing, validation, and more.

```typescript
@Controller("/api/products")
export class ProductController {
  @Get("/:id")
  @Validate(ProductIdSchema)
  async getProduct(@Param("id") id: string) {
    return this.productService.findById(id);
  }

  @Post("/")
  @Validate(CreateProductSchema)
  async createProduct(@Body() product: CreateProductDto) {
    return this.productService.create(product);
  }
}
```

### 💉 Powerful Dependency Injection

Full-featured DI container with constructor injection, property injection, interface binding, and multiple scopes.

```typescript
@Service()
export class UserService {
  constructor(
    private userRepository: UserRepository,
    private eventBus: EventBus,
    private logger: Logger
  ) {}

  async createUser(data: CreateUserDto) {
    const user = await this.userRepository.create(data);
    await this.eventBus.publish(new UserCreatedEvent(user));
    return user;
  }
}
```

### 📡 Event-Driven Architecture

Built-in async event bus with automatic retries, dead-letter queue, and high-performance buffered processing.

```typescript
@EventHandler(UserCreatedEvent)
export class SendWelcomeEmailHandler {
  async handle(event: UserCreatedEvent) {
    await this.emailService.sendWelcome(event.user);
  }
}
```

### ⚡ Built on Fastify

Leverage the incredible performance and rich plugin ecosystem of one of the fastest web frameworks for Node.js.

```typescript
await createBootify()
  .usePlugin(async (app) => {
    await app.register(cors, { origin: "*" });
    await app.register(helmet);
  })
  .start();
```

### 🔒 Type-Safe Configuration

Schema-driven configuration with Zod validation. Catch errors at startup, not in production.

```typescript
const configSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(32),
});

// Config is fully typed throughout your application
const config = AppConfig.get();
console.log(config.DATABASE_URL); // TypeScript knows this is a string
```

### 🚀 Pluggable Caching

Decorator-driven caching with in-memory store out-of-the-box. Easily extend to Redis or other backends.

```typescript
@Service()
export class ProductService {
  @Cacheable({ key: "product", ttl: 3600 })
  async getProduct(id: string) {
    return this.productRepository.findById(id);
  }

  @CacheEvict({ key: "product" })
  async updateProduct(id: string, data: UpdateProductDto) {
    return this.productRepository.update(id, data);
  }
}
```

## Who Should Use BootifyJS?

BootifyJS is perfect for:

- **Teams building enterprise applications** that need structure and maintainability
- **Developers coming from Spring Boot, NestJS, or .NET** who want familiar patterns in Node.js
- **Projects that need to scale** with clean architecture and separation of concerns
- **Anyone tired of boilerplate** who wants to focus on business logic

## What's Next?

Ready to get started? Here's your path forward:

1. **Installation** - Set up BootifyJS in minutes (coming soon)
2. **Quick Start** - Build your first API (coming soon)
3. **Core Concepts** - Understand the fundamentals (coming soon)
4. **Templates** - Copy-paste production-ready code (coming soon)

## Community and Support

- **GitHub**: [github.com/piyushpriyadarshi/bootifyjs](https://github.com/piyushpriyadarshi/bootifyjs)
- **Issues**: [Report bugs or request features](https://github.com/piyushpriyadarshi/bootifyjs/issues)
- **Discussions**: [Ask questions and share ideas](https://github.com/piyushpriyadarshi/bootifyjs/discussions)

## License

BootifyJS is [MIT licensed](https://github.com/piyushpriyadarshi/bootifyjs/blob/main/LICENSE).

---

**Let's build something amazing together!** 🚀
