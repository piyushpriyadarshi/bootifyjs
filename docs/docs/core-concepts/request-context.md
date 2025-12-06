---
id: request-context
title: Request Context
sidebar_label: Request Context
description: Working with request-scoped data across your application using AsyncLocalStorage
keywords:
  [
    bootifyjs,
    request context,
    async local storage,
    request scope,
    context propagation,
  ]
---

# Request Context

Request Context is a powerful feature that allows you to store and access request-specific data anywhere in your application without explicitly passing it through function parameters. This is particularly useful for tracking request IDs, user information, and other contextual data throughout the request lifecycle.

## What is Request Context?

Request Context uses Node.js's `AsyncLocalStorage` to create an isolated storage space for each incoming request. This storage is automatically available to all code executed during that request, including deeply nested function calls, without manual propagation.

### The Problem It Solves

Without request context, you'd need to pass data through every function:

```typescript
// Without Request Context ❌
class UserController {
  getUser(userId: string, requestId: string, userEmail: string) {
    return this.userService.findUser(userId, requestId, userEmail);
  }
}

class UserService {
  findUser(userId: string, requestId: string, userEmail: string) {
    this.logger.log("Finding user", { requestId, userEmail });
    return this.repository.findById(userId, requestId);
  }
}

class UserRepository {
  findById(userId: string, requestId: string) {
    this.logger.log("Database query", { requestId });
    // Database logic
  }
}
```

With request context, data is automatically available:

```typescript
// With Request Context ✅
class UserController {
  getUser(userId: string) {
    return this.userService.findUser(userId);
  }
}

class UserService {
  findUser(userId: string) {
    const requestId = this.context.get("requestId");
    const userEmail = this.context.get("userEmail");
    this.logger.log("Finding user", { requestId, userEmail });
    return this.repository.findById(userId);
  }
}

class UserRepository {
  findById(userId: string) {
    const requestId = this.context.get("requestId");
    this.logger.log("Database query", { requestId });
    // Database logic
  }
}
```

## Setting Up Request Context

### 1. Enable Context Middleware

Add the context middleware to your application:

```typescript
import { createBootify } from "bootifyjs";
import { createContextMiddleware } from "bootifyjs/middleware";

const app = createBootify()
  .useMiddleware(createContextMiddleware())
  .useControllers([
    /* your controllers */
  ])
  .build();
```

The context middleware automatically:

- Creates a new context for each request
- Stores common request data (request ID, IP, user agent, etc.)
- Cleans up the context after the request completes

### 2. Access Context in Your Code

Inject `RequestContextService` to access the context:

```typescript
import { RequestContextService } from "bootifyjs";

@Service()
export class UserService {
  @Autowired()
  private context!: RequestContextService;

  processUser(userId: string) {
    const requestId = this.context.get("requestId");
    console.log(`Processing user ${userId} for request ${requestId}`);
  }
}
```

## Using Request Context

### Storing Data

Store data in the context using `set()`:

```typescript
@Controller("/users")
export class UserController {
  @Autowired()
  private context!: RequestContextService;

  @Post("/login")
  async login(@Body() credentials: LoginDto) {
    const user = await this.authService.authenticate(credentials);

    // Store user info in context
    this.context.set("userId", user.id);
    this.context.set("userEmail", user.email);
    this.context.set("userRole", user.role);

    return { token: generateToken(user) };
  }
}
```

### Retrieving Data

Retrieve data using `get()`:

```typescript
@Service()
export class AuditService {
  @Autowired()
  private context!: RequestContextService;

  logAction(action: string, resource: string) {
    const userId = this.context.get<string>("userId");
    const requestId = this.context.get<string>("requestId");
    const ip = this.context.get<string>("ip");

    console.log({
      action,
      resource,
      userId,
      requestId,
      ip,
      timestamp: new Date(),
    });
  }
}
```

### Type-Safe Context Access

Use TypeScript generics for type safety:

```typescript
interface User {
  id: string;
  email: string;
  role: string;
}

@Service()
export class UserService {
  @Autowired()
  private context!: RequestContextService;

  getCurrentUser(): User | undefined {
    return this.context.get<User>("currentUser");
  }

  requireCurrentUser(): User {
    const user = this.context.get<User>("currentUser");
    if (!user) {
      throw new Error("User not authenticated");
    }
    return user;
  }
}
```

## Common Use Cases

### 1. Request Tracking

Track requests across your application:

