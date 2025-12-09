# BootifyJS: A Modern, Declarative Node.js Framework

**BootifyJS** is a powerful, modern, and developer-friendly web framework for Node.js, built on the high-performance foundations of **Fastify**. Inspired by the productivity and robust architecture of Spring Boot, BootifyJS brings declarative programming, a powerful Dependency Injection system, and an enterprise-grade feature set to the TypeScript ecosystem.

Our goal is to make building complex, scalable, and maintainable backend applications not just possible, but elegant and enjoyable.

## Core Features

- **Declarative & Decorator-Driven:** Write clean, readable, and self-documenting code using a rich set of decorators for controllers, services, dependency injection, and more.
- **Powerful Dependency Injection:** A full-featured DI container that supports constructor and property injection, interface binding, scopes, and eager loading.
- **Event-Driven Architecture:** A built-in, asynchronous event bus with automatic retries and a dead-letter queue, plus high-performance buffered event processing with worker threads, priority queues, and advanced monitoring.
- **Pluggable Caching:** A decorator-driven caching system that works out-of-the-box with an in-memory store and can be seamlessly extended to use Redis or other backends.
- **Type-Safe Configuration:** A schema-driven configuration system that validates your environment at startup, catching errors early and providing fully typed config objects.
- **Flexible Logging:** A builder-pattern logging system with no external dependencies - bring your own logger (Pino, Winston, etc.) or use the built-in BaseLogger.
- **Built on Fastify:** Leverage the incredible performance and rich plugin ecosystem of one of the fastest web frameworks for Node.js.

## Getting Started

### Installation

To create a new BootifyJS project, you can use our upcoming CLI or set it up manually.

```bash
# (Coming Soon)
# npx bootifyjs-cli new my-project

# Manual Installation
npm install bootifyjs fastify reflect-metadata
```

### Your First Application

Here's a simple "Hello World" application to show you how easy it is to get started.

**1. Create your main server file:**

```typescript
// src/server.ts
import "reflect-metadata";
import { createBootify, Controller, Get } from "bootifyjs";

@Controller("/hello")
export class HelloController {
  @Get("/")
  sayHello() {
    return { message: "Hello from BootifyJS!" };
  }
}

async function main() {
  await createBootify()
    .setServiceName("my-app")
    .setPort(3000)
    .useControllers([HelloController])
    .start();
}

main();
```

**2. Run your application:**

```bash
npx ts-node src/server.ts
```

You can now visit `http://localhost:3000/hello` in your browser or with `curl` to see your application running!

### Builder Pattern API

BootifyJS uses a fluent builder pattern for configuration:

```typescript
import { createBootify } from "bootifyjs";
import { z } from "zod";

const configSchema = z.object({
  DATABASE_URL: z.string(),
  REDIS_HOST: z.string().default("localhost"),
});

async function main() {
  const { app, start, logger } = await createBootify()
    .setServiceName("my-api")
    .setPort(3000)
    .setHostname("0.0.0.0")
    .useConfig(configSchema)
    .useControllers([UserController, ProductController])
    .useMiddleware(authMiddleware)
    .useErrorHandler((error, request, reply) => {
      logger.error("Request failed", error);
      reply.status(500).send({ error: "Internal Server Error" });
    })
    .useLogger((builder) =>
      builder
        .setLevel("debug")
        .configureConsole({ colorize: true, prettyPrint: true })
    )
    .beforeStart(async (app) => {
      // Run migrations, connect to databases, etc.
    })
    .afterStart(async (app) => {
      // Post-startup tasks
    })
    .build();

  await start();
}
```

### Available Builder Methods

