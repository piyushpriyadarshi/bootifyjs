---
id: event-handlers
title: Event Handlers
sidebar_label: Event Handlers
description: Learn how to create and manage event handlers in BootifyJS
keywords: [bootifyjs, event handlers, EventListener, OnEvent, decorators]
---

# Event Handlers

Event handlers are the components that react to events in your BootifyJS application. They use decorators to declaratively specify which events they handle, making your code clean and maintainable.

## Creating Event Handlers

### Basic Handler

Create a handler by decorating a class with `@EventListener()` and methods with `@OnEvent()`:

```typescript
import { EventListener, OnEvent } from "bootifyjs/events";
import { UserCreatedEvent } from "./events/user.events";

@EventListener()
export class WelcomeEmailHandler {
  @OnEvent("user.created")
  async sendWelcomeEmail(event: UserCreatedEvent) {
    console.log(`Sending welcome email to ${event.payload.email}`);
    // Email sending logic here
  }
}
```

### Handler with Dependencies

Handlers support full dependency injection:

```typescript
import { EventListener, OnEvent } from "bootifyjs/events";
import { Autowired } from "bootifyjs/core";
import { EmailService } from "../services/email.service";
import { Logger } from "bootifyjs/logging";

@EventListener()
export class UserNotificationHandler {
  constructor(
    @Autowired() private emailService: EmailService,
    @Autowired() private logger: Logger
  ) {}

  @OnEvent("user.created")
  async handleUserCreated(event: UserCreatedEvent) {
    this.logger.info("Processing user.created event", {
      userId: event.payload.userId,
    });

    await this.emailService.sendWelcomeEmail(
      event.payload.email,
      event.payload.userId
    );

    this.logger.info("Welcome email sent successfully");
  }
}
```

### Multiple Event Handlers in One Class

A single class can handle multiple event types:

```typescript
@EventListener()
export class UserAuditHandler {
  constructor(@Autowired() private auditLog: AuditLogService) {}

  @OnEvent("user.created")
  async logUserCreated(event: UserCreatedEvent) {
    await this.auditLog.log({
      action: "USER_CREATED",
      userId: event.payload.userId,
      timestamp: new Date(),
    });
  }

  @OnEvent("user.updated")
  async logUserUpdated(event: UserUpdatedEvent) {
    await this.auditLog.log({
      action: "USER_UPDATED",
      userId: event.payload.userId,
      changes: event.payload.changes,
      timestamp: new Date(),
    });
  }

  @OnEvent("user.deleted")
  async logUserDeleted(event: UserDeletedEvent) {
    await this.auditLog.log({
      action: "USER_DELETED",
      userId: event.payload.userId,
      timestamp: new Date(),
    });
  }
}
```

## Handler Lifecycle

### Registration

Event handlers are automatically registered during application bootstrap:

1. BootifyJS scans all classes decorated with `@EventListener()`
2. For each class, it finds methods decorated with `@OnEvent()`
3. Handlers are registered with the Event Bus
4. The handler instance is created using dependency injection

```typescript
// In your main application file
import { BootifyApp } from "bootifyjs";
import { UserNotificationHandler } from "./handlers/user-notification.handler";

const app = new BootifyApp({
  controllers: [
    /* ... */
  ],
  services: [
    /* ... */
  ],
  eventListeners: [UserNotificationHandler], // Register your handlers
});

await app.bootstrap(); // Handlers are registered here
```

### Execution

When an event is emitted:

1. Event Bus receives the event
2. All handlers registered for that event type are invoked
3. Handlers execute in parallel (not sequentially)
4. If a handler fails, it's retried automatically
5. After all retries fail, the event moves to the dead letter queue

## Advanced Patterns

### Conditional Event Handling

Handle events based on conditions:

```typescript
@EventListener()
export class PremiumUserHandler {
  constructor(@Autowired() private userService: UserService) {}

  @OnEvent("user.created")
  async handlePremiumUser(event: UserCreatedEvent) {
    // Only process premium users
    const user = await this.userService.findById(event.payload.userId);

    if (user.isPremium) {
      await this.sendPremiumWelcomePackage(user);
    }
  }

  private async sendPremiumWelcomePackage(user: User) {
    // Premium user onboarding logic
  }
}
```

### Event Transformation

Transform events into other events:

