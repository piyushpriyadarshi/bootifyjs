---
id: logging-api
title: Logging API Reference
sidebar_label: Logging API
description: Complete reference for BootifyJS logging system classes and methods
keywords: [bootifyjs, logging, api, reference, pino]
---

# Logging API Reference

This page documents the logging system classes and methods for structured logging in BootifyJS applications.

## Core Logging Service

### Logger

The main logging service built on top of Pino for high-performance structured logging.

#### Constructor

The Logger is automatically registered in the DI container and can be injected into your services.

**Example:**

```typescript
import { Service, Autowired, Logger } from "bootifyjs";

@Service()
export class UserService {
  @Autowired()
  private logger!: Logger;
}
```

---

#### Methods

##### info()

Logs an informational message.

**Signature:**

```typescript
info(message: string, context?: object): void
```

**Parameters:**

- `message`: Log message
- `context` (optional): Additional context object

**Example:**

```typescript
this.logger.info("User logged in", {
  userId: "123",
  email: "user@example.com",
  timestamp: new Date(),
});
```

---

##### error()

Logs an error message with optional error object.

**Signature:**

```typescript
error(message: string, error?: Error, context?: object): void
```

**Parameters:**

- `message`: Error message
- `error` (optional): Error object
- `context` (optional): Additional context object

**Example:**

```typescript
try {
  await this.processPayment(orderId);
} catch (error) {
  this.logger.error("Payment processing failed", error as Error, {
    orderId,
    userId: "123",
  });
}
```

---

##### warn()

Logs a warning message.

**Signature:**

```typescript
warn(message: string, context?: object): void
```

**Parameters:**

- `message`: Warning message
- `context` (optional): Additional context object

**Example:**

```typescript
this.logger.warn("API rate limit approaching", {
  userId: "123",
  requestCount: 95,
  limit: 100,
});
```

---

##### debug()

Logs a debug message (only in development).

**Signature:**

```typescript
debug(message: string, context?: object): void
```

**Parameters:**

- `message`: Debug message
- `context` (optional): Additional context object

**Example:**

```typescript
this.logger.debug("Cache lookup", {
  key: "user:123",
  hit: true,
  ttl: 300,
});
```

---

##### audit()

Creates a structured audit log entry.

**Signature:**

```typescript
audit(payload: object): void
```

**Parameters:**

- `payload`: Audit log payload

**Example:**

```typescript
this.logger.audit({
  action: "user.delete",
  resource: "user",
  resourceId: "123",
  actor: {
    userId: "456",
    role: "admin",
  },
  timestamp: new Date(),
  metadata: {
    reason: "User requested account deletion",
  },
});
```

---

##### access()

Logs HTTP access information.

**Signature:**

```typescript
access(payload: object): void
```

**Parameters:**

- `payload`: Access log payload

**Example:**

```typescript
this.logger.access({
  method: "GET",
  url: "/api/users/123",
  statusCode: 200,
  responseTime: 45,
  userId: "456",
  ip: "192.168.1.1",
});
```

---

##### span()

Logs distributed tracing span information.

**Signature:**

```typescript
span(payload: object): void
```

**Parameters:**

- `payload`: Span payload

**Example:**

```typescript
this.logger.span({
  traceId: "abc123",
  spanId: "def456",
  operation: "database.query",
  duration: 23,
  tags: {
    query: "SELECT * FROM users",
    rows: 10,
  },
});
```

---

##### child()

Creates a child logger with additional context.

**Signature:**

```typescript
child(bindings: object): pino.Logger
```

**Parameters:**

- `bindings`: Context to bind to the child logger

**Returns:**

- Pino logger instance with bound context

**Example:**

```typescript
import { Service, Autowired, Logger } from "bootifyjs";

@Service()
export class UserService {
  @Autowired()
  private logger!: Logger;

  async processUser(userId: string) {
    // Create child logger with user context
    const userLogger = this.logger.child({
      userId,
      component: "UserService",
    });

    userLogger.info("Processing user");
    userLogger.debug("Fetching user data");
    userLogger.info("User processed successfully");
  }
}
```

---

## Logger Provider

### loggerFactory()

Factory function that creates and configures the Pino logger instance.

**Signature:**

```typescript
loggerFactory(): pino.Logger
```

**Returns:**

- Configured Pino logger instance

**Configuration:**

- Reads configuration from `AppConfig`
- Sets up transports (console, file, ClickHouse, PostHog)
- Configures log levels and formatting
- Integrates with request context

**Example:**

```typescript
import { loggerFactory, LOGGER_TOKEN, container } from "bootifyjs";

// The logger is automatically registered
// But you can manually register if needed
container.register(LOGGER_TOKEN, {
  useFactory: loggerFactory,
});
```

---

### LOGGER_TOKEN

