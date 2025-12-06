---
id: events-api
title: Events API Reference
sidebar_label: Events API
description: Complete reference for BootifyJS event system classes and methods
keywords: [bootifyjs, events, api, reference, event-bus]
---

# Events API Reference

This page documents the event system classes and methods for building event-driven applications with BootifyJS.

## Core Event System

### EventBusService

The standard event bus for synchronous and asynchronous event handling with retry logic.

#### Constructor

```typescript
constructor();
```

Creates a new EventBusService instance with default configuration.

**Example:**

```typescript
import { EventBusService } from "bootifyjs";

const eventBus = new EventBusService();
```

---

#### Methods

##### subscribe()

Subscribes an event handler to a specific event type.

**Signature:**

```typescript
subscribe<T extends IEvent>(eventType: string, handler: IEventHandler<T>): void
```

**Parameters:**

- `eventType`: Unique string identifier for the event
- `handler`: Event handler instance implementing `IEventHandler`

**Example:**

```typescript
import { EventBusService, IEventHandler, IEvent } from "bootifyjs";

class UserCreatedHandler implements IEventHandler {
  async handle(event: IEvent) {
    console.log("User created:", event.payload);
  }
}

const eventBus = new EventBusService();
eventBus.subscribe("user.created", new UserCreatedHandler());
```

---

##### emit()

Emits an event to all registered listeners.

**Signature:**

```typescript
emit(event: IEvent): void
```

**Parameters:**

- `event`: Event object to emit

**Example:**

```typescript
import { EventBusService } from "bootifyjs";

const eventBus = new EventBusService();

eventBus.emit({
  type: "user.created",
  payload: {
    userId: "123",
    email: "user@example.com",
  },
});
```

---

##### getDeadLetterQueue()

Retrieves all events that failed after all retry attempts.

**Signature:**

```typescript
getDeadLetterQueue(): IEvent[]
```

**Returns:**

- Array of failed events

**Example:**

```typescript
const failedEvents = eventBus.getDeadLetterQueue();
console.log(`${failedEvents.length} events failed processing`);

// Process failed events
for (const event of failedEvents) {
  console.log("Failed event:", event.type, event.payload);
}
```

---

## Buffered Event System

### BufferedEventBusService

High-performance event bus with worker thread processing, buffering, and advanced monitoring.

#### Constructor

```typescript
constructor(options?: BufferedEventBusOptions)
```

**Parameters:**

- `options` (optional): Configuration options
  - `config`: Partial buffered event configuration
  - `fallbackToSync`: Whether to fall back to synchronous processing on errors
  - `enableMetrics`: Enable metrics collection
  - `enableHealthMonitoring`: Enable health monitoring

**Example:**

```typescript
import { BufferedEventBusService } from "bootifyjs";

const bufferedEventBus = new BufferedEventBusService({
  config: {
    workerCount: 4,
    maxQueueSize: 10000,
    maxMemoryMB: 512,
  },
  fallbackToSync: true,
  enableMetrics: true,
  enableHealthMonitoring: true,
});
```

---

#### Methods

##### initialize()

Initializes the buffered event bus and worker pool.

**Signature:**

```typescript
async initialize(): Promise<void>
```

**Example:**

```typescript
const bufferedEventBus = new BufferedEventBusService();
await bufferedEventBus.initialize();
```

---

##### registerHandler()

Registers an event handler for a specific event type.

**Signature:**

```typescript
registerHandler(eventType: string, handler: IEventHandler): void
```

**Parameters:**

- `eventType`: Unique string identifier for the event
- `handler`: Event handler instance

**Example:**

```typescript
import { IEventHandler, IEvent } from "bootifyjs";

class OrderProcessedHandler implements IEventHandler {
  async handle(event: IEvent) {
    console.log("Processing order:", event.payload);
  }
}

bufferedEventBus.registerHandler(
  "order.processed",
  new OrderProcessedHandler()
);
```

---

##### emitEvent()