```typescript
@EventListener()
export class OrderEventTransformer {
  constructor(@Autowired() private eventBus: EventBusService) {}

  @OnEvent("order.placed")
  async transformOrderEvent(event: OrderPlacedEvent) {
    // Transform into multiple domain events
    this.eventBus.emit(
      new PaymentRequiredEvent({
        orderId: event.payload.orderId,
        amount: event.payload.total,
      })
    );

    this.eventBus.emit(
      new InventoryReservationRequiredEvent({
        orderId: event.payload.orderId,
        items: event.payload.items,
      })
    );

    this.eventBus.emit(
      new NotificationRequiredEvent({
        userId: event.payload.userId,
        type: "order_confirmation",
      })
    );
  }
}
```

### Aggregating Events

Collect multiple events before taking action:

```typescript
@EventListener()
export class OrderCompletionHandler {
  private orderStates = new Map<
    string,
    {
      paymentProcessed: boolean;
      inventoryReserved: boolean;
      shippingScheduled: boolean;
    }
  >();

  constructor(@Autowired() private eventBus: EventBusService) {}

  @OnEvent("payment.processed")
  async handlePaymentProcessed(event: PaymentProcessedEvent) {
    this.updateOrderState(event.payload.orderId, "paymentProcessed");
  }

  @OnEvent("inventory.reserved")
  async handleInventoryReserved(event: InventoryReservedEvent) {
    this.updateOrderState(event.payload.orderId, "inventoryReserved");
  }

  @OnEvent("shipping.scheduled")
  async handleShippingScheduled(event: ShippingScheduledEvent) {
    this.updateOrderState(event.payload.orderId, "shippingScheduled");
  }

  private updateOrderState(orderId: string, field: string) {
    const state = this.orderStates.get(orderId) || {
      paymentProcessed: false,
      inventoryReserved: false,
      shippingScheduled: false,
    };

    state[field] = true;
    this.orderStates.set(orderId, state);

    // Check if all steps are complete
    if (
      state.paymentProcessed &&
      state.inventoryReserved &&
      state.shippingScheduled
    ) {
      this.eventBus.emit(new OrderCompletedEvent({ orderId }));
      this.orderStates.delete(orderId); // Cleanup
    }
  }
}
```

### Idempotent Handlers

Ensure handlers can be safely retried:

```typescript
@EventListener()
export class IdempotentEmailHandler {
  private processedEvents = new Set<string>();

  constructor(@Autowired() private emailService: EmailService) {}

  @OnEvent("user.created")
  async sendWelcomeEmail(event: UserCreatedEvent) {
    // Use correlation ID to track processed events
    const eventId = event.correlationId || event.payload.userId;

    if (this.processedEvents.has(eventId)) {
      console.log(`Event ${eventId} already processed, skipping`);
      return;
    }

    await this.emailService.sendWelcomeEmail(event.payload.email);
    this.processedEvents.add(eventId);
  }
}
```

:::tip
For production systems, store processed event IDs in a database or cache instead of in-memory to survive application restarts.
:::

## Error Handling

### Graceful Error Handling

Catch and handle errors without triggering retries:

```typescript
@EventListener()
export class ResilientHandler {
  constructor(
    @Autowired() private logger: Logger,
    @Autowired() private eventBus: EventBusService
  ) {}

  @OnEvent("user.created")
  async handleUserCreated(event: UserCreatedEvent) {
    try {
      await this.sendWelcomeEmail(event.payload.email);
    } catch (error) {
      // Log the error
      this.logger.error("Failed to send welcome email", {
        error: error.message,
        userId: event.payload.userId,
      });

      // Emit a failure event for monitoring
      this.eventBus.emit(
        new EmailFailedEvent({
          userId: event.payload.userId,
          email: event.payload.email,
          error: error.message,
        })
      );

      // Don't throw - prevents retries for non-recoverable errors
    }
  }
}
```

### Retry-Worthy Errors

Let errors propagate for automatic retries:

```typescript
@EventListener()
export class ExternalApiHandler {
  constructor(@Autowired() private apiClient: ExternalApiClient) {}

  @OnEvent("data.sync.required")
  async syncData(event: DataSyncEvent) {
    // If this throws, it will be retried automatically
    // Good for transient errors like network timeouts
    await this.apiClient.syncData(event.payload);
  }
}
```

### Custom Retry Logic

Implement your own retry logic for specific scenarios:

```typescript
@EventListener()
export class CustomRetryHandler {
  constructor(@Autowired() private logger: Logger) {}

  @OnEvent("important.task")
  async handleImportantTask(event: ImportantTaskEvent) {
    const maxAttempts = 5;
    let attempt = 0;

    while (attempt < maxAttempts) {
      try {
        await this.performTask(event.payload);
        return; // Success
      } catch (error) {
        attempt++;
        this.logger.warn(`Task failed, attempt ${attempt}/${maxAttempts}`, {
          error: error.message,
        });

        if (attempt >= maxAttempts) {
          // All attempts failed, throw to move to DLQ
          throw new Error(`Task failed after ${maxAttempts} attempts`);
        }

        // Custom backoff strategy
        await this.sleep(Math.pow(2, attempt) * 1000);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

## Testing Event Handlers

### Unit Testing

Test handlers in isolation:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserNotificationHandler } from "./user-notification.handler";
import { EmailService } from "../services/email.service";
import { Logger } from "bootifyjs/logging";

describe("UserNotificationHandler", () => {
  let handler: UserNotificationHandler;
  let emailService: EmailService;
  let logger: Logger;

  beforeEach(() => {
    emailService = {
      sendWelcomeEmail: vi.fn(),
    } as any;

    logger = {
      info: vi.fn(),
      error: vi.fn(),
    } as any;

    handler = new UserNotificationHandler(emailService, logger);
  });

  it("should send welcome email when user is created", async () => {
    // Arrange
    const event = {
      type: "user.created",
      payload: {
        userId: "user-123",
        email: "test@example.com",
      },
    };

    // Act
    await handler.handleUserCreated(event);

    // Assert
    expect(emailService.sendWelcomeEmail).toHaveBeenCalledWith(
      "test@example.com",
      "user-123"
    );
    expect(logger.info).toHaveBeenCalledWith("Welcome email sent successfully");
  });

  it("should handle email service errors", async () => {
    // Arrange
    const event = {
      type: "user.created",
      payload: {
        userId: "user-123",
        email: "test@example.com",
      },
    };

    emailService.sendWelcomeEmail = vi
      .fn()
      .mockRejectedValue(new Error("SMTP error"));

    // Act & Assert
    await expect(handler.handleUserCreated(event)).rejects.toThrow(
      "SMTP error"
    );
  });
});
```

### Integration Testing

Test handlers with the Event Bus:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { BootifyApp } from "bootifyjs";
import { EventBusService } from "bootifyjs/events";
import { UserService } from "./user.service";
import { UserNotificationHandler } from "./handlers/user-notification.handler";

describe("User Event Flow", () => {
  let app: BootifyApp;
  let userService: UserService;
  let eventBus: EventBusService;

  beforeAll(async () => {
    app = new BootifyApp({
      controllers: [],
      services: [UserService],
      eventListeners: [UserNotificationHandler],
    });

    await app.bootstrap();

    userService = app.resolve(UserService);
    eventBus = app.resolve(EventBusService);
  });

  afterAll(async () => {
    await app.shutdown();
  });

  it("should trigger notification handler when user is created", async () => {
    // Arrange
    const handlerSpy = vi.spyOn(
      UserNotificationHandler.prototype,
      "handleUserCreated"
    );

    // Act
    await userService.createUser("test@example.com", "password");

    // Wait for async event processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Assert
    expect(handlerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "user.created",
        payload: expect.objectContaining({
          email: "test@example.com",
        }),
      })
    );
  });
});
```

## Performance Considerations

### Handler Execution

- Handlers execute **in parallel**, not sequentially
- Each handler runs independently
- One slow handler doesn't block others
- Failed handlers are retried independently

### Memory Usage

- Handler instances are singletons (one per class)
- Event objects are kept in memory during processing
- Dead letter queue stores failed events indefinitely

### Optimization Tips

1. **Keep Handlers Fast**: Aim for < 100ms execution time
2. **Use Async Operations**: Don't block with synchronous code
3. **Batch Operations**: Group multiple operations when possible
4. **Cache Frequently Used Data**: Reduce database queries
5. **Consider Buffered Events**: For high-volume or slow handlers

```typescript
@EventListener()
export class OptimizedHandler {
  private cache = new Map<string, any>();

  constructor(@Autowired() private dataService: DataService) {}

