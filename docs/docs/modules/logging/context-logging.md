---
id: logging-context-logging
title: Context Logging
sidebar_label: Context Logging
---

# Context Logging

Context logging automatically includes request-specific information in all logs generated during a request's lifecycle. This is powered by Node.js's AsyncLocalStorage and BootifyJS's request context system.

## How It Works

When a request enters your application, BootifyJS creates a request context that stores information like:

- Request ID
- Trace ID
- User ID
- Username
- Correlation ID
- Custom context data

All logs generated during that request automatically include this context, even across async operations and service boundaries.

## Automatic Context Inclusion

### Without Context Logging

```typescript
@Service()
export class UserService {
  constructor(@Autowired() private logger: Logger) {}

  async getUser(userId: string) {
    this.logger.info("Fetching user", { userId });
    // Output: { "level": "info", "message": "Fetching user", "userId": "123" }
  }
}
```

### With Context Logging

When called during a request with context:

```typescript
@Service()
export class UserService {
  constructor(@Autowired() private logger: Logger) {}

  async getUser(userId: string) {
    this.logger.info("Fetching user", { userId });
    // Output includes automatic context:
    // {
    //   "level": "info",
    //   "message": "Fetching user",
    //   "userId": "123",
    //   "requestId": "req-abc-123",
    //   "traceId": "trace-xyz-789",
    //   "username": "john.doe"
    // }
  }
}
```

## Setting Up Context Logging

### 1. Enable Context Middleware

Context logging requires the request context middleware:

```typescript
import { createBootify } from "bootifyjs";
import { contextMiddleware } from "bootifyjs/middleware";

const { app, start } = await createBootify()
  .useMiddleware(contextMiddleware)
  .useControllers([UserController])
  .build();

await start();
```

### 2. Configure Context Extraction

Create a context extractor to populate the request context:

```typescript
import { FastifyRequest } from "fastify";
import { RequestContextService } from "bootifyjs/core";

export function extractRequestContext(
  req: FastifyRequest,
  contextService: RequestContextService
) {
  // Set request ID
  contextService.set("requestId", req.id);

  // Set trace ID (from header or generate)
  const traceId = req.headers["x-trace-id"] || `trace-${req.id}`;
  contextService.set("traceId", traceId);

  // Set user information (from auth)
  if (req.user) {
    contextService.set("userId", req.user.id);
    contextService.set("username", req.user.username);
  }

  // Set correlation ID (for distributed tracing)
  const correlationId = req.headers["x-correlation-id"];
  if (correlationId) {
    contextService.set("correlationId", correlationId);
  }
}
```

### 3. Apply Context Extractor

```typescript
import { createBootify } from "bootifyjs";
import { contextMiddleware } from "bootifyjs/middleware";
import { extractRequestContext } from "./middleware/context-extractor";

const { app, start } = await createBootify()
  .useMiddleware((req, reply, done) => {
    contextMiddleware(req, reply, done, extractRequestContext);
  })
  .useControllers([UserController])
  .build();

await start();
```

## Context Fields

### Standard Fields

These fields are commonly included in request context:

| Field           | Description                  | Example         |
| --------------- | ---------------------------- | --------------- |
| `requestId`     | Unique request identifier    | `req-abc-123`   |
| `traceId`       | Distributed trace identifier | `trace-xyz-789` |
| `spanId`        | Current span identifier      | `span-def-456`  |
| `userId`        | Authenticated user ID        | `user-123`      |
| `username`      | Authenticated username       | `john.doe`      |
| `correlationId` | Cross-service correlation ID | `corr-ghi-789`  |
| `operationName` | Current operation name       | `user.create`   |
| `serviceName`   | Service name                 | `user-service`  |

### Custom Fields

Add custom context fields for your application:

```typescript
export function extractRequestContext(
  req: FastifyRequest,
  contextService: RequestContextService
) {
  // Standard fields
  contextService.set("requestId", req.id);
  contextService.set("traceId", req.headers["x-trace-id"] || `trace-${req.id}`);

  // Custom fields
  contextService.set("tenantId", req.headers["x-tenant-id"]);
  contextService.set("apiVersion", req.headers["api-version"] || "v1");
  contextService.set("clientId", req.headers["x-client-id"]);
  contextService.set("environment", process.env.NODE_ENV);
}
```

