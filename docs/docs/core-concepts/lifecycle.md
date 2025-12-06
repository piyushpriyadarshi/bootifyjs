---
id: lifecycle
title: Application Lifecycle
sidebar_label: Application Lifecycle
description: Understanding the BootifyJS application lifecycle from startup to runtime
keywords:
  [bootifyjs, lifecycle, application startup, bootstrapping, initialization]
---

# Application Lifecycle

Understanding the application lifecycle is crucial for properly initializing services, managing resources, and debugging issues. This guide explains how BootifyJS applications start up and run.

## Lifecycle Overview

A BootifyJS application goes through several distinct phases:

```
┌─────────────────────────────────────────────────────────┐
│ 1. Configuration Phase                                  │
│    - Load environment variables                         │
│    - Validate configuration schema                      │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ 2. Registration Phase                                   │
│    - Register components in DI container                │
│    - Register controllers                               │
│    - Register plugins and middleware                    │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Initialization Phase (beforeStart hooks)            │
│    - Bootstrap services (cache, events, etc.)          │
│    - Establish database connections                     │
│    - Initialize external services                       │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Server Startup                                       │
│    - Start Fastify server                              │
│    - Bind to port and hostname                         │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ 5. Post-Startup Phase (afterStart hooks)               │
│    - Log startup summary                                │
│    - Register with service discovery                    │
│    - Start background jobs                              │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ 6. Runtime Phase                                        │
│    - Handle incoming requests                           │
│    - Process events                                     │
│    - Execute scheduled tasks                            │
└─────────────────────────────────────────────────────────┘
```

## Phase 1: Configuration

The configuration phase loads and validates your application settings.

### Loading Environment Variables

```typescript
import { createBootify } from "bootifyjs";
import { z } from "zod";
import dotenv from "dotenv";

// Load .env file
dotenv.config();

// Define configuration schema
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]),
  PORT: z
    .string()
    .transform((val) => parseInt(val))
    .default("3000"),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  REDIS_URL: z.string().url().optional(),
});

const app = createBootify().useConfig(envSchema);
// ... rest of configuration
```

### What Happens

1. Environment variables are loaded from `.env` file
2. The schema validates all required variables
3. Invalid configuration throws an error and prevents startup
4. Validated config is available via `AppConfig.get()`

### Configuration Access

```typescript
import { AppConfig } from "bootifyjs";

@Service()
export class DatabaseService {
  private connectionUrl = AppConfig.get("DATABASE_URL");

  connect() {
    // Use validated configuration
  }
}
```

## Phase 2: Registration

During registration, all components are registered with the DI container and routes are mapped.

### Component Registration

```typescript
import { createBootify } from "bootifyjs";
import { UserController } from "./controllers/user.controller";
import { ProductController } from "./controllers/product.controller";

const app = createBootify().useControllers([UserController, ProductController]);
```

### What Happens

1. **Decorator Processing**: The framework scans all decorators on your classes
2. **DI Registration**: Components are registered in the dependency injection container
3. **Route Mapping**: Controller routes are mapped to Fastify routes
4. **Metadata Collection**: Validation schemas, middleware, and Swagger docs are collected

### Component Discovery

Components are discovered through decorators:

```typescript
// Automatically registered when decorated
@Service()
export class UserService {}

@Repository()
export class UserRepository {}

@Controller("/users")
export class UserController {}
```

### Plugin Registration

Plugins are registered in order:

```typescript
const app = createBootify()
  .usePlugin(async (app) => {
    // Register Fastify plugins
    await app.register(fastifyCookie);
  })
  .usePlugin(async (app) => {
    await app.register(fastifySwagger, {
      /* config */
    });
  });
```

### Middleware Registration

Global middleware is registered as Fastify hooks:

```typescript
const app = createBootify()
  .useMiddleware(corsMiddleware)
  .useMiddleware(authMiddleware)
  .useMiddlewares([loggingMiddleware, rateLimitMiddleware]);
```

## Phase 3: Initialization (beforeStart)

