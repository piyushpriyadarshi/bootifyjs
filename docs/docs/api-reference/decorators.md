---
id: decorators
title: Decorators API Reference
sidebar_label: Decorators
description: Complete reference for all BootifyJS decorators
keywords: [bootifyjs, decorators, api, reference]
---

# Decorators API Reference

BootifyJS provides a comprehensive set of decorators for building declarative, type-safe applications. This page documents all available decorators with their parameters, usage examples, and best practices.

## Core Decorators

### Class Decorators

#### @Controller

Marks a class as a controller and registers it with the routing system.

**Signature:**

```typescript
@Controller(prefix?: string): ClassDecorator
```

**Parameters:**

- `prefix` (optional): URL prefix for all routes in this controller. Default: `''`

**Example:**

```typescript
import { Controller, Get } from "bootifyjs";

@Controller("/users")
export class UserController {
  @Get("/")
  getAllUsers() {
    return [{ id: 1, name: "John" }];
  }

  @Get("/:id")
  getUserById(@Param("id") id: string) {
    return { id, name: "John" };
  }
}
```

---

#### @Service

Marks a class as a service and registers it in the dependency injection container.

**Signature:**

```typescript
@Service(options?: ComponentOptions): ClassDecorator
```

**Parameters:**

- `options` (optional): Configuration options
  - `scope`: `'singleton'` | `'transient'` - Lifecycle scope (default: `'singleton'`)
  - `bindTo`: `DiToken[]` - Array of tokens to bind this service to (for interface injection)
  - `eager`: `boolean` - Whether to instantiate immediately on startup

**Example:**

```typescript
import { Service } from "bootifyjs";

@Service()
export class UserService {
  async findAll() {
    return [{ id: 1, name: "John" }];
  }
}

// With options
@Service({ scope: "transient", bindTo: [IUserService] })
export class UserService implements IUserService {
  // ...
}
```

---

#### @Repository

Marks a class as a repository (data access layer). Functionally equivalent to `@Service` but provides semantic clarity.

**Signature:**

```typescript
@Repository(options?: ComponentOptions): ClassDecorator
```

**Parameters:**

- Same as `@Service`

**Example:**

```typescript
import { Repository } from "bootifyjs";

@Repository()
export class UserRepository {
  private users = new Map();

  async findById(id: string) {
    return this.users.get(id);
  }

  async save(user: any) {
    this.users.set(user.id, user);
  }
}
```

---

#### @Component

Generic decorator for registering any class in the DI container. `@Service` and `@Repository` are aliases of this decorator.

**Signature:**

```typescript
@Component(options?: ComponentOptions): ClassDecorator
```

**Parameters:**

- Same as `@Service`

---

#### @UseMiddleware

Applies middleware to all routes in a controller or to a specific route method.

**Signature:**

```typescript
@UseMiddleware(...middlewares: FastifyMiddleware[]): MethodDecorator & ClassDecorator
```

**Parameters:**

- `middlewares`: One or more middleware functions

**Example:**

```typescript
import { Controller, Get, UseMiddleware } from "bootifyjs";

// Class-level middleware (applies to all routes)
@Controller("/admin")
@UseMiddleware(authMiddleware, roleMiddleware)
export class AdminController {
  @Get("/users")
  getUsers() {
    return [];
  }

  // Method-level middleware (applies only to this route)
  @Get("/settings")
  @UseMiddleware(superAdminMiddleware)
  getSettings() {
    return {};
  }
}
```

---

### Method Decorators

#### @Get

Defines a GET route handler.

**Signature:**

```typescript
@Get(path?: string): MethodDecorator
```

**Parameters:**

- `path` (optional): Route path. Default: `'/'`

**Example:**

```typescript
@Controller("/users")
export class UserController {
  @Get("/")
  getAllUsers() {
    return [];
  }

  @Get("/:id")
  getUserById(@Param("id") id: string) {
    return { id };
  }
}
```