| Method                    | Description                                          |
| ------------------------- | ---------------------------------------------------- |
| `setServiceName(name)`    | Set the application name (used in logs)              |
| `setPort(port)`           | Set the server port                                  |
| `setHostname(host)`       | Set the server hostname                              |
| `setFastifyOptions(opts)` | Pass custom Fastify options                          |
| `useConfig(schema)`       | Initialize type-safe config with Zod schema          |
| `useControllers([...])`   | Register controller classes                          |
| `usePlugin(fn)`           | Register a Fastify plugin                            |
| `useMiddleware(fn)`       | Add request middleware                               |
| `useMiddlewares([...])`   | Add multiple middlewares                             |
| `useErrorHandler(fn)`     | Set custom error handler                             |
| `useLogger(fn)`           | Configure the logging system                         |
| `useScheduler(enabled)`   | Enable/disable the job scheduler                     |
| `beforeStart(fn)`         | Hook to run before server starts                     |
| `afterStart(fn)`          | Hook to run after server starts                      |
| `build()`                 | Build and return `{ app, start, logger, scheduler }` |
| `start()`                 | Build and start the server immediately               |

## Logging

BootifyJS provides a flexible logging system with no external dependencies:

```typescript
import { createLogger, getLogger } from "bootifyjs/logging";

// Option 1: Use built-in BaseLogger
const logger = createLogger()
  .setLevel("debug")
  .setServiceName("my-api")
  .configureConsole({ colorize: true, prettyPrint: true })
  .build();

logger.info("Server started", { port: 3000 });
logger.error("Something went wrong", new Error("Oops"), { userId: 123 });
```

### Bring Your Own Logger

Create an adapter that implements `ILogger`:

```typescript
// adapters/pino-adapter.ts
import pino from "pino";
import { ILogger, LogContext } from "bootifyjs/logging";

export class PinoAdapter implements ILogger {
  private logger: pino.Logger;

  constructor(options: { level?: string; prettyPrint?: boolean } = {}) {
    this.logger = pino({
      level: options.level ?? "info",
      transport: options.prettyPrint
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
    });
  }

  info(message: string, context?: LogContext): void {
    this.logger.info(context ?? {}, message);
  }

  error(message: string, error?: Error, context?: LogContext): void {
    this.logger.error({ ...context, err: error }, message);
  }

  // ... implement other methods: trace, debug, warn, fatal, child
}
```

Then use it with BootifyApp:

```typescript
import { createBootify } from "bootifyjs";
import { PinoAdapter } from "./adapters/pino-adapter";

createBootify()
  .useLogger((builder) =>
    builder.use(new PinoAdapter({ level: "info", prettyPrint: true }))
  )
  .start();
```

## Philosophy

BootifyJS is built on a few core principles:

- **Developer Experience First:** Frameworks should reduce boilerplate and complexity, not add to it. Our primary goal is to make development fast, intuitive, and enjoyable.
- **Convention Over Configuration:** We provide sensible defaults and automatic wiring so you can focus on writing business logic.
- **Robustness by Default:** Features like startup validation, graceful shutdown, and resilient event handling are built-in, helping you write production-ready code from day one.
- **Extensibility:** While the framework works out-of-the-box, it's designed to be pluggable and extensible. You can easily bring your own implementations for caching, authentication, logging, and more.

## Documentation

Dive deeper into the features of BootifyJS:

- [**Core Module**](https://github.com/piyushpriyadarshi/bootifyjs/tree/main/src/core): Learn about the Dependency Injection system, decorators, and component lifecycle.
- [**Configuration**](https://github.com/piyushpriyadarshi/bootifyjs/tree/main/src/config): Master the type-safe, schema-driven configuration system.
- [**Events Module**](https://github.com/piyushpriyadarshi/bootifyjs/tree/main/src/events): Master the event bus for building decoupled, event-driven services.
- [**Cache Module**](https://github.com/piyushpriyadarshi/bootifyjs/tree/main/src/cache): Speed up your application with our decorator-driven caching system.
- [**Logging**](https://github.com/piyushpriyadarshi/bootifyjs/tree/main/src/logging): Understand the structured, context-aware logging system.
- [**Scheduling**](https://github.com/piyushpriyadarshi/bootifyjs/tree/main/src/scheduling): Set up cron jobs and scheduled tasks.