Emits an event for buffered processing.

**Signature:**

```typescript
async emitEvent(
  eventType: string,
  data: any,
  options?: {
    priority?: EventPriority;
    timeout?: number;
    retryable?: boolean;
  }
): Promise<EventProcessingResult>
```

**Parameters:**

- `eventType`: Event type identifier
- `data`: Event payload
- `options` (optional): Event options
  - `priority`: `'critical'` | `'normal'` | `'low'` - Event priority
  - `timeout`: Processing timeout in milliseconds
  - `retryable`: Whether the event can be retried on failure

**Returns:**

- `EventProcessingResult` object with processing status

**Example:**

```typescript
const result = await bufferedEventBus.emitEvent(
  "order.created",
  {
    orderId: "123",
    userId: "456",
    total: 99.99,
  },
  {
    priority: "critical",
    timeout: 5000,
    retryable: true,
  }
);

if (result.success) {
  console.log("Event queued successfully:", result.eventId);
} else {
  console.error("Event failed:", result.error);
}
```

---

##### getMetrics()

Returns current event processing metrics.

**Signature:**

```typescript
getMetrics(): any
```

**Returns:**

- Metrics object containing queue size, processing stats, and retry information

**Example:**

```typescript
const metrics = bufferedEventBus.getMetrics();
console.log("Queue size:", metrics.queueSize);
console.log("Events processed:", metrics.eventsProcessed);
console.log("Average processing time:", metrics.averageProcessingTime);
```

---

##### getHealthStatus()

Returns the health status of the event system.

**Signature:**

```typescript
async getHealthStatus(): Promise<any>
```

**Returns:**

- Health status object

**Example:**

```typescript
const health = await bufferedEventBus.getHealthStatus();
console.log("Status:", health.status); // 'healthy', 'degraded', or 'unhealthy'
console.log("Issues:", health.issues);
```

---

##### getWorkerStatistics()

Returns statistics about worker threads.

**Signature:**

```typescript
getWorkerStatistics(): any
```

**Returns:**

- Worker statistics object

**Example:**

```typescript
const stats = bufferedEventBus.getWorkerStatistics();
console.log("Active workers:", stats.activeWorkers);
console.log("Idle workers:", stats.idleWorkers);
console.log("Worker statuses:", stats.workerStatuses);
```

---

##### scaleWorkers()

Dynamically scales the worker pool.

**Signature:**

```typescript
async scaleWorkers(targetCount: number): Promise<void>
```

**Parameters:**

- `targetCount`: Target number of workers

**Example:**

```typescript
// Scale up during high load
await bufferedEventBus.scaleWorkers(8);

// Scale down during low load
await bufferedEventBus.scaleWorkers(2);
```

---

##### shutdown()

Gracefully shuts down the buffered event bus.

**Signature:**

```typescript
async shutdown(): Promise<void>
```

**Example:**

```typescript
// Graceful shutdown
await bufferedEventBus.shutdown();
console.log("Event bus shut down successfully");
```

---

##### isReady()

Checks if the service is initialized and ready.

**Signature:**

```typescript
isReady(): boolean
```

**Returns:**

- `true` if ready, `false` otherwise

**Example:**

```typescript
if (bufferedEventBus.isReady()) {
  await bufferedEventBus.emitEvent("test.event", { data: "test" });
}
```

---

## Interfaces

### IEvent

Base interface for all events.

**Definition:**

```typescript
interface IEvent {
  readonly type: string;
  payload: any;
  correlationId?: string;
}
```

**Properties:**

- `type`: Unique event type identifier
- `payload`: Event data
- `correlationId`: Optional correlation ID for tracing

**Example:**

```typescript
import { IEvent } from "bootifyjs";

const userCreatedEvent: IEvent = {
  type: "user.created",
  payload: {
    userId: "123",
    email: "user@example.com",
    createdAt: new Date(),
  },
  correlationId: "req-456",
};
```

---

### IEventHandler

Interface for event handlers.