DI token for logger registration.

**Type:**

```typescript
const LOGGER_TOKEN: symbol;
```

**Usage:**

```typescript
import { LOGGER_TOKEN, container } from "bootifyjs";

// Resolve logger directly
const logger = container.resolve(LOGGER_TOKEN);
logger.info("Direct logger usage");
```

---

## Logging Decorators

### @Audit

Automatically creates audit logs after method execution.

**Signature:**

```typescript
@Audit(options: AuditOptions): MethodDecorator
```

**Parameters:**

- `options`: Audit configuration
  - `action`: Action being performed
  - `resource`: Resource type
  - `resourceIdPath` (optional): Path to extract resource ID

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
    // Audit log automatically created with user.id
    return user;
  }

  @Audit({
    action: "delete",
    resource: "user",
    resourceIdPath: "args.0",
  })
  async deleteUser(userId: string) {
    await this.userRepo.delete(userId);
    // Audit log created with userId from first argument
  }
}
```

---

### @Loggable

Injects a child logger instance into a class.

**Signature:**

```typescript
@Loggable(): ClassDecorator
```

**Behavior:**

- Automatically creates a child logger namespaced with the class name
- Injects as `this.logger` property
- Lazy initialization on first access

**Example:**

```typescript
import { Service, Loggable } from "bootifyjs";

@Service()
@Loggable()
export class UserService {
  private logger!: Logger; // Automatically injected

  async findAll() {
    this.logger.info("Fetching all users");
    const users = await this.userRepo.findAll();
    this.logger.info("Fetched users", { count: users.length });
    return users;
  }

  async findById(id: string) {
    this.logger.debug("Fetching user by ID", { id });
    return await this.userRepo.findById(id);
  }
}
```

---

## Types and Interfaces

### AuditOptions

Options for the `@Audit` decorator.

**Definition:**

```typescript
interface AuditOptions {
  action: string;
  resource: string;
  resourceIdPath?: string;
}
```

**Properties:**

- `action`: Action being performed (e.g., 'create', 'update', 'delete')
- `resource`: Resource type (e.g., 'user', 'order', 'product')
- `resourceIdPath`: Path to extract resource ID from method args or result

**Example:**

```typescript
import { AuditOptions } from "bootifyjs";

const options: AuditOptions = {
  action: "update",
  resource: "order",
  resourceIdPath: "args.0", // First argument is order ID
};
```

---

## Configuration

### Log Levels

Available log levels (in order of severity):

- `trace`: Most verbose, detailed debugging
- `debug`: Debugging information
- `info`: General informational messages
- `warn`: Warning messages
- `error`: Error messages
- `fatal`: Fatal errors that cause application termination

**Configuration:**

```typescript
// In .env file
LOG_LEVEL = info;

// In AppConfig
import { z } from "zod";

const LoggingConfigSchema = z.object({
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
});
```

---

### Transports

BootifyJS supports multiple log transports:

#### Console Transport

Outputs logs to stdout/stderr.

**Configuration:**

```typescript
{
  target: 'pino/file',
  level: 'info',
  options: {}
}
```

---

#### ClickHouse Transport

Sends logs to ClickHouse for analytics.

**Configuration:**

```typescript
// In .env
CLICKHOUSE_ENABLED=true
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=
CLICKHOUSE_DB=logs

// Transport configuration
{
  target: './clickhouse-transport.js',
  level: 'info',
  options: {
    url: process.env.CLICKHOUSE_URL,
    username: process.env.CLICKHOUSE_USER,
    password: process.env.CLICKHOUSE_PASSWORD,
    database: process.env.CLICKHOUSE_DB,
    application: process.env.SERVICE_NAME
  }
}
```

---

#### PostHog Transport

Sends logs to PostHog for product analytics.

**Configuration:**

```typescript
// In .env
POSTHOG_LOGGING_ENABLED=true
POSTHOG_API_KEY=your_api_key
POSTHOG_HOST=https://us.i.posthog.com

// Transport configuration
{
  target: './posthog-transport.js',
  level: 'info',
  options: {
    apiKey: process.env.POSTHOG_API_KEY,
    host: process.env.POSTHOG_HOST,
    serviceName: 'bootifyjs',
    instanceId: process.env.INSTANCE_ID || 'default'
  }
}
```

---

## Usage Examples

### Basic Logging

```typescript
import { Service, Autowired, Logger } from "bootifyjs";

@Service()
export class UserService {
  @Autowired()
  private logger!: Logger;

  async createUser(userData: any) {
    this.logger.info("Creating new user", { email: userData.email });

    try {
      const user = await this.userRepo.save(userData);
      this.logger.info("User created successfully", { userId: user.id });
      return user;
    } catch (error) {
      this.logger.error("Failed to create user", error as Error, {
        email: userData.email,
      });
      throw error;
    }
  }
}
```

---

### Structured Logging

```typescript
@Service()
export class OrderService {
  @Autowired()
  private logger!: Logger;