## Using Context in Services

### Accessing Context

Access the request context in any service:

```typescript
import { Service, Autowired } from "bootifyjs/core";
import { Logger } from "bootifyjs/logging";
import { RequestContextService } from "bootifyjs/core";

@Service()
export class OrderService {
  constructor(
    @Autowired() private logger: Logger,
    @Autowired() private contextService: RequestContextService
  ) {}

  async createOrder(orderData: CreateOrderDto) {
    // Get context values
    const userId = this.contextService.get("userId");
    const traceId = this.contextService.get("traceId");

    // Logs automatically include all context
    this.logger.info("Creating order", {
      itemCount: orderData.items.length,
      total: orderData.total,
    });

    // Context is available throughout the request lifecycle
    const order = await this.saveOrder({
      ...orderData,
      userId,
      traceId,
    });

    return order;
  }
}
```

### Adding Dynamic Context

Add context during request processing:

```typescript
@Service()
export class PaymentService {
  constructor(
    @Autowired() private logger: Logger,
    @Autowired() private contextService: RequestContextService
  ) {}

  async processPayment(payment: Payment) {
    // Add payment context for all subsequent logs
    this.contextService.set("paymentId", payment.id);
    this.contextService.set("paymentMethod", payment.method);

    this.logger.info("Processing payment", {
      amount: payment.amount,
    });
    // Output includes: requestId, traceId, userId, paymentId, paymentMethod

    try {
      const result = await this.chargeCard(payment);

      // Add result context
      this.contextService.set("transactionId", result.transactionId);

      this.logger.info("Payment successful");
      // Output includes all previous context plus transactionId

      return result;
    } catch (error) {
      this.logger.error("Payment failed", error);
      // Error log includes full context for debugging
      throw error;
    }
  }
}
```

## Distributed Tracing

Context logging enables distributed tracing across services:

### Service A (API Gateway)

```typescript
@Controller("/api")
export class ApiController {
  constructor(
    @Autowired() private logger: Logger,
    @Autowired() private contextService: RequestContextService,
    @Autowired() private userService: UserServiceClient
  ) {}

  @Post("/users")
  async createUser(req: FastifyRequest, reply: FastifyReply) {
    const traceId = this.contextService.get("traceId");

    this.logger.info("API request received");

    // Forward trace ID to downstream service
    const user = await this.userService.create(req.body, {
      headers: {
        "x-trace-id": traceId,
        "x-correlation-id": req.id,
      },
    });

    this.logger.info("User created", { userId: user.id });

    return user;
  }
}
```

### Service B (User Service)

```typescript
@Controller("/users")
export class UserController {
  constructor(
    @Autowired() private logger: Logger,
    @Autowired() private userService: UserService
  ) {}

  @Post("/")
  async createUser(req: FastifyRequest) {
    // Context middleware extracts x-trace-id from headers
    // All logs in this request will include the same traceId

    this.logger.info("Creating user in user service");
    // Output includes traceId from Service A

    const user = await this.userService.create(req.body);

    this.logger.info("User created", { userId: user.id });

    return user;
  }
}
```

Now you can trace the entire request flow across services using the `traceId`.

## Context Propagation

### Across Async Operations

Context automatically propagates through async operations:

```typescript
@Service()
export class NotificationService {
  constructor(@Autowired() private logger: Logger) {}

  async sendNotifications(userId: string) {
    this.logger.info("Sending notifications");

    // Context propagates to Promise.all
    await Promise.all([
      this.sendEmail(userId),
      this.sendPush(userId),
      this.sendSMS(userId),
    ]);

    this.logger.info("All notifications sent");
  }

  private async sendEmail(userId: string) {
    // Context is available here
    this.logger.debug("Sending email");
    // Output includes requestId, traceId, etc.
  }

  private async sendPush(userId: string) {
    // Context is available here too
    this.logger.debug("Sending push notification");
    // Output includes same context
  }

  private async sendSMS(userId: string) {
    // And here
    this.logger.debug("Sending SMS");
    // Output includes same context
  }
}
```

### Across Service Boundaries

Context propagates through dependency injection:

