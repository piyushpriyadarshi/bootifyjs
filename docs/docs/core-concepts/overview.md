---
id: overview
title: Core Concepts Overview
sidebar_label: Overview
description: Understanding the fundamental concepts and philosophy behind BootifyJS
keywords: [bootifyjs, core concepts, framework philosophy, architecture]
---

# Core Concepts Overview

BootifyJS is a modern, declarative Node.js framework built on top of Fastify that brings the power of decorators, dependency injection, and convention-over-configuration to backend development. This section introduces the fundamental concepts that make BootifyJS powerful and developer-friendly.

## Framework Philosophy

BootifyJS is designed around several core principles:

### 1. **Declarative Over Imperative**

Instead of writing boilerplate code to wire up routes, middleware, and dependencies, you declare your intentions using decorators. The framework handles the implementation details.

```typescript
// Declarative approach with BootifyJS
@Controller("/users")
export class UserController {
  @Get("/:id")
  getUser(@Param("id") id: string) {
    return { id, name: "John" };
  }
}
```

### 2. **Dependency Injection First**

BootifyJS uses a powerful dependency injection container that automatically resolves and injects dependencies. This promotes loose coupling, testability, and clean architecture.

```typescript
@Service()
export class UserService {
  @Autowired()
  private repository!: UserRepository;

  findUser(id: string) {
    return this.repository.findById(id);
  }
}
```

### 3. **Type Safety**

Built with TypeScript from the ground up, BootifyJS leverages the type system to catch errors at compile time and provide excellent IDE support with autocomplete and inline documentation.

### 4. **Performance Without Compromise**

By building on Fastify, one of the fastest Node.js web frameworks, BootifyJS delivers exceptional performance while maintaining developer ergonomics.

### 5. **Convention Over Configuration**

Sensible defaults and conventions reduce the amount of configuration needed. You can get started quickly and customize only what you need.

## Key Concepts

### Decorators

Decorators are the primary way you interact with BootifyJS. They provide metadata that the framework uses to configure your application:

- **Class Decorators**: `@Controller`, `@Service`, `@Repository`, `@Component`
- **Method Decorators**: `@Get`, `@Post`, `@Put`, `@Delete`, `@Patch`
- **Parameter Decorators**: `@Body`, `@Param`, `@Query`, `@Req`, `@Res`
- **Property Decorators**: `@Autowired`

### Dependency Injection

The DI container manages the lifecycle of your components and automatically resolves dependencies. It supports:

- **Constructor injection**: Dependencies passed to the constructor
- **Property injection**: Dependencies injected into class properties
- **Scope management**: Singleton and transient scopes
- **Interface binding**: Inject by interface or abstract class

### Application Lifecycle

BootifyJS provides a clear application lifecycle with hooks for initialization, startup, and shutdown:

1. **Configuration**: Load and validate environment variables
2. **Registration**: Register components, controllers, and middleware
3. **Initialization**: Bootstrap services and establish connections
4. **Startup**: Start the HTTP server
5. **Runtime**: Handle requests
6. **Shutdown**: Graceful cleanup (future feature)

### Request Context

Every request runs in an isolated context that can store request-specific data. This is powered by Node.js AsyncLocalStorage and allows you to access request data anywhere in your call stack without explicitly passing it around.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    BootifyApp                           │
│  (Application Builder & Configuration)                  │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
┌──────────┐  ┌──────────┐  ┌──────────┐
│ Fastify  │  │    DI    │  │  Router  │
│ Instance │  │Container │  │ Registry │
└──────────┘  └──────────┘  └──────────┘
        │            │            │
        └────────────┼────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
┌──────────┐  ┌──────────┐  ┌──────────┐
│Controllers│ │ Services │  │Repositories│
└──────────┘  └──────────┘  └──────────┘
```

## Component Types

BootifyJS recognizes several component types, each with a specific role:

### Controllers

Handle HTTP requests and responses. Controllers define routes and orchestrate the flow of data between the client and your business logic.

```typescript
@Controller("/api/users")
export class UserController {
  @Get("/")
  getAllUsers() {
    return [];
  }
}
```

### Services

Contain business logic and coordinate between different parts of your application. Services are typically injected into controllers.

```typescript
@Service()
export class UserService {
  processUser(data: any) {
    // Business logic here
  }
}
```

### Repositories

Handle data access and persistence. Repositories abstract away the details of how data is stored and retrieved.

```typescript
@Repository()
export class UserRepository {
  findAll() {
    // Data access logic
  }
}
```

### Components

Generic components that don't fit into the above categories. Use `@Component` for utilities, helpers, and other services.

```typescript
@Component()
export class EmailService {
  sendEmail(to: string, subject: string) {
    // Email logic
  }
}
```

## What's Next?

Now that you understand the core philosophy and concepts, dive deeper into each topic:

- **[Dependency Injection](./dependency-injection.md)**: Learn how to use the DI container effectively
- **[Decorators](./decorators.md)**: Master all available decorators and their use cases
- **[Application Lifecycle](./lifecycle.md)**: Understand the application startup and runtime behavior
- **[Request Context](./request-context.md)**: Work with request-scoped data across your application

Each of these concepts builds on the foundation established here, giving you the tools to build robust, maintainable applications with BootifyJS.