**Definition:**

```typescript
interface IEventHandler<T extends IEvent = IEvent> {
  handle(event: T): Promise<void> | void;
}
```

**Methods:**

- `handle`: Processes the event

**Example:**

```typescript
import { IEventHandler, IEvent } from "bootifyjs";

class EmailNotificationHandler implements IEventHandler {
  async handle(event: IEvent) {
    const { email, subject, body } = event.payload;
    await this.emailService.send(email, subject, body);
  }
}
```

---

### PriorityEvent

Extended event interface with priority and retry information.

**Definition:**

```typescript
interface PriorityEvent extends IEvent {
  priority: EventPriority;
  timestamp: number;
  retryCount: number;
}
```

**Properties:**

- `priority`: Event priority level
- `timestamp`: Event creation timestamp
- `retryCount`: Number of retry attempts

**Example:**

```typescript
import { PriorityEvent } from "bootifyjs";

const criticalEvent: PriorityEvent = {
  type: "payment.failed",
  payload: { orderId: "123", amount: 99.99 },
  priority: "critical",
  timestamp: Date.now(),
  retryCount: 0,
  correlationId: "req-789",
};
```

---

### EventProcessingResult

Result of event processing.

**Definition:**

```typescript
interface EventProcessingResult {
  success: boolean;
  eventId: string;
  processingTime?: number;
  error?: string;
  retryCount?: number;
}
```

**Properties:**

- `success`: Whether processing succeeded
- `eventId`: Unique event identifier
- `processingTime`: Processing duration in milliseconds
- `error`: Error message if failed
- `retryCount`: Number of retry attempts

**Example:**

```typescript
const result = await bufferedEventBus.emitEvent("order.created", orderData);

if (result.success) {
  console.log(
    `Event ${result.eventId} processed in ${result.processingTime}ms`
  );
} else {
  console.error(`Event failed: ${result.error}`);
}
```

---

## Types

### EventPriority

Event priority levels.

**Definition:**

```typescript
type EventPriority = "critical" | "normal" | "low";
```

**Usage:**

- `critical`: High-priority events processed first
- `normal`: Standard priority events
- `low`: Low-priority events processed last

**Example:**

```typescript
import { EventPriority } from "bootifyjs";

const priority: EventPriority = "critical";

await bufferedEventBus.emitEvent("payment.processing", data, {
  priority: priority,
});
```

---

### BufferedEventConfig

Configuration for buffered event processing.

**Definition:**

```typescript
interface BufferedEventConfig {
  enabled: boolean;
  workerCount: number;
  maxQueueSize: number;
  maxEventSize: number;
  maxMemoryMB: number;
  fallbackToSync: boolean;
  monitoring: {
    enabled: boolean;
    metricsInterval: number;
    healthCheckInterval: number;
    healthMonitoring: boolean;
  };
  retry: {
    maxRetries: number;
    retryDelayMs: number;
    backoffMultiplier: number;
    maxRetryDelayMs: number;
  };
}
```

**Example:**

```typescript
import { BufferedEventConfig } from "bootifyjs";

const config: Partial<BufferedEventConfig> = {
  workerCount: 4,
  maxQueueSize: 10000,
  maxMemoryMB: 512,
  monitoring: {
    enabled: true,
    metricsInterval: 5000,
    healthCheckInterval: 10000,
    healthMonitoring: true,
  },
  retry: {
    maxRetries: 3,
    retryDelayMs: 1000,
    backoffMultiplier: 2,
    maxRetryDelayMs: 30000,
  },
};
```

---

## Usage Examples

### Basic Event Handling

```typescript
import { EventBusService, EventListener, OnEvent, IEvent } from "bootifyjs";

@EventListener()
export class UserEventHandler {
  @OnEvent("user.created")
  async handleUserCreated(event: IEvent) {
    const { userId, email } = event.payload;
    console.log(`New user created: ${email}`);

    // Send welcome email
    await this.emailService.sendWelcome(email);
  }

  @OnEvent("user.deleted")
  async handleUserDeleted(event: IEvent) {
    const { userId } = event.payload;
    console.log(`User deleted: ${userId}`);

    // Clean up user data
    await this.cleanupService.removeUserData(userId);
  }
}
```

