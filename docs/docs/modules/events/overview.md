---
id: events-overview
title: Events Module Overview
sidebar_label: Overview
description: Learn about BootifyJS's powerful event-driven architecture with publish-subscribe patterns
keywords: [bootifyjs, events, event-driven, pub-sub, event bus]
---

# Events Module Overview

The Events module provides a robust event-driven architecture for BootifyJS applications, enabling loose coupling between components through a publish-subscribe pattern. It supports both synchronous and high-performance buffered event processing with worker threads.

## Why Use Events?

Event-driven architecture offers several benefits:

- **Decoupling**: Components communicate without direct dependencies
- **Scalability**: Handle high-throughput scenarios efficiently
- **Flexibility**: Add new event handlers without modifying existing code
- **Reliability**: Built-in retry logic and dead letter queue for failed events
- **Performance**: Optional buffered processing prevents main thread blocking

## Key Features

### 1. Simple Event Bus

The standard `EventBusService` provides synchronous event processing with:

- Type-safe event definitions
- Automatic retry on failure (configurable)
- Dead letter queue for permanently failed events
- Request correlation tracking

### 2. Buffered Event Processing

The `BufferedEventBusService` offers high-performance asynchronous processing with:

- Worker thread-based processing (off main thread)
- Priority-based event handling (critical, normal, low)
- Shared memory buffer for zero-copy event passing
- Auto-scaling worker pools
- Comprehensive metrics and health monitoring

### 3. Decorator-Based Handlers

Use decorators to define event handlers declaratively:

```typescript
@EventListener()
export class UserNotificationHandler {
  @OnEvent("user.created")
  async handleUserCreated(event: UserCreatedEvent) {
    // Handle event
  }
}
```

## When to Use Each Approach

### Use Standard Event Bus When:

- Events process quickly (< 100ms)
- Low to moderate event volume (< 100 events/sec)
- Simplicity is preferred over maximum performance
- Events must be processed immediately

### Use Buffered Event Bus When:

- Events take longer to process (> 100ms)
- High event volume (> 500 events/sec)
- Event processing shouldn't block web requests
- You need priority-based processing
- Advanced monitoring is required

## Quick Example

Here's a complete example of event-driven communication:

```typescript
import { IEvent } from "bootifyjs/events";

// 1. Define your event
export class OrderPlacedEvent implements IEvent {
  readonly type = "order.placed";

  constructor(
    public payload: {
      orderId: string;
      userId: string;
      total: number;
    }
  ) {}
}

// 2. Create an event handler
import { EventListener, OnEvent } from "bootifyjs/events";

@EventListener()
export class OrderNotificationHandler {
  @OnEvent("order.placed")
  async handleOrderPlaced(event: OrderPlacedEvent) {
    console.log(`Sending confirmation for order ${event.payload.orderId}`);
    // Send email, SMS, push notification, etc.
  }
}

// 3. Emit events from your service
import { Service, Autowired } from "bootifyjs/core";
import { EventBusService } from "bootifyjs/events";

@Service()
export class OrderService {
  constructor(@Autowired() private eventBus: EventBusService) {}

  async placeOrder(userId: string, items: any[]) {
    // Create order logic
    const order = { id: "order-123", userId, total: 99.99 };

    // Emit event
    this.eventBus.emit(
      new OrderPlacedEvent({
        orderId: order.id,
        userId: order.userId,
        total: order.total,
      })
    );

    return order;
  }
}
```

## Architecture Overview

The Events module consists of several components:

```
┌─────────────────────────────────────────────────────────┐
│                    Your Application                      │
│  ┌──────────────┐         ┌──────────────┐             │
│  │   Services   │────────▶│  Event Bus   │             │
│  └──────────────┘  emit   └──────┬───────┘             │
│                                   │                      │
│                                   │ dispatch             │
│                                   ▼                      │
│  ┌──────────────────────────────────────────────────┐  │
│  │           Event Handlers                          │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐       │  │
│  │  │ Handler1 │  │ Handler2 │  │ Handler3 │       │  │
│  │  └──────────┘  └──────────┘  └──────────┘       │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │         Dead Letter Queue (Failed Events)         │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

For buffered processing, worker threads handle events off the main thread:

```
┌─────────────────────────────────────────────────────────┐
│                    Main Thread                           │
│  ┌──────────────┐         ┌──────────────┐             │
│  │   Services   │────────▶│ Shared Buffer│             │
│  └──────────────┘  enqueue└──────┬───────┘             │
└────────────────────────────────────┼─────────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
         ┌──────────▼─────┐  ┌──────▼──────┐  ┌─────▼──────┐
         │   Worker 1     │  │  Worker 2   │  │  Worker 3  │
         │  ┌──────────┐  │  │ ┌──────────┐│  │┌──────────┐│
         │  │ Handlers │  │  │ │ Handlers ││  ││ Handlers ││
         │  └──────────┘  │  │ └──────────┘│  │└──────────┘│
         └────────────────┘  └─────────────┘  └────────────┘
```

## Core Concepts

### Events

Events are plain objects that implement the `IEvent` interface:

```typescript
interface IEvent {
  readonly type: string; // Unique event identifier
  payload: any; // Event data
  correlationId?: string; // For tracing event chains
}
```

### Event Handlers

Event handlers are classes decorated with `@EventListener()` that contain methods decorated with `@OnEvent()`:

```typescript
@EventListener()
export class MyHandler {
  @OnEvent("my.event")
  async handleEvent(event: MyEvent) {
    // Process event
  }
}
```

### Event Bus

The Event Bus is the central dispatcher that:

1. Receives events from publishers
2. Routes events to registered handlers
3. Manages retries on failure
4. Tracks failed events in a dead letter queue

## Error Handling

The Events module includes built-in error handling:

- **Automatic Retries**: Failed handlers are retried up to 3 times (configurable)
- **Exponential Backoff**: Retry delays increase with each attempt
- **Dead Letter Queue**: Permanently failed events are stored for inspection
- **Correlation Tracking**: Events include correlation IDs for debugging

## Next Steps

- [Event Bus](./event-bus) - Learn about the standard event bus
- [Event Handlers](./event-handlers) - Create and register event handlers
- [Buffered Events](./buffered-events) - High-performance event processing

## Common Use Cases

### User Registration Flow

```typescript
// Emit one event, trigger multiple handlers
this.eventBus.emit(new UserRegisteredEvent({ userId, email }));

// Handlers run independently:
// - Send welcome email
// - Create user profile
// - Track analytics
// - Notify admin
```

### Order Processing Pipeline

```typescript
// Chain events for complex workflows
@OnEvent('order.placed')
async handleOrderPlaced(event: OrderPlacedEvent) {
  await this.processPayment(event.payload.orderId);
  this.eventBus.emit(new PaymentProcessedEvent({ orderId }));
}

@OnEvent('payment.processed')
async handlePaymentProcessed(event: PaymentProcessedEvent) {
  await this.updateInventory(event.payload.orderId);
  this.eventBus.emit(new InventoryUpdatedEvent({ orderId }));
}
```

### Background Tasks

```typescript
// Offload time-consuming tasks
@OnEvent('report.requested')
async generateReport(event: ReportRequestedEvent) {
  // This runs asynchronously, doesn't block the request
  const report = await this.generateLargeReport(event.payload);
  await this.emailReport(report, event.payload.email);
}
```

## Best Practices

1. **Keep Events Immutable**: Use `readonly` properties
2. **Use Descriptive Names**: Event types should be clear (e.g., `user.created`, not `uc`)
3. **Include Relevant Data**: Events should contain all data handlers need
4. **Handle Errors Gracefully**: Don't let one handler failure affect others
5. **Monitor Dead Letter Queue**: Regularly check for failed events
6. **Use Correlation IDs**: Track event chains for debugging
7. **Consider Event Size**: Keep payloads small for buffered processing

## Performance Considerations

- Standard Event Bus: ~10,000 events/sec on single core
- Buffered Event Bus: ~50,000+ events/sec with 5 workers
- Event serialization overhead: ~0.1ms per event
- Worker thread startup: ~50ms one-time cost
- Memory usage: ~50MB for buffered processing

:::tip
Start with the standard Event Bus for simplicity. Migrate to buffered processing when you need higher throughput or want to prevent event processing from blocking your web requests.
:::