---

#### @Post

Defines a POST route handler.

**Signature:**

```typescript
@Post(path?: string): MethodDecorator
```

**Parameters:**

- `path` (optional): Route path. Default: `'/'`

**Example:**

```typescript
@Controller("/users")
export class UserController {
  @Post("/")
  createUser(@Body() userData: any) {
    return { id: "123", ...userData };
  }
}
```

---

#### @Put

Defines a PUT route handler.

**Signature:**

```typescript
@Put(path?: string): MethodDecorator
```

**Parameters:**

- `path` (optional): Route path. Default: `'/'`

---

#### @Delete

Defines a DELETE route handler.

**Signature:**

```typescript
@Delete(path?: string): MethodDecorator
```

**Parameters:**

- `path` (optional): Route path. Default: `'/'`

**Example:**

```typescript
@Controller("/users")
export class UserController {
  @Delete("/:id")
  deleteUser(@Param("id") id: string) {
    return { deleted: true, id };
  }
}
```

---

#### @Patch

Defines a PATCH route handler.

**Signature:**

```typescript
@Patch(path?: string): MethodDecorator
```

**Parameters:**

- `path` (optional): Route path. Default: `'/'`

---

#### @Schema

Defines validation schemas for request body, query parameters, and path parameters using Zod.

**Signature:**

```typescript
@Schema(schema: ValidationDecoratorOptions): MethodDecorator
```

**Parameters:**

- `schema`: Validation configuration object
  - `body`: Zod schema for request body
  - `query`: Zod schema for query parameters
  - `params`: Zod schema for path parameters
  - `responses`: Object mapping status codes to Zod schemas for responses

**Example:**

```typescript
import { Controller, Post, Schema } from "bootifyjs";
import { z } from "zod";

const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().min(18).optional(),
});

const UserResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  createdAt: z.string(),
});

@Controller("/users")
export class UserController {
  @Post("/")
  @Schema({
    body: CreateUserSchema,
    responses: {
      201: UserResponseSchema,
    },
  })
  createUser(@Body() userData: z.infer<typeof CreateUserSchema>) {
    return {
      id: "123",
      ...userData,
      createdAt: new Date().toISOString(),
    };
  }
}
```

---

#### @Swagger

Adds OpenAPI/Swagger documentation metadata to a route.

**Signature:**

```typescript
@Swagger(options: SwaggerOptions): MethodDecorator
```

**Parameters:**

- `options`: Swagger documentation options
  - `summary`: Brief description of the endpoint
  - `description`: Detailed description
  - `tags`: Array of tags for grouping
  - `deprecated`: Whether the endpoint is deprecated
  - `operationId`: Unique identifier for the operation
  - `security`: Security requirements

**Example:**

```typescript
import { Controller, Get, Swagger, Schema } from "bootifyjs";

@Controller("/users")
export class UserController {
  @Get("/:id")
  @Swagger({
    summary: "Get user by ID",
    description: "Retrieves a single user by their unique identifier",
    tags: ["Users"],
    deprecated: false,
    operationId: "getUserById",
  })
  @Schema({
    params: z.object({ id: z.string() }),
  })
  getUserById(@Param("id") id: string) {
    return { id, name: "John" };
  }
}
```

---

### Parameter Decorators

#### @Body

Injects the request body into a method parameter.

**Signature:**

```typescript
@Body(): ParameterDecorator
```

**Example:**

```typescript
@Post('/users')
createUser(@Body() userData: any) {
  return { id: '123', ...userData };
}
```

---

#### @Query

Injects query parameters into a method parameter.

**Signature:**

```typescript
@Query(name?: string): ParameterDecorator
```

**Parameters:**

- `name` (optional): Specific query parameter name. If omitted, injects all query parameters.

**Example:**

```typescript
@Get('/users')
getUsers(@Query('page') page: string, @Query('limit') limit: string) {
  return { page, limit, users: [] };
}

// Or inject all query parameters
@Get('/search')
search(@Query() query: Record<string, string>) {
  return { query };
}
```