The initialization phase prepares services before the server starts accepting requests.

### Using beforeStart Hooks

```typescript
const app = createBootify()
  .beforeStart(async (app) => {
    console.log("Initializing services...");

    // Bootstrap cache
    await bootstrapCache();

    // Connect to database
    await connectDatabase();

    // Initialize event bus
    await initializeEventBus();

    console.log("Services initialized");
  })
  .beforeStart(async (app) => {
    // Multiple hooks execute in order
    await warmupCache();
  });
```

### Common Initialization Tasks

#### Database Connections

```typescript
.beforeStart(async () => {
  const dbService = container.resolve<DatabaseService>(DatabaseService);
  await dbService.connect();
  console.log('✅ Database connected');
})
```

#### Cache Initialization

```typescript
.beforeStart(async () => {
  await bootstrapCache();
  console.log('✅ Cache initialized');
})
```

#### Service Registration

```typescript
.beforeStart(async () => {
  // Register factory providers
  container.register('PaymentGateway', {
    useFactory: () => new StripeGateway(process.env.STRIPE_KEY)
  });
})
```

#### Health Checks

```typescript
.beforeStart(async () => {
  // Verify external services are reachable
  await checkRedisConnection();
  await checkDatabaseConnection();
  console.log('✅ Health checks passed');
})
```

## Phase 4: Server Startup

The server starts and begins listening for requests.

### Starting the Server

```typescript
const app = createBootify().setPort(3000).setHostname("0.0.0.0");
// ... configuration

// Option 1: Build and start separately
const { app: fastifyApp, start } = await app.build();
await start();

// Option 2: Build and start immediately
await app.start();
```

### What Happens

1. Fastify instance is created with configured options
2. All routes are registered
3. Server binds to the specified port and hostname
4. Server starts accepting connections

### Startup Logging

BootifyJS provides detailed startup logging:

```
╔══════════════════════════════════════════════════════════╗
║                    BootifyJS v1.0.0                      ║
╚══════════════════════════════════════════════════════════╝

⚙️  Registering Controllers
   └─ Controllers: 3 found
      ✓ UserController
      ✓ ProductController
      ✓ OrderController

✅ Startup Complete

🚀 Server listening on http://localhost:3000
```

## Phase 5: Post-Startup (afterStart)

After the server starts, post-startup hooks execute.

### Using afterStart Hooks

```typescript
const app = createBootify()
  .afterStart(async (app) => {
    console.log("🎉 Application started successfully!");

    // Register with service discovery
    await registerWithConsul();

    // Start background jobs
    startScheduledTasks();

    // Send startup notification
    await notifySlack("Application started");
  })
  .afterStart(async (app) => {
    // Log registered routes
    console.log("Registered routes:");
    app.printRoutes();
  });
```

### Common Post-Startup Tasks

#### Service Discovery Registration

```typescript
.afterStart(async () => {
  await serviceDiscovery.register({
    name: 'my-service',
    port: 3000,
    health: '/health'
  });
})
```

#### Background Jobs

```typescript
.afterStart(async () => {
  // Start cron jobs
  cron.schedule('0 * * * *', async () => {
    await cleanupExpiredSessions();
  });
})
```

#### Metrics Collection

```typescript
.afterStart(async () => {
  // Start metrics server
  metricsServer.listen(9090);
  console.log('📊 Metrics available on :9090/metrics');
})
```

## Phase 6: Runtime

During runtime, the application handles requests and processes events.

### Request Handling Flow

```
┌─────────────────────────────────────────────────────────┐
│ 1. Request Received                                     │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ 2. Global Middleware (onRequest hooks)                 │
│    - CORS, Authentication, Logging, etc.               │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Route Matching                                       │
│    - Find matching controller and method               │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Route-Level Middleware                              │
│    - Applied via @UseMiddleware                        │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ 5. Schema Validation                                    │
│    - Validate body, query, params                      │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ 6. Dependency Injection                                 │
│    - Resolve controller and dependencies               │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ 7. Route Handler Execution                             │
│    - Execute controller method                         │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ 8. Response Serialization                              │
│    - Convert result to JSON                            │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ 9. Response Sent                                        │
└─────────────────────────────────────────────────────────┘
```

