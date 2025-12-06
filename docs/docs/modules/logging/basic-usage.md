---
id: logging-basic-usage
title: Basic Usage
sidebar_label: Basic Usage
---

# Basic Logging Usage

This guide covers the fundamental logging operations in BootifyJS, including log levels, structured logging, and child loggers.

## Injecting the Logger

The `Logger` service is available through dependency injection in any BootifyJS component:

```typescript
import { Service, Autowired } from "bootifyjs/core";
import { Logger } from "bootifyjs/logging";

@Service()
export class UserService {
  constructor(@Autowired() private logger: Logger) {}

  // Use this.logger in your methods
}
```

## Log Levels

BootifyJS supports six log levels, each serving a specific purpose.

### trace()

Most verbose level for detailed debugging information. Typically disabled in production.

```typescript
this.logger.trace("Entering method", {
  method: "processPayment",
  args: { amount: 100 },
});
```

**When to use**: Deep debugging, tracing execution flow through complex logic.

### debug()

Debugging information useful during development.

```typescript
this.logger.debug("User query executed", {
  query: "SELECT * FROM users WHERE id = ?",
  params: [userId],
  resultCount: 1,
});
```

**When to use**: Development debugging, understanding application behavior.

### info()

Informational messages about normal application operations.

```typescript
this.logger.info("User created successfully", {
  userId: user.id,
  email: user.email,
});
```

**When to use**: Tracking normal operations, business events, successful completions.

### warn()

Warning messages for potentially harmful situations that don't prevent operation.

```typescript
this.logger.warn("API rate limit approaching", {
  current: 950,
  limit: 1000,
  resetAt: new Date(),
});
```

**When to use**: Deprecated features, configuration issues, approaching limits.

### error()

Error conditions that need attention but don't crash the application.

```typescript
this.logger.error("Failed to send email", error, {
  recipient: user.email,
  template: "welcome",
});
```

**When to use**: Caught exceptions, failed operations, integration errors.

### fatal()

Critical conditions that may cause application failure.

```typescript
this.logger.fatal("Database connection lost", error, {
  host: dbConfig.host,
  retryAttempts: 3,
});
```

**When to use**: Unrecoverable errors, critical system failures.

## Structured Logging

Always include context objects with your log messages for better searchability:

```typescript
// ❌ Bad: String concatenation
this.logger.info(`User ${userId} logged in from ${ip}`);

// ✅ Good: Structured context
this.logger.info("User logged in", {
  userId,
  ip,
  userAgent: req.headers["user-agent"],
});
```

The structured approach makes logs:

- Easier to search and filter
- Machine-readable for log aggregation tools
- Consistent across your application

## Error Logging

When logging errors, pass the error object as the second parameter:

```typescript
try {
  await this.processPayment(payment);
} catch (error) {
  this.logger.error("Payment processing failed", error, {
    paymentId: payment.id,
    amount: payment.amount,
    currency: payment.currency,
  });
  throw error;
}
```

This automatically includes:

- Error message
- Stack trace
- Error type/code

## Child Loggers

Create child loggers with additional context that applies to all subsequent logs:

```typescript
@Service()
export class PaymentService {
  constructor(@Autowired() private logger: Logger) {}

  async processPayment(payment: Payment) {
    // Create a child logger with payment context
    const paymentLogger = this.logger.child({
      paymentId: payment.id,
      amount: payment.amount,
      currency: payment.currency,
    });

    paymentLogger.info("Starting payment processing");

    try {
      await this.validatePayment(payment);
      paymentLogger.debug("Payment validated");

      await this.chargeCard(payment);
      paymentLogger.info("Card charged successfully");

      await this.sendReceipt(payment);
      paymentLogger.info("Receipt sent");

      return { success: true };
    } catch (error) {
      // All context is automatically included
      paymentLogger.error("Payment failed", error);
      throw error;
    }
  }
}
```

All logs from `paymentLogger` will automatically include the payment context.

## Specialized Log Methods

### audit()

Create structured audit logs for compliance and security:

```typescript
this.logger.audit({
  action: "user.update",
  resource: "User",
  resourceId: userId,
  userId: currentUser.id,
  username: currentUser.username,
  changes: {
    email: { old: "old@example.com", new: "new@example.com" },
  },
});
```

### access()

Log HTTP access information (typically used by middleware):

```typescript
this.logger.access({
  method: req.method,
  url: req.url,
  statusCode: reply.statusCode,
  responseTime: reply.elapsedTime,
  requestId: req.id,
  userAgent: req.headers["user-agent"],
  ip: req.ip,
});
```

