---
id: event-bus
title: Event Bus
sidebar_label: Event Bus
description: Learn how to use BootifyJS's EventBusService for publish-subscribe event handling
keywords: [bootifyjs, event bus, pub-sub, events, messaging]
---

# Event Bus

The `EventBusService` is the core component for event-driven communication in BootifyJS. It provides a simple, reliable way to publish and subscribe to events within your application.

## Overview

The Event Bus implements the publish-subscribe pattern, allowing components to communicate without direct dependencies. Publishers emit events, and subscribers (handlers) react to them asynchronously.

### Key Features

- **Type-safe events**: Define events with TypeScript interfaces
- **Automatic retries**: Failed handlers retry up to 3 times
- **Dead letter queue**: Track permanently failed events
- **Correlation tracking**: Trace event chains across your application
- **Zero configuration**: Works out of the box

## Basic Usage

### 1. Define Your Events

Events must implement the `IEvent` interface:

```typescript
import { IEvent } from "bootifyjs/events";

export class UserCreatedEvent implements IEvent {
  readonly type = "user.created";

  constructor(
    public payload: {
      userId: string;
      email: string;
      createdAt: Date;
    }
  ) {}
}

export class UserDeletedEvent implements IEvent {
  readonly type = "user.deleted";

  constructor(
    public payload: {
      userId: string;
      deletedAt: Date;
    }
  ) {}
}
```

:::tip
Use descriptive, namespaced event types like `user.created`, `order.placed`, or `payment.processed` to avoid naming conflicts.
:::

### 2. Create Event Handlers

Use the `@EventListener()` decorator on classes and `@OnEvent()` on methods:

```typescript
import { EventListener, OnEvent } from "bootifyjs/events";
import { UserCreatedEvent, UserDeletedEvent } from "./events/user.events";

@EventListener()
export class UserNotificationHandler {
  @OnEvent("user.created")
  async handleUserCreated(event: UserCreatedEvent) {
    console.log(`Sending welcome email to ${event.payload.email}`);
    await this.sendWelcomeEmail(event.payload.email);
  }

  @OnEvent("user.deleted")
  async handleUserDeleted(event: UserDeletedEvent) {
    console.log(`User ${event.payload.userId} deleted`);
    await this.cleanupUserData(event.payload.userId);
  }

  private async sendWelcomeEmail(email: string) {
    // Email sending logic
  }

  private async cleanupUserData(userId: string) {
    // Cleanup logic
  }
}
```

### 3. Publish Events

Inject `EventBusService` and call `emit()`:

```typescript
import { Service, Autowired } from "bootifyjs/core";
import { EventBusService } from "bootifyjs/events";
import { UserCreatedEvent } from "./events/user.events";

@Service()
export class UserService {
  constructor(@Autowired() private eventBus: EventBusService) {}

  async createUser(email: string, password: string) {
    // Create user in database
    const user = await this.userRepository.create({ email, password });

    // Emit event
    this.eventBus.emit(
      new UserCreatedEvent({
        userId: user.id,
        email: user.email,
        createdAt: new Date(),
      })
    );

    return user;
  }
}
```

## Advanced Usage

### Multiple Handlers for One Event

Multiple handlers can listen to the same event:

```typescript
@EventListener()
export class UserNotificationHandler {
  @OnEvent("user.created")
  async sendWelcomeEmail(event: UserCreatedEvent) {
    await this.emailService.send(event.payload.email, "Welcome!");
  }
}

@EventListener()
export class UserAnalyticsHandler {
  @OnEvent("user.created")
  async trackUserCreation(event: UserCreatedEvent) {
    await this.analytics.track("user_created", {
      userId: event.payload.userId,
    });
  }
}

@EventListener()
export class UserProfileHandler {
  @OnEvent("user.created")
  async createUserProfile(event: UserCreatedEvent) {
    await this.profileService.create(event.payload.userId);
  }
}
```

All three handlers will execute when a `user.created` event is emitted.

### One Handler for Multiple Events

A single handler can listen to multiple event types:

```typescript
@EventListener()
export class AuditLogHandler {
  @OnEvent("user.created")
  async logUserCreated(event: UserCreatedEvent) {
    await this.auditLog.log("USER_CREATED", event.payload);
  }

  @OnEvent("user.updated")
  async logUserUpdated(event: UserUpdatedEvent) {
    await this.auditLog.log("USER_UPDATED", event.payload);
  }

  @OnEvent("user.deleted")
  async logUserDeleted(event: UserDeletedEvent) {
    await this.auditLog.log("USER_DELETED", event.payload);
  }
}
```

### Event Chaining

Events can trigger other events, creating workflows:

