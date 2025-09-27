# BootifyJS: A Modern, Declarative Node.js Framework

**BootifyJS** is a powerful, modern, and developer-friendly web framework for Node.js, built on the high-performance foundations of **Fastify**. Inspired by the productivity and robust architecture of Spring Boot, BootifyJS brings declarative programming, a powerful Dependency Injection system, and an enterprise-grade feature set to the TypeScript ecosystem.

Our goal is to make building complex, scalable, and maintainable backend applications not just possible, but elegant and enjoyable.

## Core Features

- **Declarative & Decorator-Driven:** Write clean, readable, and self-documenting code using a rich set of decorators for controllers, services, dependency injection, and more.
- **Powerful Dependency Injection:** A full-featured DI container that supports constructor and property injection, interface binding, scopes, and eager loading.
- **Event-Driven Architecture:** A built-in, asynchronous event bus with automatic retries and a dead-letter queue, plus high-performance buffered event processing with worker threads, priority queues, and advanced monitoring.
- **Pluggable Caching:** A decorator-driven caching system that works out-of-the-box with an in-memory store and can be seamlessly extended to use Redis or other backends.
- **Type-Safe Configuration:** A schema-driven configuration system that validates your environment at startup, catching errors early and providing fully typed config objects.
- **Built on Fastify:** Leverage the incredible performance and rich plugin ecosystem of one of the fastest web frameworks for Node.js.

## Getting Started

### Installation

To create a new BootifyJS project, you can use our upcoming CLI or set it up manually.

```
# (Coming Soon)
# npx bootifyjs-cli new my-project

# Manual Installation
npm install bootifyjs fastify reflect-metadata
```

### Your First Application

Here’s a simple "Hello World" application to show you how easy it is to get started.

**1. Create your main server file:**

```
// src/server.ts
import 'reflect-metadata';
import { createBootifyApp, Controller, Get } from 'bootifyjs';

@Controller('/hello')
export class HelloController {
  @Get('/')
  sayHello() {
    return { message: 'Hello from BootifyJS!' };
  }
}

async function main() {
  // Import your controller file to ensure its decorators run
  await import('./controllers/hello.controller');

  const { start } = await createBootifyApp({
    controllers: [HelloController],
    port: 3000,
  });

  await start();
}

main();
```

**2. Run your application:**

```
npx ts-node src/server.ts
```

You can now visit `http://localhost:3000/hello` in your browser or with `curl` to see your application running!

## Philosophy

BootifyJS is built on a few core principles:

- **Developer Experience First:** Frameworks should reduce boilerplate and complexity, not add to it. Our primary goal is to make development fast, intuitive, and enjoyable.
- **Convention Over Configuration:** We provide sensible defaults and automatic wiring so you can focus on writing business logic.
- **Robustness by Default:** Features like startup validation, graceful shutdown, and resilient event handling are built-in, helping you write production-ready code from day one.
- **Extensibility:** While the framework works out-of-the-box, it's designed to be pluggable and extensible. You can easily bring your own implementations for caching, authentication, and more.

## Documentation

Dive deeper into the features of BootifyJS:

- [**Core Module**](https://github.com/piyushpriyadarshi/bootifyjs/tree/main/src/core 'null')**:** Learn about the Dependency Injection system, decorators, and component lifecycle.
- [**Configuration**](https://github.com/piyushpriyadarshi/bootifyjs/tree/main/src/config 'null')**:** Master the type-safe, schema-driven configuration system.
- [**Events Module**](https://github.com/piyushpriyadarshi/bootifyjs/tree/main/src/events 'null')**:** Master the event bus for building decoupled, event-driven services.
- [**Cache Module**](https://github.com/piyushpriyadarshi/bootifyjs/tree/main/src/cache 'null')**:** Speed up your application with our decorator-driven caching system.
- [**Logging**](https://github.com/piyushpriyadarshi/bootifyjs/tree/main/src/logging 'null')**:** Understand the structured, context-aware logging system.# bootifyjs