### span()

Log distributed tracing spans:

```typescript
this.logger.span({
  traceId: "trace-123",
  spanId: "span-456",
  parentSpanId: "span-789",
  operationName: "database.query",
  startTime: startTime.toISOString(),
  endTime: endTime.toISOString(),
  duration: endTime - startTime,
  status: "ok",
});
```

## Configuration

### Setting Log Level

Control verbosity through the `LOG_LEVEL` environment variable:

```env
# Development
LOG_LEVEL=debug

# Production
LOG_LEVEL=info
```

Valid values: `trace`, `debug`, `info`, `warn`, `error`, `fatal`

### Service Name

Identify your service in logs:

```env
SERVICE_NAME=user-service
```

This appears in all log entries:

```json
{
  "level": "info",
  "message": "User created",
  "service": "user-service"
}
```

## Best Practices

### 1. Use Appropriate Log Levels

```typescript
// ✅ Good
this.logger.debug("Cache hit", { key: cacheKey });
this.logger.info("Order placed", { orderId: order.id });
this.logger.error("Payment failed", error, { orderId: order.id });

// ❌ Bad
this.logger.info("Variable x = 5"); // Too verbose for info
this.logger.error("User not found"); // Not an error, use warn or info
```

### 2. Include Relevant Context

```typescript
// ✅ Good
this.logger.info("Email sent", {
  recipient: user.email,
  template: "welcome",
  messageId: result.messageId,
});

// ❌ Bad
this.logger.info("Email sent");
```

### 3. Don't Log Sensitive Data

```typescript
// ❌ Bad
this.logger.info("User authenticated", {
  password: user.password,
  creditCard: user.creditCard,
});

// ✅ Good
this.logger.info("User authenticated", {
  userId: user.id,
  email: user.email,
});
```

### 4. Use Child Loggers for Scoped Context

```typescript
// ✅ Good
const requestLogger = this.logger.child({ requestId: req.id });
requestLogger.info("Processing request");
requestLogger.debug("Validating input");
requestLogger.info("Request completed");

// ❌ Bad
this.logger.info("Processing request", { requestId: req.id });
this.logger.debug("Validating input", { requestId: req.id });
this.logger.info("Request completed", { requestId: req.id });
```

### 5. Log at Decision Points

```typescript
async processOrder(order: Order) {
  this.logger.info('Processing order', { orderId: order.id });

  if (order.amount > 1000) {
    this.logger.warn('High-value order requires approval', {
      orderId: order.id,
      amount: order.amount
    });
    return this.requestApproval(order);
  }

  this.logger.debug('Order approved automatically', { orderId: order.id });
  return this.fulfillOrder(order);
}
```

## Example: Complete Service

Here's a complete example showing logging best practices:

```typescript
import { Service, Autowired } from "bootifyjs/core";
import { Logger } from "bootifyjs/logging";

@Service()
export class OrderService {
  constructor(
    @Autowired() private logger: Logger,
    @Autowired() private paymentService: PaymentService,
    @Autowired() private inventoryService: InventoryService
  ) {}

  async createOrder(orderData: CreateOrderDto, userId: string) {
    const orderLogger = this.logger.child({
      operation: "createOrder",
      userId,
    });

    orderLogger.info("Creating order", {
      itemCount: orderData.items.length,
      totalAmount: orderData.total,
    });

    try {
      // Validate inventory
      orderLogger.debug("Checking inventory");
      const available = await this.inventoryService.checkAvailability(
        orderData.items
      );

      if (!available) {
        orderLogger.warn("Insufficient inventory", {
          items: orderData.items,
        });
        throw new Error("Items not available");
      }

      // Process payment
      orderLogger.info("Processing payment", {
        amount: orderData.total,
      });

      const payment = await this.paymentService.charge({
        amount: orderData.total,
        userId,
      });

      orderLogger.debug("Payment successful", {
        paymentId: payment.id,
      });

      // Create order
      const order = await this.saveOrder({
        ...orderData,
        userId,
        paymentId: payment.id,
      });

      orderLogger.info("Order created successfully", {
        orderId: order.id,
      });

      return order;
    } catch (error) {
      orderLogger.error("Order creation failed", error, {
        step: "order-creation",
      });
      throw error;
    }
  }
}
```

## Next Steps

- [Context Logging](./context-logging.md) - Learn about automatic request context
- [Transports](./transports.md) - Configure log destinations