```typescript
@Service()
export class OrderService {
  constructor(
    @Autowired() private logger: Logger,
    @Autowired() private paymentService: PaymentService,
    @Autowired() private inventoryService: InventoryService
  ) {}

  async createOrder(orderData: CreateOrderDto) {
    this.logger.info("Creating order");

    // Context propagates to injected services
    await this.paymentService.charge(orderData.payment);
    await this.inventoryService.reserve(orderData.items);

    this.logger.info("Order created");
  }
}

@Service()
export class PaymentService {
  constructor(@Autowired() private logger: Logger) {}

  async charge(payment: Payment) {
    // Same context is available here
    this.logger.info("Charging payment");
    // Output includes requestId, traceId from original request
  }
}
```

## Best Practices

### 1. Use Standard Field Names

Stick to standard field names for consistency:

```typescript
// ✅ Good
contextService.set("userId", user.id);
contextService.set("traceId", traceId);
contextService.set("requestId", req.id);

// ❌ Bad
contextService.set("user_id", user.id);
contextService.set("trace", traceId);
contextService.set("reqId", req.id);
```

### 2. Extract Context Early

Extract context at the beginning of the request:

```typescript
// ✅ Good - Extract in middleware
app.addHook('onRequest', (req, reply, done) => {
  extractRequestContext(req, contextService);
  done();
});

// ❌ Bad - Extract in each controller
@Get('/users')
async getUsers(req: FastifyRequest) {
  extractRequestContext(req, contextService); // Too late, inconsistent
}
```

### 3. Don't Override Standard Fields

Avoid overwriting standard context fields:

```typescript
// ❌ Bad
contextService.set("requestId", "my-custom-id"); // Don't override

// ✅ Good
contextService.set("customRequestId", "my-custom-id");
```

### 4. Use Context for Cross-Cutting Concerns

Store information that's relevant across the entire request:

```typescript
// ✅ Good - Cross-cutting concerns
contextService.set("tenantId", tenant.id);
contextService.set("locale", req.headers["accept-language"]);
contextService.set("apiVersion", "v2");

// ❌ Bad - Operation-specific data
contextService.set("orderTotal", 100); // Use function parameters instead
```

### 5. Propagate Trace IDs

Always propagate trace IDs to downstream services:

```typescript
// ✅ Good
const traceId = contextService.get("traceId");
await httpClient.post("/api/orders", data, {
  headers: { "x-trace-id": traceId },
});

// ❌ Bad
await httpClient.post("/api/orders", data);
// Trace is lost
```

## Example: Complete Setup

Here's a complete example of context logging setup:

```typescript
// context-extractor.ts
import { FastifyRequest } from "fastify";
import { RequestContextService } from "bootifyjs/core";
import { v4 as uuidv4 } from "uuid";

export function extractRequestContext(
  req: FastifyRequest,
  contextService: RequestContextService
) {
  // Request identification
  contextService.set("requestId", req.id);
  contextService.set("traceId", req.headers["x-trace-id"] || uuidv4());
  contextService.set("correlationId", req.headers["x-correlation-id"]);

  // User context (from auth middleware)
  if (req.user) {
    contextService.set("userId", req.user.id);
    contextService.set("username", req.user.username);
    contextService.set("userRole", req.user.role);
  }

  // Multi-tenancy
  contextService.set("tenantId", req.headers["x-tenant-id"]);

  // API versioning
  contextService.set("apiVersion", req.headers["api-version"] || "v1");

  // Client information
  contextService.set("clientId", req.headers["x-client-id"]);
  contextService.set("userAgent", req.headers["user-agent"]);
  contextService.set("ip", req.ip);
}

// main.ts
import { createBootify } from "bootifyjs";
import { contextMiddleware } from "bootifyjs/middleware";
import { extractRequestContext } from "./middleware/context-extractor";

const { app, start } = await createBootify()
  .useMiddleware((req, reply, done) => {
    contextMiddleware(req, reply, done, extractRequestContext);
  })
  .useControllers([UserController, OrderController])
  .build();

await start();
```

## Next Steps

- [Transports](./transports.md) - Configure log destinations
- [Core Concepts: Request Context](../../core-concepts/request-context.md) - Deep dive into request context
