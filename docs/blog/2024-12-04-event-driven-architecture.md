---
slug: event-driven-architecture-nodejs
title: Building Event-Driven Applications with BootifyJS
authors: [bootifyjs]
tags: [tutorial, architecture, typescript]
---

Event-driven architecture (EDA) is a powerful pattern for building scalable, decoupled applications. BootifyJS includes a built-in event bus that makes implementing EDA straightforward. Let's explore how to use it effectively.

<!-- truncate -->

## Why Event-Driven?

Traditional request-response patterns create tight coupling between components. Event-driven architecture offers:

- **Loose coupling** - Publishers don't know about subscribers
- **Scalability** - Easy to add new handlers without modifying existing code
- **Resilience** - Failed handlers don't affect the main flow
- **Auditability** - Events create a natural audit trail

## The BootifyJS Event Bus

### Publishing Events

Define your events as classes:

```typescript
import { Event } from "bootifyjs";

class UserCreatedEvent extends Event {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly createdAt: Date = new Date()
  ) {
    super();
  }
}
```

Publish events from your services:

```typescript
import { Injectable, EventBus } from "bootifyjs";

@Injectable()
class UserService {
  constructor(private eventBus: EventBus) {}

  async createUser(data: CreateUserDto) {
    const user = await this.userRepository.create(data);

    // Publish event - handlers run asynchronously
    await this.eventBus.publish(new UserCreatedEvent(user.id, user.email));

    return user;
  }
}
```

### Subscribing to Events

Use the `@OnEvent` decorator to handle events:

```typescript
import { Injectable, OnEvent } from "bootifyjs";

@Injectable()
class EmailService {
  @OnEvent(UserCreatedEvent)
  async sendWelcomeEmail(event: UserCreatedEvent) {
    await this.mailer.send({
      to: event.email,
      subject: "Welcome!",
      template: "welcome",
    });
  }
}

@Injectable()
class AnalyticsService {
  @OnEvent(UserCreatedEvent)
  async trackSignup(event: UserCreatedEvent) {
    await this.analytics.track("user_signup", {
      userId: event.userId,
      timestamp: event.createdAt,
    });
  }
}
```

Both handlers run independently—if email fails, analytics still works.

## Advanced Features

### Retry Configuration

Configure automatic retries for failed handlers:

```typescript
@OnEvent(UserCreatedEvent, {
  retries: 3,
  backoff: 'exponential',
  maxDelay: 30000,
})
async sendWelcomeEmail(event: UserCreatedEvent) {
  // Will retry up to 3 times with exponential backoff
}
```

### Dead Letter Queue

Failed events (after all retries) go to the dead letter queue:

```typescript
import { Injectable, OnDeadLetter } from "bootifyjs";

@Injectable()
class DeadLetterHandler {
  @OnDeadLetter()
  async handleFailedEvent(event: Event, error: Error) {
    // Log, alert, or store for manual processing
    console.error("Event failed permanently:", event, error);
    await this.alertService.notify("Event processing failed", { event, error });
  }
}
```

### Event Buffering

For high-throughput scenarios, buffer events for batch processing:

```typescript
@OnEvent(PageViewEvent, {
  buffer: {
    size: 100,      // Process in batches of 100
    timeout: 5000,  // Or every 5 seconds
  },
})
async trackPageViews(events: PageViewEvent[]) {
  // Batch insert for efficiency
  await this.analytics.batchInsert(events);
}
```

### Priority Queues

Assign priorities to handlers:

```typescript
@OnEvent(OrderCreatedEvent, { priority: 'high' })
async processPayment(event: OrderCreatedEvent) {
  // Runs before low-priority handlers
}

@OnEvent(OrderCreatedEvent, { priority: 'low' })
async sendConfirmationEmail(event: OrderCreatedEvent) {
  // Runs after high-priority handlers
}
```

## Patterns and Best Practices

### 1. Event Naming

Use past tense for events—they represent something that happened:

```typescript
// Good
class UserCreatedEvent {}
class OrderShippedEvent {}
class PaymentFailedEvent {}

// Avoid
class CreateUserEvent {} // Sounds like a command
class UserEvent {} // Too vague
```

### 2. Event Immutability

Make events immutable with `readonly` properties:

```typescript
class OrderCreatedEvent extends Event {
  constructor(
    public readonly orderId: string,
    public readonly items: ReadonlyArray<OrderItem>,
    public readonly total: number
  ) {
    super();
  }
}
```

### 3. Include Sufficient Context

Events should be self-contained:

```typescript
// Good - includes all needed data
class OrderShippedEvent extends Event {
  constructor(
    public readonly orderId: string,
    public readonly customerEmail: string,
    public readonly trackingNumber: string,
    public readonly carrier: string,
    public readonly estimatedDelivery: Date
  ) {
    super();
  }
}

// Avoid - requires additional lookups
class OrderShippedEvent extends Event {
  constructor(public readonly orderId: string) {
    super();
  }
}
```

### 4. Idempotent Handlers

Design handlers to be safely re-run:

```typescript
@OnEvent(PaymentReceivedEvent)
async updateOrderStatus(event: PaymentReceivedEvent) {
  // Idempotent - safe to run multiple times
  await this.orderRepository.update(event.orderId, {
    status: 'paid',
    paidAt: event.timestamp,
  });
}
```

## Testing Events

BootifyJS provides testing utilities for events:

```typescript
import { TestEventBus } from "bootifyjs/testing";

describe("UserService", () => {
  let eventBus: TestEventBus;
  let userService: UserService;

  beforeEach(() => {
    eventBus = new TestEventBus();
    userService = new UserService(eventBus);
  });

  it("should publish UserCreatedEvent", async () => {
    await userService.createUser({ email: "test@example.com" });

    expect(eventBus.published).toContainEqual(
      expect.objectContaining({
        email: "test@example.com",
      })
    );
  });
});
```

## Conclusion

Event-driven architecture with BootifyJS enables you to build scalable, maintainable applications. The built-in event bus handles the complexity of async processing, retries, and error handling, letting you focus on business logic.

Explore the [Events documentation](/docs/modules/events/event-bus) for more details.