```typescript
// Middleware sets request ID
const requestTrackingMiddleware: FastifyMiddleware = async (request, reply) => {
  const context = container.resolve<RequestContextService>(
    RequestContextService
  );
  const requestId = request.headers["x-request-id"] || generateId();

  context.set("requestId", requestId);
  context.set("startTime", Date.now());

  reply.header("x-request-id", requestId);
};

// Use in services
@Service()
export class OrderService {
  @Autowired()
  private context!: RequestContextService;

  @Autowired()
  private logger!: Logger;

  async createOrder(data: CreateOrderDto) {
    const requestId = this.context.get("requestId");
    this.logger.info("Creating order", { requestId, data });

    // Order creation logic

    const duration = Date.now() - this.context.get<number>("startTime")!;
    this.logger.info("Order created", { requestId, duration });
  }
}
```

### 2. User Authentication Context

Store authenticated user information:

```typescript
// Authentication middleware
const authMiddleware: FastifyMiddleware = async (request, reply) => {
  const token = request.headers.authorization?.replace("Bearer ", "");

  if (token) {
    const user = await verifyToken(token);
    const context = container.resolve<RequestContextService>(
      RequestContextService
    );

    context.set("currentUser", user);
    context.set("userId", user.id);
    context.set("userRole", user.role);
  }
};

// Use in controllers
@Controller("/orders")
export class OrderController {
  @Autowired()
  private context!: RequestContextService;

  @Autowired()
  private orderService!: OrderService;

  @Get("/")
  getMyOrders() {
    const userId = this.context.get<string>("userId");
    return this.orderService.findByUserId(userId);
  }

  @Post("/")
  createOrder(@Body() data: CreateOrderDto) {
    const user = this.context.get("currentUser");
    return this.orderService.create(data, user);
  }
}
```

### 3. Correlation IDs for Distributed Tracing

Propagate correlation IDs across services:

```typescript
@Service()
export class ExternalApiService {
  @Autowired()
  private context!: RequestContextService;

  async callExternalService(endpoint: string, data: any) {
    const correlationId = this.context.get("correlationId") || generateId();

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Correlation-ID": correlationId,
      },
      body: JSON.stringify(data),
    });

    return response.json();
  }
}
```

### 4. Contextual Logging

Automatically include context in all log messages:

```typescript
@Service()
export class ContextualLogger {
  @Autowired()
  private context!: RequestContextService;

  @Autowired()
  private logger!: Logger;

  info(message: string, meta?: any) {
    const requestId = this.context.get("requestId");
    const userId = this.context.get("userId");

    this.logger.info(message, {
      ...meta,
      requestId,
      userId,
    });
  }

  error(message: string, error: Error, meta?: any) {
    const requestId = this.context.get("requestId");
    const userId = this.context.get("userId");

    this.logger.error(message, {
      ...meta,
      error: error.message,
      stack: error.stack,
      requestId,
      userId,
    });
  }
}
```

### 5. Multi-Tenancy

Store and access tenant information:

```typescript
// Tenant middleware
const tenantMiddleware: FastifyMiddleware = async (request, reply) => {
  const tenantId =
    request.headers["x-tenant-id"] ||
    request.query.tenantId ||
    extractTenantFromDomain(request.hostname);

  if (!tenantId) {
    reply.code(400).send({ error: "Tenant ID required" });
    return;
  }

  const context = container.resolve<RequestContextService>(
    RequestContextService
  );
  context.set("tenantId", tenantId);
};

// Use in repositories
@Repository()
export class UserRepository {
  @Autowired()
  private context!: RequestContextService;

  findAll() {
    const tenantId = this.context.get("tenantId");
    return this.db.users.findMany({
      where: { tenantId },
    });
  }

  findById(id: string) {
    const tenantId = this.context.get("tenantId");
    return this.db.users.findFirst({
      where: { id, tenantId },
    });
  }
}
```

## Advanced Usage

### Custom Context Middleware

Create your own context middleware for specific needs:

```typescript
export function createCustomContextMiddleware(): FastifyMiddleware {
  return async (request, reply) => {
    const context = container.resolve<RequestContextService>(
      RequestContextService
    );

    // Store request metadata
    context.set("requestId", request.id);
    context.set("method", request.method);
    context.set("url", request.url);
    context.set("ip", request.ip);
    context.set("userAgent", request.headers["user-agent"]);

    // Store custom headers
    context.set("apiVersion", request.headers["x-api-version"]);
    context.set("clientId", request.headers["x-client-id"]);

    // Store timing information
    context.set("startTime", Date.now());

    // Add cleanup logic
    reply.addHook("onSend", async () => {
      const duration = Date.now() - context.get<number>("startTime")!;
      reply.header("x-response-time", `${duration}ms`);
    });
  };
}
```

