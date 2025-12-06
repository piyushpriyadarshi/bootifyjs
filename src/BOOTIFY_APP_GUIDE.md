# BootifyApp - Flexible Application Builder

## Overview

`BootifyApp` provides a flexible, builder-pattern API for creating Bootify applications with full control over initialization, plugins, middleware, and lifecycle hooks.

## Why BootifyApp?

The original `createBootifyApp()` was too opinionated. `BootifyApp` gives you:

✅ **Full control** over initialization order
✅ **Flexible plugin registration**
✅ **Custom error handlers**
✅ **Lifecycle hooks** (before/after start)
✅ **Builder pattern** for clean, readable code
✅ **No magic** - you control everything

## Quick Start

### Simple Example

```typescript
import { createBootify } from "bootify";
import { HealthController, TodoController } from "./controllers";

const app = await createBootify()
  .setPort(8080)
  .useControllers([HealthController, TodoController])
  .start();
```

### With Configuration

```typescript
import { createBootify } from "bootify";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.string(),
  JWT_SECRET: z.string(),
  DATABASE_URL: z.string(),
});

const { app, start } = await createBootify()
  .useConfig(envSchema)
  .setPort(8080)
  .setHostname("0.0.0.0")
  .useControllers([HealthController, TodoController])
  .build();

await start();
```

## API Reference

### Core Methods

#### `setPort(port: number)`

Set the server port.

```typescript
createBootify().setPort(3000);
```

#### `setHostname(hostname: string)`

Set the server hostname.

```typescript
createBootify().setHostname("0.0.0.0");
```

#### `setFastifyOptions(options: FastifyServerOptions)`

Set Fastify server options.

```typescript
createBootify().setFastifyOptions({
  logger: true,
  ignoreTrailingSlash: false,
  bodyLimit: 1048576, // 1MB
});
```

#### `useConfig(schema: ZodObject<any>)`

Initialize AppConfig with validation schema.

```typescript
const schema = z.object({
  NODE_ENV: z.string(),
  PORT: z.coerce.number(),
});

createBootify().useConfig(schema);
```

#### `useControllers(controllers: Constructor[])`

Register controllers.

```typescript
createBootify().useControllers([
  HealthController,
  UserController,
  ProductController,
]);
```

### Plugin & Middleware Methods

#### `usePlugin(plugin: (app: FastifyInstance) => Promise<void>)`

Register a custom plugin.

```typescript
createBootify().usePlugin(async (app) => {
  await app.register(cors, {
    origin: "*",
    methods: ["GET", "POST"],
  });
});
```

#### `useMiddleware(middleware: FastifyMiddleware)`

Add a global middleware (onRequest hook).

```typescript
const authMiddleware = async (request, reply) => {
  // Authentication logic
};

createBootify().useMiddleware(authMiddleware);
```

#### `useMiddlewares(middlewares: FastifyMiddleware[])`

Add multiple middlewares at once.

```typescript
createBootify().useMiddlewares([
  corsMiddleware,
  authMiddleware,
  loggingMiddleware,
]);
```

### Error Handling

#### `useErrorHandler(handler: ErrorHandlerFn)`

Set a custom error handler.

```typescript
createBootify().useErrorHandler((error, request, reply) => {
  if (error instanceof CustomError) {
    reply.status(error.statusCode).send({
      error: error.message,
      code: error.code,
    });
  } else {
    reply.status(500).send({ error: "Internal Server Error" });
  }
});
```

### Lifecycle Hooks

#### `beforeStart(hook: (app: FastifyInstance) => Promise<void>)`

Run code before server starts.

```typescript
createBootify().beforeStart(async (app) => {
  // Initialize database
  await database.connect();

  // Initialize Redis
  await redis.connect();

  console.log("Services initialized");
});
```

#### `afterStart(hook: (app: FastifyInstance) => Promise<void>)`

Run code after server starts.

```typescript
createBootify().afterStart(async (app) => {
  console.log("Server is ready!");

  // Start background jobs
  await jobQueue.start();
});
```

### Build & Start

#### `build()`

Build the application without starting it.

```typescript
const { app, start, logger } = await createBootify()
  .setPort(3000)
  .useControllers([HealthController])
  .build();

// Do something with app
app.get("/custom", async () => ({ hello: "world" }));

// Start when ready
await start();
```

#### `start()`

Build and start the application immediately.

```typescript
await createBootify().setPort(3000).useControllers([HealthController]).start();
```

## Complete Examples

### Example 1: Basic API