```typescript
@EventListener()
export class OrderHandler {
  constructor(
    @Autowired() private eventBus: EventBusService,
    @Autowired() private paymentService: PaymentService
  ) {}

  @OnEvent("order.placed")
  async handleOrderPlaced(event: OrderPlacedEvent) {
    // Process payment
    const payment = await this.paymentService.charge(
      event.payload.userId,
      event.payload.total
    );

    // Emit next event in the chain
    this.eventBus.emit(
      new PaymentProcessedEvent({
        orderId: event.payload.orderId,
        paymentId: payment.id,
        amount: payment.amount,
      })
    );
  }

  @OnEvent("payment.processed")
  async handlePaymentProcessed(event: PaymentProcessedEvent) {
    // Update inventory
    await this.inventoryService.reserve(event.payload.orderId);

    // Emit next event
    this.eventBus.emit(
      new OrderConfirmedEvent({
        orderId: event.payload.orderId,
      })
    );
  }
}
```

### Correlation Tracking

Events automatically include correlation IDs from the request context:

```typescript
@EventListener()
export class OrderHandler {
  @OnEvent("order.placed")
  async handleOrderPlaced(event: OrderPlacedEvent) {
    // The correlationId is automatically set from the request context
    console.log(`Processing order with correlation ID: ${event.correlationId}`);

    // All logs and subsequent events will share this correlation ID
    // This helps trace the entire request flow
  }
}
```

## Error Handling

### Automatic Retries

The Event Bus automatically retries failed handlers:

```typescript
@EventListener()
export class EmailHandler {
  @OnEvent("user.created")
  async sendEmail(event: UserCreatedEvent) {
    // If this throws an error, it will be retried up to 3 times
    // with exponential backoff (500ms, 1000ms, 1500ms)
    await this.emailService.send(event.payload.email);
  }
}
```

**Retry Configuration:**

- Maximum retries: 3 attempts
- Retry delay: 500ms × attempt number
- Total retry time: ~3 seconds

### Dead Letter Queue

Events that fail all retry attempts are moved to the dead letter queue:

```typescript
import { Service, Autowired } from "bootifyjs/core";
import { EventBusService } from "bootifyjs/events";

@Service()
export class EventMonitorService {
  constructor(@Autowired() private eventBus: EventBusService) {}

  getFailedEvents() {
    // Get all events that failed after all retries
    return this.eventBus.getDeadLetterQueue();
  }

  async retryFailedEvent(event: any) {
    // Manually retry a failed event
    this.eventBus.emit(event);
  }
}
```

### Graceful Error Handling

Handle errors within your handlers to prevent retries:

```typescript
@EventListener()
export class NotificationHandler {
  @OnEvent("user.created")
  async sendNotification(event: UserCreatedEvent) {
    try {
      await this.notificationService.send(event.payload.userId);
    } catch (error) {
      // Log the error but don't throw
      // This prevents retries for non-recoverable errors
      console.error("Failed to send notification:", error);

      // Optionally emit a failure event
      this.eventBus.emit(
        new NotificationFailedEvent({
          userId: event.payload.userId,
          error: error.message,
        })
      );
    }
  }
}
```

## Dependency Injection

Event handlers support full dependency injection:

```typescript
@EventListener()
export class OrderHandler {
  constructor(
    @Autowired() private orderRepository: OrderRepository,
    @Autowired() private emailService: EmailService,
    @Autowired() private logger: Logger,
    @Autowired() private eventBus: EventBusService
  ) {}

  @OnEvent("order.placed")
  async handleOrderPlaced(event: OrderPlacedEvent) {
    // Use injected dependencies
    const order = await this.orderRepository.findById(event.payload.orderId);
    await this.emailService.sendOrderConfirmation(order);
    this.logger.info("Order processed", { orderId: order.id });
  }
}
```

## Testing Event Handlers

### Unit Testing

Test handlers in isolation:

```typescript
import { describe, it, expect, vi } from "vitest";
import { UserNotificationHandler } from "./user-notification.handler";
import { UserCreatedEvent } from "./events/user.events";

describe("UserNotificationHandler", () => {
  it("should send welcome email on user created", async () => {
    // Arrange
    const handler = new UserNotificationHandler();
    const sendEmailSpy = vi.spyOn(handler as any, "sendWelcomeEmail");

    const event = new UserCreatedEvent({
      userId: "user-123",
      email: "test@example.com",
      createdAt: new Date(),
    });

    // Act
    await handler.handleUserCreated(event);

    // Assert
    expect(sendEmailSpy).toHaveBeenCalledWith("test@example.com");
  });
});
```

### Integration Testing

Test the full event flow:

```typescript
import { describe, it, expect } from "vitest";
import { BootifyApp } from "bootifyjs";
import { EventBusService } from "bootifyjs/events";
import { UserService } from "./user.service";

describe("User Creation Flow", () => {
  it("should trigger notification handler when user is created", async () => {
    // Arrange
    const app = new BootifyApp({
      controllers: [],
      services: [UserService],
      eventListeners: [UserNotificationHandler],
    });

    await app.bootstrap();

    const userService = app.resolve(UserService);
    const eventBus = app.resolve(EventBusService);

    // Spy on event emission
    const emitSpy = vi.spyOn(eventBus, "emit");

    // Act
    await userService.createUser("test@example.com", "password");

    // Assert
    expect(emitSpy).toHaveBeenCalledWith(
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

### Event Bus Performance

- **Throughput**: ~10,000 events/second on a single core
- **Latency**: Less than 1ms for event emission
- **Handler execution**: Synchronous, blocks until all handlers complete
- **Memory**: Minimal overhead, events are not persisted

### When to Use Standard Event Bus

✅ **Good for:**

- Low to moderate event volume (< 100 events/sec)
- Fast handlers (< 100ms execution time)
- Simple event flows
- Development and testing

❌ **Not ideal for:**

- High event volume (> 500 events/sec)
- Slow handlers (> 1 second execution time)
- CPU-intensive event processing
- Scenarios where event processing shouldn't block requests

:::tip
If you need higher throughput or want to prevent event processing from blocking your application, consider using [Buffered Events](./buffered-events.md) instead.
:::

## API Reference

### EventBusService

#### Methods

##### `emit(event: IEvent): void`

Publishes an event to all registered handlers.

```typescript
this.eventBus.emit(
  new UserCreatedEvent({ userId: "123", email: "user@example.com" })
);
```

##### `subscribe(eventType: string, handler: IEventHandler): void`

Manually subscribes a handler to an event type. Usually not needed as `@OnEvent()` handles this automatically.

```typescript
this.eventBus.subscribe("user.created", {
  handle: async (event) => {
    console.log("User created:", event);
  },
});
```

##### `getDeadLetterQueue(): IEvent[]`

Returns all events that failed after all retry attempts.

```typescript
const failedEvents = this.eventBus.getDeadLetterQueue();
console.log(`${failedEvents.length} events failed`);
```

### Decorators

#### `@EventListener()`

Marks a class as an event listener. The framework will scan for `@OnEvent()` methods.

```typescript
@EventListener()
export class MyHandler {
  // ...
}
```

#### `@OnEvent(eventType: string)`

Registers a method as a handler for a specific event type.

```typescript
@OnEvent('my.event')
async handleMyEvent(event: MyEvent) {
  // ...
}
```

### Interfaces

#### `IEvent`

Base interface for all events.

```typescript
interface IEvent {
  readonly type: string; // Unique event identifier
  payload: any; // Event data
  correlationId?: string; // For tracing event chains
}
```

#### `IEventHandler<T extends IEvent>`

Interface for event handlers.

```typescript
interface IEventHandler<T extends IEvent = IEvent> {
  handle(event: T): Promise<void> | void;
}
```

## Best Practices

1. **Use Descriptive Event Names**: `user.created` is better than `uc` or `userCreated`
2. **Keep Events Immutable**: Use `readonly` properties to prevent modification
3. **Include All Necessary Data**: Handlers shouldn't need to fetch additional data
4. **Handle Errors Gracefully**: Catch errors that shouldn't trigger retries
5. **Monitor Dead Letter Queue**: Set up alerts for failed events
6. **Use Correlation IDs**: They're automatically added, use them for debugging
7. **Keep Handlers Focused**: Each handler should do one thing well
8. **Avoid Circular Dependencies**: Don't create event loops

## Common Patterns

### Saga Pattern

Coordinate long-running transactions across services:

```typescript
@EventListener()
export class OrderSaga {
  @OnEvent("order.placed")
  async startSaga(event: OrderPlacedEvent) {
    this.eventBus.emit(new ProcessPaymentCommand(event.payload));
  }

  @OnEvent("payment.processed")
  async continueAfterPayment(event: PaymentProcessedEvent) {
    this.eventBus.emit(new ReserveInventoryCommand(event.payload));
  }

  @OnEvent("inventory.reserved")
  async completeOrder(event: InventoryReservedEvent) {
    this.eventBus.emit(new OrderCompletedEvent(event.payload));
  }
}
```

### Event Sourcing

Store events as the source of truth:

```typescript
@EventListener()
export class EventStore {
  @OnEvent("*") // Listen to all events
  async storeEvent(event: IEvent) {
    await this.database.events.insert({
      type: event.type,
      payload: event.payload,
      correlationId: event.correlationId,
      timestamp: new Date(),
    });
  }
}
```

### CQRS (Command Query Responsibility Segregation)

Separate read and write models:

```typescript
@EventListener()
export class UserReadModelUpdater {
  @OnEvent("user.created")
  async updateReadModel(event: UserCreatedEvent) {
    await this.readDatabase.users.insert({
      id: event.payload.userId,
      email: event.payload.email,
      createdAt: event.payload.createdAt,
    });
  }

  @OnEvent("user.updated")
  async updateExistingUser(event: UserUpdatedEvent) {
    await this.readDatabase.users.update(
      event.payload.userId,
      event.payload.changes
    );
  }
}
```

## Next Steps

- [Event Handlers](./event-handlers) - Deep dive into creating event handlers
- [Buffered Events](./buffered-events) - High-performance event processing