  @OnEvent("data.updated")
  async handleDataUpdate(event: DataUpdateEvent) {
    // Check cache first
    let data = this.cache.get(event.payload.id);

    if (!data) {
      // Fetch and cache
      data = await this.dataService.fetch(event.payload.id);
      this.cache.set(event.payload.id, data);
    }

    // Process with cached data
    await this.processData(data);
  }
}
```

## Best Practices

### 1. Single Responsibility

Each handler should do one thing:

```typescript
// ✅ Good: Focused handler
@EventListener()
export class WelcomeEmailHandler {
  @OnEvent("user.created")
  async sendWelcomeEmail(event: UserCreatedEvent) {
    await this.emailService.sendWelcomeEmail(event.payload.email);
  }
}

// ❌ Bad: Handler doing too much
@EventListener()
export class UserCreatedHandler {
  @OnEvent("user.created")
  async handleEverything(event: UserCreatedEvent) {
    await this.sendEmail(event);
    await this.createProfile(event);
    await this.trackAnalytics(event);
    await this.notifyAdmin(event);
    // Too many responsibilities!
  }
}
```

### 2. Descriptive Method Names

Use clear, descriptive names:

```typescript
// ✅ Good: Clear intent
@OnEvent('order.placed')
async sendOrderConfirmationEmail(event: OrderPlacedEvent) { }

// ❌ Bad: Vague name
@OnEvent('order.placed')
async handle(event: OrderPlacedEvent) { }
```

### 3. Type Safety

Use strongly-typed events:

```typescript
// ✅ Good: Type-safe
@OnEvent('user.created')
async handleUserCreated(event: UserCreatedEvent) {
  // TypeScript knows the event structure
  console.log(event.payload.email);
}

// ❌ Bad: Untyped
@OnEvent('user.created')
async handleUserCreated(event: any) {
  // No type safety
  console.log(event.payload.email);
}
```

### 4. Error Logging

Always log errors with context:

```typescript
@OnEvent('payment.processed')
async handlePayment(event: PaymentProcessedEvent) {
  try {
    await this.processPayment(event.payload);
  } catch (error) {
    this.logger.error('Payment processing failed', {
      error: error.message,
      orderId: event.payload.orderId,
      amount: event.payload.amount,
      correlationId: event.correlationId
    });
    throw error; // Re-throw for retry
  }
}
```

### 5. Idempotency

Make handlers safe to retry:

```typescript
@OnEvent('user.created')
async createUserProfile(event: UserCreatedEvent) {
  // Check if profile already exists
  const exists = await this.profileService.exists(event.payload.userId);

  if (exists) {
    console.log('Profile already exists, skipping');
    return;
  }

  await this.profileService.create(event.payload.userId);
}
```

## Common Pitfalls

### 1. Circular Event Dependencies

```typescript
// ❌ Bad: Creates infinite loop
@EventListener()
export class BadHandler {
  @OnEvent("event.a")
  async handleA(event: EventA) {
    this.eventBus.emit(new EventB()); // Triggers handleB
  }

  @OnEvent("event.b")
  async handleB(event: EventB) {
    this.eventBus.emit(new EventA()); // Triggers handleA - LOOP!
  }
}
```

### 2. Blocking Operations

```typescript
// ❌ Bad: Synchronous blocking
@OnEvent('data.process')
async handleData(event: DataEvent) {
  const result = this.heavyComputation(); // Blocks event loop
  await this.save(result);
}

// ✅ Good: Async operations
@OnEvent('data.process')
async handleData(event: DataEvent) {
  const result = await this.heavyComputationAsync(); // Non-blocking
  await this.save(result);
}
```

### 3. Missing Error Handling

```typescript
// ❌ Bad: No error handling
@OnEvent('user.created')
async sendEmail(event: UserCreatedEvent) {
  await this.emailService.send(event.payload.email);
  // If this fails, it will retry indefinitely
}

// ✅ Good: Graceful error handling
@OnEvent('user.created')
async sendEmail(event: UserCreatedEvent) {
  try {
    await this.emailService.send(event.payload.email);
  } catch (error) {
    if (error.code === 'INVALID_EMAIL') {
      // Don't retry for invalid emails
      this.logger.error('Invalid email', { email: event.payload.email });
      return;
    }
    // Retry for other errors
    throw error;
  }
}
```

## Next Steps

- [Event Bus](./event-bus) - Learn about publishing events
- [Buffered Events](./buffered-events) - High-performance event processing