### Dependency Resolution

Dependencies are resolved on-demand during request handling:

```typescript
@Controller("/users")
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get("/:id")
  getUser(@Param("id") id: string) {
    // userService is already resolved and injected
    return this.userService.findById(id);
  }
}
```

**Resolution happens:**

1. First time the controller is accessed (for singletons)
2. On every request (for transient dependencies)

## Complete Example

Here's a complete application showing all lifecycle phases:

```typescript
import { createBootify } from "bootifyjs";
import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

// 1. Configuration Phase
const envSchema = z.object({
  NODE_ENV: z.string(),
  PORT: z.string().transform((val) => parseInt(val)),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().optional(),
});

async function main() {
  const { app, start, logger } = await createBootify()
    // Configuration
    .useConfig(envSchema)
    .setPort(3000)
    .setHostname("0.0.0.0")

    // 2. Registration Phase
    .usePlugin(async (app) => {
      await app.register(fastifyCookie);
    })
    .useMiddleware(corsMiddleware)
    .useMiddleware(authMiddleware)
    .useControllers([UserController, ProductController, OrderController])

    // 3. Initialization Phase
    .beforeStart(async () => {
      logger.info("Initializing services...");

      await bootstrapCache();
      await connectDatabase();
      await initializeEventBus();

      logger.info("Services initialized");
    })

    // 4. Server Startup happens automatically

    // 5. Post-Startup Phase
    .afterStart(async (app) => {
      logger.info("Application started successfully");

      // Start background jobs
      startScheduledTasks();

      // Register with service discovery
      await registerWithConsul();

      // Print routes
      app.printRoutes();
    })

    .build();

  // Start the server
  await start();

  // 6. Runtime Phase - application is now handling requests
}

main().catch(console.error);
```

## Best Practices

### 1. Initialize Services in beforeStart

```typescript
// Good: Initialize before server starts
.beforeStart(async () => {
  await databaseService.connect();
})

// Bad: Initialize in constructor (may not be ready)
@Service()
export class MyService {
  constructor() {
    this.connect(); // ❌ May execute too early
  }
}
```

### 2. Handle Initialization Errors

```typescript
.beforeStart(async () => {
  try {
    await criticalService.initialize();
  } catch (error) {
    console.error('Failed to initialize critical service:', error);
    process.exit(1); // Fail fast
  }
})
```

### 3. Use Lifecycle Hooks for Side Effects

```typescript
// Good: Side effects in hooks
.afterStart(async () => {
  startMetricsCollection();
  registerWithServiceMesh();
})

// Bad: Side effects in service constructors
@Service()
export class MetricsService {
  constructor() {
    this.startCollection(); // ❌ Unclear when this runs
  }
}
```

### 4. Order Matters

```typescript
// Correct order
.beforeStart(async () => {
  await connectDatabase(); // 1. Connect first
})
.beforeStart(async () => {
  await runMigrations(); // 2. Then migrate
})
.beforeStart(async () => {
  await seedData(); // 3. Then seed
})
```

## Troubleshooting

### "Cannot resolve dependency X"

Dependencies must be registered before they're resolved. Ensure:

- The class has a decorator (`@Service`, `@Repository`, etc.)
- The class is imported somewhere in your application
- You're not trying to resolve before registration completes

### "Port already in use"

Another process is using the port. Either:

- Stop the other process
- Change the port: `.setPort(3001)`
- Use port 0 for automatic assignment: `.setPort(0)`

### Slow Startup

If startup is slow, check:

- Database connection timeouts
- External service health checks
- Unnecessary synchronous operations in `beforeStart`

## Next Steps

- Learn about [Request Context](./request-context.md) for request-scoped data
- Explore [Dependency Injection](./dependency-injection.md) for managing component lifecycles
- Check out [Decorators](./decorators.md) for all available decorators