```typescript
import { createBootify } from "bootify";
import { HealthController, UserController } from "./controllers";

await createBootify()
  .setPort(8080)
  .useControllers([HealthController, UserController])
  .start();
```

### Example 2: With Plugins

```typescript
import { createBootify } from "bootify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

const { app, start } = await createBootify()
  .setPort(8080)

  // Register CORS
  .usePlugin(async (app) => {
    await app.register(cors, {
      origin: ["http://localhost:3000"],
      credentials: true,
    });
  })

  // Register Swagger
  .usePlugin(async (app) => {
    await app.register(swagger, {
      openapi: {
        info: {
          title: "My API",
          version: "1.0.0",
        },
      },
    });

    await app.register(swaggerUi, {
      routePrefix: "/api-docs",
    });
  })

  .useControllers([HealthController, UserController])
  .build();

await start();
```

### Example 3: With Database & Redis

```typescript
import { createBootify } from "bootify";
import { initDatabase } from "./database";
import { initRedis } from "./redis";

const { app, start } = await createBootify()
  .setPort(8080)

  // Initialize services before start
  .beforeStart(async () => {
    console.log("Initializing services...");
    await initDatabase();
    await initRedis();
    console.log("Services ready!");
  })

  .useControllers([HealthController, UserController])
  .build();

await start();
```

### Example 4: With Custom Error Handler

```typescript
import { createBootify } from "bootify";
import { ZodError } from "zod";

await createBootify()
  .setPort(8080)

  .useErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: "Validation Error",
        details: error.issues,
      });
    }

    if (error.name === "UnauthorizedError") {
      return reply.status(401).send({
        error: "Unauthorized",
        message: error.message,
      });
    }

    // Log error
    console.error("Unhandled error:", error);

    return reply.status(500).send({
      error: "Internal Server Error",
    });
  })

  .useControllers([HealthController, UserController])
  .start();
```

### Example 5: Full Production Setup

```typescript
import { createBootify } from "bootify";
import { z } from "zod";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { initDatabase } from "./database";
import { initRedis } from "./redis";
import { GlobalErrorHandler } from "./errors";

const envSchema = z.object({
  NODE_ENV: z.string(),
  PORT: z.coerce.number(),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string(),
  JWT_SECRET: z.string(),
});

const { app, start, logger } = await createBootify()
  // Configuration
  .useConfig(envSchema)
  .setPort(Number(process.env.PORT))
  .setHostname("0.0.0.0")

  // Fastify options
  .setFastifyOptions({
    bodyLimit: 10485760, // 10MB
    trustProxy: true,
  })

  // Initialize services
  .beforeStart(async () => {
    logger.info("Initializing core services...");
    await initDatabase();
    await initRedis();
    logger.info("Core services initialized");
  })

  // Security plugins
  .usePlugin(async (app) => {
    await app.register(helmet);
    await app.register(rateLimit, {
      max: 100,
      timeWindow: "1 minute",
    });
  })

  // CORS
  .usePlugin(async (app) => {
    await app.register(cors, {
      origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
      credentials: true,
    });
  })

  // Custom middlewares
  .useMiddlewares([authMiddleware, loggingMiddleware, timingMiddleware])

  // Controllers
  .useControllers([
    HealthController,
    AuthController,
    UserController,
    ProductController,
  ])

  // Error handler
  .useErrorHandler(GlobalErrorHandler.handle)

  // After start
  .afterStart(async () => {
    logger.info("Server is ready and accepting connections");
  })

  .build();

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully");
  await app.close();
  process.exit(0);
});

await start();
```

### Example 6: Your Custom Bootstrap (Converted)