---

#### @Param

Injects a path parameter into a method parameter.

**Signature:**

```typescript
@Param(name: string): ParameterDecorator
```

**Parameters:**

- `name`: Path parameter name

**Example:**

```typescript
@Get('/users/:id')
getUserById(@Param('id') id: string) {
  return { id };
}

@Get('/posts/:postId/comments/:commentId')
getComment(
  @Param('postId') postId: string,
  @Param('commentId') commentId: string
) {
  return { postId, commentId };
}
```

---

#### @Req

Injects the Fastify request object into a method parameter.

**Signature:**

```typescript
@Req(): ParameterDecorator
```

**Example:**

```typescript
import { FastifyRequest } from 'fastify';

@Get('/info')
getRequestInfo(@Req() request: FastifyRequest) {
  return {
    method: request.method,
    url: request.url,
    headers: request.headers
  };
}
```

---

#### @Res

Injects the Fastify reply object into a method parameter.

**Signature:**

```typescript
@Res(): ParameterDecorator
```

**Example:**

```typescript
import { FastifyReply } from 'fastify';

@Get('/download')
downloadFile(@Res() reply: FastifyReply) {
  reply.header('Content-Type', 'application/pdf');
  reply.send(fileBuffer);
}
```

---

### Property Decorators

#### @Autowired

Injects a dependency into a class property or constructor parameter.

**Signature:**

```typescript
@Autowired(token?: DiToken): PropertyDecorator & ParameterDecorator
```

**Parameters:**

- `token` (optional): DI token to resolve. Required for constructor injection and interface injection.

**Example:**

```typescript
// Property injection
@Controller("/users")
export class UserController {
  @Autowired()
  private userService!: UserService;

  @Get("/")
  getAllUsers() {
    return this.userService.findAll();
  }
}

// Constructor injection
@Service()
export class UserService {
  constructor(@Autowired(IUserRepository) private userRepo: IUserRepository) {}
}

// Interface injection
const IUserService = Symbol.for("IUserService");

@Service({ bindTo: [IUserService] })
export class UserService implements IUserService {
  // ...
}

@Controller("/users")
export class UserController {
  @Autowired(IUserService)
  private userService!: IUserService;
}
```

---

## Events Decorators

### @EventListener

Marks a class as an event listener container.

**Signature:**

```typescript
@EventListener(): ClassDecorator
```

**Example:**

```typescript
import { EventListener, OnEvent } from "bootifyjs";

@EventListener()
export class UserEventHandler {
  @OnEvent("user.created")
  handleUserCreated(event: any) {
    console.log("User created:", event.payload);
  }
}
```

---

### @OnEvent

Registers a method as a handler for a specific event type.

**Signature:**

```typescript
@OnEvent(eventType: string): MethodDecorator
```

**Parameters:**

- `eventType`: Unique string identifier for the event

**Example:**

```typescript
@EventListener()
export class OrderEventHandler {
  @OnEvent("order.created")
  async handleOrderCreated(event: IEvent) {
    console.log("Processing order:", event.payload);
    // Send confirmation email
  }

  @OnEvent("order.cancelled")
  async handleOrderCancelled(event: IEvent) {
    console.log("Order cancelled:", event.payload);
    // Process refund
  }
}
```

---

## Cache Decorators

### @Cacheable

Caches the result of a method call.

**Signature:**

```typescript
@Cacheable(options: CacheableOptions): MethodDecorator
```

**Parameters:**

- `options`: Cache configuration
  - `key`: Base cache key
  - `ttl` (optional): Time-to-live in seconds

**Example:**

```typescript
import { Service, Cacheable } from "bootifyjs";

@Service()
export class UserService {
  @Cacheable({ key: "user", ttl: 300 })
  async findById(id: string) {
    // This result will be cached for 5 minutes
    return await this.userRepo.findById(id);
  }
}
```