### Accessing Raw Store

Access the underlying Map for advanced operations:

```typescript
@Service()
export class ContextService {
  @Autowired()
  private context!: RequestContextService;

  getAllContextData() {
    const store = this.context.store();
    return Object.fromEntries(store?.entries() || []);
  }

  hasKey(key: string): boolean {
    const store = this.context.store();
    return store?.has(key) || false;
  }

  clearKey(key: string): void {
    const store = this.context.store();
    store?.delete(key);
  }
}
```

### Context in Event Handlers

Context is preserved in async operations:

```typescript
@EventHandler(UserCreatedEvent)
export class UserCreatedHandler {
  @Autowired()
  private context!: RequestContextService;

  @Autowired()
  private emailService!: EmailService;

  async handle(event: UserCreatedEvent) {
    // Context from the original request is still available
    const requestId = this.context.get("requestId");
    const adminEmail = this.context.get("adminEmail");

    await this.emailService.sendWelcomeEmail(event.user.email, {
      requestId,
      notifyAdmin: adminEmail,
    });
  }
}
```

## Best Practices

### 1. Initialize Context Early

Set up context middleware as one of the first middleware:

```typescript
const app = createBootify()
  .useMiddleware(createContextMiddleware()) // First
  .useMiddleware(corsMiddleware)
  .useMiddleware(authMiddleware);
// ... other middleware
```

### 2. Use Consistent Keys

Define constants for context keys:

```typescript
export const CONTEXT_KEYS = {
  REQUEST_ID: "requestId",
  USER_ID: "userId",
  TENANT_ID: "tenantId",
  CORRELATION_ID: "correlationId",
  START_TIME: "startTime",
} as const;

// Usage
context.set(CONTEXT_KEYS.REQUEST_ID, requestId);
const userId = context.get(CONTEXT_KEYS.USER_ID);
```

### 3. Type Your Context Data

Create typed helpers for context access:

```typescript
export class TypedRequestContext {
  constructor(private context: RequestContextService) {}

  get requestId(): string | undefined {
    return this.context.get<string>("requestId");
  }

  get currentUser(): User | undefined {
    return this.context.get<User>("currentUser");
  }

  get tenantId(): string | undefined {
    return this.context.get<string>("tenantId");
  }

  setCurrentUser(user: User): void {
    this.context.set("currentUser", user);
  }
}
```

### 4. Don't Store Large Objects

Context is meant for metadata, not large data:

```typescript
// Good ✅
context.set("userId", user.id);
context.set("userRole", user.role);

// Bad ❌
context.set("userFullProfile", largeUserObject); // Too much data
context.set("allOrders", ordersArray); // Should be fetched when needed
```

### 5. Handle Missing Context Gracefully

Always check if context data exists:

```typescript
@Service()
export class UserService {
  @Autowired()
  private context!: RequestContextService;

  getCurrentUserId(): string {
    const userId = this.context.get<string>("userId");

    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }

    return userId;
  }

  getOptionalUserId(): string | undefined {
    return this.context.get<string>("userId");
  }
}
```

## Troubleshooting

### Context is Undefined

**Problem:** `context.get()` returns undefined for all keys.

**Solutions:**

- Ensure context middleware is registered
- Check that middleware runs before your code
- Verify you're inside a request context (not in a constructor or initialization)

### Context Data Not Available in Async Code

**Problem:** Context data disappears in async operations.

**Solution:** AsyncLocalStorage automatically propagates context through async operations. If it's not working:

- Ensure you're using `async/await` or proper Promise chains
- Avoid creating new execution contexts (e.g., `setTimeout` without proper binding)

### Memory Leaks

**Problem:** Context data not being cleaned up.

**Solution:** The framework automatically cleans up context after each request. If you see leaks:

- Don't store references to context data outside the request lifecycle
- Don't store context data in singleton services

## Next Steps

- Learn about [Dependency Injection](./dependency-injection.md) to inject RequestContextService
- Explore [Decorators](./decorators.md) to understand the `@Autowired` decorator
- Read about [Application Lifecycle](./lifecycle.md) to understand when context is available