```typescript
import { createBootify } from "bootify";
import { z } from "zod";
import cors from "@fastify/cors";
import fcookie from "@fastify/cookie";
import fastifyMultipart from "@fastify/multipart";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import metrics from "fastify-metrics";
import { initDb } from "./database";
import { RedisClient } from "./redis";
import { GlobalExceptionHandler } from "./errors";
import authenticate from "./middleware/authenticate";

const appSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(8000),
  JWT_SECRET: z.string().min(1),
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().default(6379),
});

const { app, start, logger } = await createBootify()
  // Configuration
  .useConfig(appSchema)
  .setPort(Number(process.env.PORT) || 8000)
  .setHostname("0.0.0.0")

  // Initialize core services
  .beforeStart(async () => {
    logger.info("Initializing core services...");

    // Database
    await initDb();

    // Redis
    const redisClient = RedisClient.getInstance();
    await redisClient.connect();

    logger.info("Core services initialized");
  })

  // Register plugins
  .usePlugin(async (app) => {
    // CORS
    await app.register(cors, {
      origin: [
        "http://localhost:3000",
        "http://localhost:4000",
        "https://app.example.com",
      ],
      methods: ["GET", "PUT", "PATCH", "POST", "DELETE"],
      credentials: true,
    });

    // Cookie
    await app.register(fcookie, {
      hook: "onRequest",
      parseOptions: {},
    });

    // Multipart
    await app.register(fastifyMultipart);

    // Metrics
    await app.register(metrics, {
      endpoint: "/metrics",
    });

    // Swagger
    await app.register(swagger, {
      openapi: {
        info: {
          title: "My API",
          version: "1.0.0",
        },
        servers: [
          { url: `http://localhost:${process.env.PORT}` },
          { url: "https://api.example.com" },
        ],
      },
    });

    await app.register(swaggerUi, {
      routePrefix: "/api-docs",
    });
  })

  // Authentication middleware
  .useMiddleware(authenticate(process.env.JWT_SECRET as string))

  // Controllers (dynamically imported)
  .beforeStart(async (app) => {
    const { default: AuthController } = await import("./auth/auth.controller");
    const { default: UserController } = await import("./user/user.controller");
    const { default: ProductController } = await import(
      "./product/product.controller"
    );

    const { registerControllers } = await import("bootify");
    registerControllers(app, [
      AuthController,
      UserController,
      ProductController,
    ]);
  })

  // Error handler
  .useErrorHandler(GlobalExceptionHandler.createErrorHandler())

  .build();

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully");
  await app.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down gracefully");
  await app.close();
  process.exit(0);
});

await start();
```

## Migration Guide

### From `createBootifyApp()` to `createBootify()`

**Before:**

```typescript
const { app, start } = await createBootifyApp({
  controllers: [HealthController, TodoController],
  port: 8080,
  enableSwagger: true,
  globalMiddlewares: [corsMiddleware, authMiddleware],
});

await start();
```

**After:**

```typescript
const { app, start } = await createBootify()
  .setPort(8080)
  .useControllers([HealthController, TodoController])
  .useMiddlewares([corsMiddleware, authMiddleware])
  .usePlugin(async (app) => {
    // Register Swagger manually
    await app.register(swagger, {
      /* options */
    });
    await app.register(swaggerUi, {
      /* options */
    });
  })
  .build();

await start();
```

## Best Practices

### 1. Use Lifecycle Hooks for Initialization

```typescript
createBootify()
  .beforeStart(async () => {
    // Initialize database, Redis, etc.
  })
  .afterStart(async () => {
    // Start background jobs
  });
```

### 2. Group Related Plugins

```typescript
createBootify()
  .usePlugin(async (app) => {
    // All security-related plugins together
    await app.register(helmet);
    await app.register(rateLimit, {
      /* options */
    });
  })
  .usePlugin(async (app) => {
    // All documentation plugins together
    await app.register(swagger, {
      /* options */
    });
    await app.register(swaggerUi, {
      /* options */
    });
  });
```

### 3. Use Environment Variables

```typescript
createBootify()
  .setPort(Number(process.env.PORT) || 3000)
  .setHostname(process.env.HOST || "0.0.0.0");
```

### 4. Handle Graceful Shutdown

```typescript
const { app } = await createBootify().build();

process.on("SIGTERM", async () => {
  await app.close();
  process.exit(0);
});
```

## Comparison

| Feature             | `createBootifyApp()` | `createBootify()` |
| ------------------- | -------------------- | ----------------- |
| Flexibility         | ❌ Limited           | ✅ Full control   |
| Plugin Order        | ❌ Fixed             | ✅ Custom         |
| Lifecycle Hooks     | ❌ No                | ✅ Yes            |
| Error Handler       | ❌ Built-in only     | ✅ Custom         |
| Builder Pattern     | ❌ No                | ✅ Yes            |
| Dynamic Controllers | ❌ Difficult         | ✅ Easy           |
| Readability         | ⚠️ OK                | ✅ Excellent      |

## Conclusion

`BootifyApp` provides the flexibility you need for production applications while maintaining the simplicity of Bootify's decorator-based approach.

**Use `createBootify()` when you need:**

- Full control over initialization
- Custom plugin registration order
- Lifecycle hooks
- Dynamic controller loading
- Custom error handling

**Use `createBootifyApp()` when you need:**

- Quick prototyping
- Simple applications
- Default configuration is sufficient