---

### @CacheEvict

Evicts a cache entry after method execution.

**Signature:**

```typescript
@CacheEvict(options: { key: string }): MethodDecorator
```

**Parameters:**

- `options`: Cache eviction configuration
  - `key`: Cache key to evict

**Example:**

```typescript
@Service()
export class UserService {
  @Cacheable({ key: "user", ttl: 300 })
  async findById(id: string) {
    return await this.userRepo.findById(id);
  }

  @CacheEvict({ key: "user" })
  async updateUser(id: string, data: any) {
    // Cache will be evicted after this method completes
    return await this.userRepo.update(id, data);
  }
}
```

---

## Logging Decorators

### @Audit

Creates a structured audit log after successful method execution.

**Signature:**

```typescript
@Audit(options: AuditOptions): MethodDecorator
```

**Parameters:**

- `options`: Audit configuration
  - `action`: Action being performed (e.g., 'create', 'update', 'delete')
  - `resource`: Resource type being acted upon
  - `resourceIdPath` (optional): Path to extract resource ID from args or result

**Example:**

```typescript
import { Service, Audit } from "bootifyjs";

@Service()
export class UserService {
  @Audit({
    action: "create",
    resource: "user",
    resourceIdPath: "result.id",
  })
  async createUser(userData: any) {
    const user = await this.userRepo.save(userData);
    // Audit log will be created with user.id
    return user;
  }

  @Audit({
    action: "delete",
    resource: "user",
    resourceIdPath: "args.0",
  })
  async deleteUser(userId: string) {
    await this.userRepo.delete(userId);
  }
}
```

---

### @Loggable

Injects a child logger instance into a class, automatically namespaced with the class name.

**Signature:**

```typescript
@Loggable(): ClassDecorator
```

**Example:**

```typescript
import { Service, Loggable } from "bootifyjs";

@Service()
@Loggable()
export class UserService {
  private logger!: Logger; // Automatically injected

  async findAll() {
    this.logger.info("Fetching all users");
    return await this.userRepo.findAll();
  }
}
```

---

## Best Practices

### Decorator Ordering

When using multiple decorators, apply them in this order:

1. Class decorators (`@Controller`, `@Service`, etc.)
2. Middleware decorators (`@UseMiddleware`)
3. Route decorators (`@Get`, `@Post`, etc.)
4. Documentation decorators (`@Swagger`)
5. Validation decorators (`@Schema`)
6. Caching decorators (`@Cacheable`, `@CacheEvict`)
7. Logging decorators (`@Audit`)

**Example:**

```typescript
@Controller("/users")
@UseMiddleware(authMiddleware)
export class UserController {
  @Get("/:id")
  @Swagger({ summary: "Get user by ID" })
  @Schema({ params: z.object({ id: z.string() }) })
  @Cacheable({ key: "user", ttl: 300 })
  getUserById(@Param("id") id: string) {
    return { id };
  }
}
```

### Type Safety

Always use TypeScript types with decorators for better IDE support and type checking:

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  name: z.string(),
  email: z.string().email()
});

type User = z.infer<typeof UserSchema>;

@Post('/users')
@Schema({ body: UserSchema })
createUser(@Body() user: User) {
  // user is properly typed
  return user;
}
```

### Dependency Injection

Prefer constructor injection over property injection for required dependencies:

```typescript
// Good: Constructor injection
@Service()
export class UserService {
  constructor(
    @Autowired() private userRepo: UserRepository,
    @Autowired() private logger: Logger
  ) {}
}

// Acceptable: Property injection for optional dependencies
@Service()
export class UserService {
  @Autowired()
  private cacheService?: CacheService;
}
```

---

## See Also

- [Core API Reference](./core-api.md)
- [Events API Reference](./events-api.md)
- [Cache API Reference](./cache-api.md)
- [Logging API Reference](./logging-api.md)