### High-Performance Event Processing

```typescript
import { BufferedEventBusService, Service } from "bootifyjs";

@Service()
export class OrderService {
  constructor(private eventBus: BufferedEventBusService) {}

  async createOrder(orderData: any) {
    const order = await this.orderRepo.save(orderData);

    // Emit high-priority event
    await this.eventBus.emitEvent(
      "order.created",
      {
        orderId: order.id,
        userId: order.userId,
        total: order.total,
        items: order.items,
      },
      {
        priority: "critical",
        retryable: true,
      }
    );

    return order;
  }
}
```

### Event Monitoring

```typescript
import { BufferedEventBusService } from "bootifyjs";

// Monitor event processing
setInterval(async () => {
  const metrics = bufferedEventBus.getMetrics();
  const health = await bufferedEventBus.getHealthStatus();

  console.log("Event System Metrics:", {
    queueSize: metrics.queueSize,
    eventsProcessed: metrics.eventsProcessed,
    failedEvents: metrics.failedEvents,
    healthStatus: health.status,
  });

  // Auto-scale based on queue size
  if (metrics.queueSize > 5000) {
    await bufferedEventBus.scaleWorkers(8);
  } else if (metrics.queueSize < 1000) {
    await bufferedEventBus.scaleWorkers(2);
  }
}, 10000);
```

### Dead Letter Queue Processing

```typescript
import { EventBusService } from "bootifyjs";

// Periodically process failed events
setInterval(() => {
  const failedEvents = eventBus.getDeadLetterQueue();

  for (const event of failedEvents) {
    console.error("Failed event:", {
      type: event.type,
      payload: event.payload,
      correlationId: event.correlationId,
    });

    // Log to monitoring system
    logger.error("Event processing failed", {
      eventType: event.type,
      correlationId: event.correlationId,
    });
  }
}, 60000);
```

---

## Best Practices

### Event Naming

Use a hierarchical naming convention:

```typescript
// Good
"user.created";
"user.updated";
"user.deleted";
"order.created";
"order.payment.completed";
"order.payment.failed";

// Avoid
"createUser";
"UserCreated";
"user_created";
```

### Event Payload

Keep event payloads focused and immutable:

```typescript
// Good
const event: IEvent = {
  type: "order.created",
  payload: {
    orderId: "123",
    userId: "456",
    total: 99.99,
    createdAt: new Date().toISOString(),
  },
};

// Avoid large or mutable payloads
const badEvent: IEvent = {
  type: "order.created",
  payload: entireOrderObjectWithAllRelations, // Too large
};
```

### Error Handling

Always handle errors in event handlers:

```typescript
@EventListener()
export class OrderEventHandler {
  @OnEvent("order.created")
  async handleOrderCreated(event: IEvent) {
    try {
      await this.processOrder(event.payload);
    } catch (error) {
      logger.error("Failed to process order", error, {
        eventType: event.type,
        orderId: event.payload.orderId,
      });
      // Don't throw - let retry logic handle it
    }
  }
}
```

### Priority Usage

Use priorities appropriately:

```typescript
// Critical: Payment processing, security events
await eventBus.emitEvent("payment.processing", data, {
  priority: "critical",
});

// Normal: User actions, notifications
await eventBus.emitEvent("user.updated", data, {
  priority: "normal",
});

// Low: Analytics, logging
await eventBus.emitEvent("analytics.pageview", data, {
  priority: "low",
});
```

---

## See Also

- [Events Module Overview](../modules/events/overview.md)
- [Event Bus Guide](../modules/events/event-bus.md)
- [Buffered Events Guide](../modules/events/buffered-events.md)
- [Event Handlers Guide](../modules/events/handlers.md)