  async processOrder(orderId: string) {
    const startTime = Date.now();

    this.logger.info("Processing order", {
      orderId,
      stage: "start",
    });

    try {
      // Validate order
      this.logger.debug("Validating order", { orderId });
      await this.validateOrder(orderId);

      // Process payment
      this.logger.info("Processing payment", { orderId });
      await this.processPayment(orderId);

      // Ship order
      this.logger.info("Shipping order", { orderId });
      await this.shipOrder(orderId);

      const duration = Date.now() - startTime;
      this.logger.info("Order processed successfully", {
        orderId,
        duration,
        stage: "complete",
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error("Order processing failed", error as Error, {
        orderId,
        duration,
        stage: "failed",
      });
      throw error;
    }
  }
}
```

---

### Context-Aware Logging

```typescript
import { Service, Autowired, Logger, RequestContextService } from "bootifyjs";

@Service()
export class UserService {
  @Autowired()
  private logger!: Logger;

  @Autowired()
  private context!: RequestContextService;

  async updateUser(userId: string, data: any) {
    // Request context is automatically included in logs
    const requestId = this.context.get<string>("requestId");
    const actorId = this.context.get<string>("userId");

    this.logger.info("Updating user", {
      userId,
      actorId,
      requestId,
      changes: Object.keys(data),
    });

    const user = await this.userRepo.update(userId, data);

    this.logger.info("User updated", {
      userId,
      actorId,
      requestId,
    });

    return user;
  }
}
```

---

### Child Logger

```typescript
@Service()
export class PaymentService {
  @Autowired()
  private logger!: Logger;

  async processPayment(orderId: string, amount: number) {
    // Create child logger with payment context
    const paymentLogger = this.logger.child({
      component: "PaymentService",
      orderId,
      amount,
    });

    paymentLogger.info("Starting payment processing");

    try {
      paymentLogger.debug("Validating payment details");
      await this.validatePayment(orderId, amount);

      paymentLogger.info("Charging payment method");
      const result = await this.chargePayment(orderId, amount);

      paymentLogger.info("Payment processed successfully", {
        transactionId: result.transactionId,
      });

      return result;
    } catch (error) {
      paymentLogger.error("Payment processing failed", error as Error);
      throw error;
    }
  }
}
```

---

### Audit Logging

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
    return await this.userRepo.save(userData);
  }

  @Audit({
    action: "update",
    resource: "user",
    resourceIdPath: "args.0",
  })
  async updateUser(userId: string, data: any) {
    return await this.userRepo.update(userId, data);
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

## Best Practices

### Log Levels

Use appropriate log levels:

```typescript
// DEBUG: Detailed debugging information
this.logger.debug("Cache lookup", { key, hit: true });

// INFO: General informational messages
this.logger.info("User logged in", { userId });

// WARN: Warning messages for potential issues
this.logger.warn("API rate limit approaching", { count: 95, limit: 100 });

// ERROR: Error messages
this.logger.error("Database connection failed", error);
```

---

### Structured Context

Always include relevant context:

```typescript
// Good: Structured context
this.logger.info("Order created", {
  orderId: "123",
  userId: "456",
  total: 99.99,
  items: 3,
});

// Avoid: String concatenation
this.logger.info(`Order 123 created by user 456 with total 99.99`);
```

---

### Error Logging

Include error objects and context:

```typescript
try {
  await this.processOrder(orderId);
} catch (error) {
  this.logger.error("Order processing failed", error as Error, {
    orderId,
    userId,
    stage: "payment",
  });
  throw error;
}
```

---

### Performance Logging

Log performance metrics:

```typescript
async processLargeDataset(data: any[]) {
  const startTime = Date.now();

  this.logger.info('Processing dataset', {
    size: data.length,
    stage: 'start'
  });

  const result = await this.process(data);

  const duration = Date.now() - startTime;
  this.logger.info('Dataset processed', {
    size: data.length,
    duration,
    stage: 'complete'
  });

  return result;
}
```

---

### Sensitive Data

Never log sensitive information:

```typescript
// Good: Redact sensitive data
this.logger.info("User authenticated", {
  userId: user.id,
  email: user.email,
  // password is NOT logged
});

// Bad: Logging sensitive data
this.logger.info("User authenticated", {
  userId: user.id,
  password: user.password, // NEVER DO THIS
});
```

---

## See Also

- [Logging Module Overview](../modules/logging/overview.md)
- [Basic Usage Guide](../modules/logging/basic-usage.md)
- [Context Logging Guide](../modules/logging/context-logging.md)
- [Transports Guide](../modules/logging/transports.md)
