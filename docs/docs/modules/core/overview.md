---
id: core-overview
title: Core Module Overview
sidebar_label: Overview
description: Introduction to the Core module - the foundation of BootifyJS applications
keywords:
  [bootifyjs, core module, controllers, services, routing, dependency injection]
---

# Core Module Overview

The Core module is the foundation of every BootifyJS application. It provides the essential building blocks for creating web APIs: controllers for handling HTTP requests, services for business logic, dependency injection for managing components, and a powerful routing system.

## What's in the Core Module?

The Core module includes:

- **Controllers**: Classes that handle HTTP requests and define API endpoints
- **Services**: Classes that contain business logic and can be injected into controllers
- **Repositories**: Classes that handle data access and persistence
- **Dependency Injection**: Automatic management of component lifecycles and dependencies
- **Routing**: Declarative route definition using decorators
- **Validation**: Request validation using Zod schemas
- **Middleware**: Request/response interceptors for cross-cutting concerns

## Quick Example

Here's a complete example showing the Core module in action:

```typescript
import { Controller, Get, Post, Body, Service, Repository } from "bootifyjs";
import { z } from "zod";

// Repository - Data Access Layer
@Repository()
export class UserRepository {
  private users = new Map<string, User>();

  findAll() {
    return Array.from(this.users.values());
  }

  create(name: string, email: string) {
    const id = Date.now().toString();
    const user = { id, name, email };
    this.users.set(id, user);
    return user;
  }
}

// Service - Business Logic Layer
@Service()
export class UserService {
  constructor(private readonly repository: UserRepository) {}

  getAllUsers() {
    return this.repository.findAll();
  }

  createUser(name: string, email: string) {
    return this.repository.create(name, email);
  }
}

// Controller - API Layer
@Controller("/users")
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get("/")
  getAllUsers() {
    return this.userService.getAllUsers();
  }

  @Post("/")
  @Schema({
    body: z.object({
      name: z.string().min(2),
      email: z.string().email(),
    }),
  })
  createUser(@Body() body: { name: string; email: string }) {
    return this.userService.createUser(body.name, body.email);
  }
}
```

## Architecture Pattern

The Core module encourages a layered architecture:

```
┌─────────────────────────────────────┐
│         Controllers                 │  ← HTTP Layer (Routes, Validation)
│  @Controller, @Get, @Post, etc.    │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│          Services                   │  ← Business Logic Layer
│  @Service, business rules           │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│        Repositories                 │  ← Data Access Layer
│  @Repository, database operations   │
└─────────────────────────────────────┘
```

**Benefits:**

- **Separation of Concerns**: Each layer has a specific responsibility
- **Testability**: Easy to test each layer independently
- **Maintainability**: Changes in one layer don't affect others
- **Reusability**: Services can be used by multiple controllers

## Key Concepts

### 1. Declarative Programming

BootifyJS uses decorators to declare behavior instead of imperative code:

```typescript
// Declarative - What you want
@Controller("/api/products")
export class ProductController {
  @Get("/:id")
  getProduct(@Param("id") id: string) {
    return { id, name: "Product" };
  }
}

// vs Imperative - How to do it
app.get("/api/products/:id", (req, res) => {
  const id = req.params.id;
  res.send({ id, name: "Product" });
});
```

### 2. Dependency Injection

Components are automatically instantiated and injected:

```typescript
@Service()
export class EmailService {
  sendEmail(to: string, subject: string) {
    // Email logic
  }
}

@Service()
export class UserService {
  // EmailService is automatically injected
  constructor(private readonly emailService: EmailService) {}

  async registerUser(email: string) {
    // Use the injected service
    await this.emailService.sendEmail(email, "Welcome!");
  }
}
```

### 3. Type Safety

TypeScript types are preserved throughout the request lifecycle:

```typescript
const createUserSchema = z.object({
  name: z.string(),
  age: z.number()
});

type CreateUserDto = z.infer<typeof createUserSchema>;

@Post('/')
@Schema({ body: createUserSchema })
createUser(@Body() body: CreateUserDto) {
  // body is fully typed: { name: string; age: number }
  return body;
}
```

## Core Decorators

The Core module provides these essential decorators:

### Class Decorators

- `@Controller(prefix)` - Define a controller with route prefix
- `@Service(options)` - Register a service in the DI container
- `@Repository(options)` - Register a repository in the DI container
- `@Component(options)` - Register any class in the DI container

### Method Decorators

- `@Get(path)` - Define a GET route
- `@Post(path)` - Define a POST route
- `@Put(path)` - Define a PUT route
- `@Delete(path)` - Define a DELETE route
- `@Patch(path)` - Define a PATCH route
- `@Schema(options)` - Validate request data with Zod
- `@UseMiddleware(...middlewares)` - Apply middleware to routes

### Parameter Decorators

- `@Body()` - Extract request body
- `@Param(name)` - Extract route parameter
- `@Query(name)` - Extract query parameter
- `@Req()` - Inject Fastify request object
- `@Res()` - Inject Fastify reply object

### Property Decorators

- `@Autowired(token?)` - Inject dependencies into properties

## Getting Started

To use the Core module, import the decorators you need:

```typescript
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Service,
  Repository,
  Schema,
} from "bootifyjs";
```

Then create your application:

```typescript
import { BootifyApp } from "bootifyjs";

const app = new BootifyApp({
  port: 3000,
  controllers: [UserController, ProductController],
});

await app.start();
```

## Next Steps

Explore the detailed documentation for each Core module feature:

- **[Controllers](./controllers.md)** - Learn how to create API endpoints
- **[Services](./services.md)** - Understand business logic organization
- **[Routing](./routing.md)** - Master HTTP method decorators and route patterns
- **[Validation](./validation.md)** - Validate requests with Zod schemas

For foundational concepts, see:

- [Dependency Injection](../../core-concepts/dependency-injection.md)
- [Decorators](../../core-concepts/decorators.md)
- [Application Lifecycle](../../core-concepts/lifecycle.md)
