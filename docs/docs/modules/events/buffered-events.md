---
id: buffered-events
title: Buffered Events
sidebar_label: Buffered Events
description: High-performance event processing with worker threads in BootifyJS
keywords:
  [
    bootifyjs,
    buffered events,
    worker threads,
    high performance,
    async processing,
  ]
---

# Buffered Events

The Buffered Event Processing System provides high-performance, off-main-thread event processing using worker threads and shared memory buffers. It's designed for scenarios where event processing shouldn't block your web server's main thread.

## Why Buffered Events?

### The Problem

Traditional event processing happens synchronously on the main thread:

```typescript
// Standard event processing
@OnEvent('user.created')
async sendWelcomeEmail(event: UserCreatedEvent) {
  // This blocks the main thread for 2 seconds!
  await this.emailService.send(event.payload.email);
}
```

**Issues:**

- Web requests slow down during event processing
- High event volume can overwhelm the main thread
- CPU-intensive handlers block I/O operations
- One slow handler affects all requests

### The Solution

Buffered events process in worker threads:

```
Main Thread (Web Server)          Worker Threads
┌─────────────────────┐          ┌──────────────┐
│  HTTP Requests      │          │   Worker 1   │
│  ↓                  │          │  ┌────────┐  │
│  Emit Event ────────┼─────────▶│  │Handler │  │
│  ↓                  │  Shared  │  └────────┘  │
│  Return Response    │  Buffer  ├──────────────┤
│  (Fast!)            │          │   Worker 2   │
└─────────────────────┘          │  ┌────────┐  │
                                 │  │Handler │  │
                                 │  └────────┘  │
                                 └──────────────┘
```

**Benefits:**

- Main thread stays responsive
- True parallel processing
- Handles high event volumes
- Fault isolation (worker crashes don't affect main app)

## Getting Started

### 1. Enable Buffered Processing

Configure buffered events in your application:

```typescript
import { BootifyApp } from "bootifyjs";
import { bootstrapEventSystem } from "bootifyjs/events";

const app = new BootifyApp({
  controllers: [
    /* ... */
  ],
  services: [
    /* ... */
  ],
  eventListeners: [
    /* ... */
  ],
});

await app.bootstrap();

// Enable buffered event processing
bootstrapEventSystem(app.getAllComponents(), {
  useBufferedProcessing: true,
  bufferedEventConfig: {
    enabled: true,
    workerCount: 5, // Number of worker threads
    maxQueueSize: 10000, // Max events in buffer
    maxEventSize: 5120, // 5KB per event
    maxMemoryMB: 50, // Total memory allocation
  },
});
```

### 2. Use Environment Variables

Configure via environment variables:

```bash
# .env file
BUFFERED_EVENTS_ENABLED=true
BUFFERED_EVENTS_WORKER_COUNT=5
BUFFERED_EVENTS_MAX_QUEUE_SIZE=10000
BUFFERED_EVENTS_MAX_EVENT_SIZE=5120
BUFFERED_EVENTS_MAX_MEMORY_MB=50
```

```typescript
// Automatically loads from environment
bootstrapEventSystem(app.getAllComponents(), {
  useBufferedProcessing: true,
});
```

### 3. Emit Events with Priority

Events can have priority levels:

```typescript
import { BufferedEventBusService, EventPriority } from "bootifyjs/events";

@Service()
export class OrderService {
  constructor(@Autowired() private bufferedEventBus: BufferedEventBusService) {}

  async placeOrder(order: Order) {
    // Critical events process first
    await this.bufferedEventBus.emitEvent(
      "payment.required",
      { orderId: order.id, amount: order.total },
      { priority: "critical" }
    );

    // Normal priority (default)
    await this.bufferedEventBus.emitEvent("order.placed", {
      orderId: order.id,
    });

    // Low priority for non-critical tasks
    await this.bufferedEventBus.emitEvent(
      "analytics.track",
      { event: "order_placed", orderId: order.id },
      { priority: "low" }
    );
  }
}
```

## Priority-Based Processing

### Priority Levels

Buffered events support three priority levels:

| Priority   | Use Case                  | Processing Order |
| ---------- | ------------------------- | ---------------- |
| `critical` | Payments, security alerts | Processed first  |
| `normal`   | Standard business events  | Default priority |
| `low`      | Analytics, logging        | Processed last   |

### Example Usage

```typescript
@Service()
export class NotificationService {
  constructor(@Autowired() private bufferedEventBus: BufferedEventBusService) {}

  async sendNotifications(userId: string, type: string) {
    switch (type) {
      case "security_alert":
        // Critical: Process immediately
        await this.bufferedEventBus.emitEvent(
          "notification.send",
          { userId, type, message: "Security alert!" },
          { priority: "critical" }
        );
        break;

      case "order_update":
        // Normal: Standard processing
        await this.bufferedEventBus.emitEvent(
          "notification.send",
          { userId, type, message: "Order updated" }
          // priority: 'normal' is default
        );
        break;

      case "newsletter":
        // Low: Can wait
        await this.bufferedEventBus.emitEvent(
          "notification.send",
          { userId, type, message: "Weekly newsletter" },
          { priority: "low" }
        );
        break;
    }
  }
}
```

## Configuration Options

### Complete Configuration

```typescript
interface BufferedEventConfig {
  // Core settings
  enabled: boolean; // Enable/disable buffered processing
  workerCount: number; // Number of worker threads (default: 5)

  // Memory settings
  maxQueueSize: number; // Max events in buffer (default: 10000)
  maxEventSize: number; // Max bytes per event (default: 5120)
  maxMemoryMB: number; // Total memory allocation (default: 50)

  // Retry settings
  maxRetries: number; // Retry attempts (default: 3)
  retryDelayMs: number; // Initial retry delay (default: 1000)
  retryBackoffMultiplier: number; // Backoff multiplier (default: 2)

  // Performance settings
  batchSize: number; // Events per batch (default: 10)
  processingIntervalMs: number; // Processing interval (default: 10)

  // Monitoring settings
  monitoring: {
    enabled: boolean; // Enable monitoring (default: true)
    metricsInterval: number; // Metrics collection interval (default: 5000)
    healthCheckInterval: number; // Health check interval (default: 10000)
    healthMonitoring: boolean; // Enable health monitoring (default: true)
  };

  // Fallback settings
  fallbackToSync: boolean; // Fallback to sync on failure (default: true)
}
```

### Recommended Configurations

#### Development

```typescript
{
  enabled: true,
  workerCount: 2,
  maxQueueSize: 1000,
  maxMemoryMB: 20,
  monitoring: {
    enabled: true,
    metricsInterval: 10000
  }
}
```

#### Production (Low Volume)

```typescript
{
  enabled: true,
  workerCount: 5,
  maxQueueSize: 10000,
  maxMemoryMB: 50,
  monitoring: {
    enabled: true,
    metricsInterval: 5000,
    healthMonitoring: true
  }
}
```

#### Production (High Volume)

```typescript
{
  enabled: true,
  workerCount: 10,
  maxQueueSize: 50000,
  maxMemoryMB: 200,
  maxRetries: 5,
  monitoring: {
    enabled: true,
    metricsInterval: 1000,
    healthMonitoring: true
  }
}
```

## Worker Thread Architecture

### How It Works

1. **Event Emission**: Main thread writes events to shared buffer
2. **Worker Pool**: Multiple workers read from the buffer
3. **Parallel Processing**: Workers process events concurrently
4. **Result Handling**: Success/failure tracked with metrics

```typescript
// Main Thread
┌─────────────────────────────────────┐
│  Application Code                   │
│  ↓                                  │
│  bufferedEventBus.emitEvent()      │
│  ↓                                  │
│  Write to Shared Buffer (< 1ms)    │
│  ↓                                  │
│  Return immediately                 │
└─────────────────────────────────────┘
         ↓ (Shared Memory)
┌─────────────────────────────────────┐
│  Shared Circular Buffer             │
│  [Event1][Event2][Event3]...        │
└─────────────────────────────────────┘
         ↓ (Read by workers)
┌──────────┐  ┌──────────┐  ┌──────────┐
│ Worker 1 │  │ Worker 2 │  │ Worker 3 │
│ Process  │  │ Process  │  │ Process  │
│ Event1   │  │ Event2   │  │ Event3   │
└──────────┘  └──────────┘  └──────────┘
```

### Worker Management

Workers are automatically managed:

- **Auto-restart**: Failed workers restart automatically
- **Health monitoring**: Unhealthy workers are replaced
- **Graceful shutdown**: Workers drain queue before stopping
- **Dynamic scaling**: Can scale worker count at runtime

```typescript
// Scale workers dynamically
await bufferedEventBus.scaleWorkers(10); // Increase to 10 workers

// Get worker statistics
const stats = bufferedEventBus.getWorkerStatistics();
console.log(`Active workers: ${stats.activeWorkers}`);
console.log(`Failed workers: ${stats.failedWorkers}`);
```

## Monitoring and Metrics

### Get Current Metrics

```typescript
const metrics = bufferedEventBus.getMetrics();

console.log("Queue Metrics:", {
  queueSize: metrics.queue.size,
  queueUtilization: metrics.queue.utilization,
  isFull: metrics.queue.isFull,
});

console.log("Processing Metrics:", {
  eventsProcessed: metrics.processing.totalProcessed,
  eventsDropped: metrics.processing.totalDropped,
  averageLatency: metrics.processing.averageLatency,
});

console.log("Worker Metrics:", {
  activeWorkers: metrics.workers.active,
  failedWorkers: metrics.workers.failed,
});
```

### Health Monitoring

```typescript
const health = await bufferedEventBus.getHealthStatus();

if (health.status === "healthy") {
  console.log("System is healthy");
} else {
  console.error("System is unhealthy:", health.issues);
}
```

### Real-time Metrics

Listen to metric events:

```typescript
bufferedEventBus.on("metrics", (metrics) => {
  console.log("Current queue size:", metrics.queue.size);
  console.log("Processing rate:", metrics.processing.rate);

  // Alert if queue is filling up
  if (metrics.queue.utilization > 0.8) {
    console.warn("Queue is 80% full!");
  }
});

bufferedEventBus.on("health_check", (health) => {
  if (health.status !== "healthy") {
    console.error("Health check failed:", health);
  }
});
```

## Error Handling and Retries

### Automatic Retries

Failed events are automatically retried with exponential backoff:

```typescript
// Configuration
{
  maxRetries: 3,                    // Try 3 times
  retryDelayMs: 1000,               // Start with 1 second
  retryBackoffMultiplier: 2         // Double each time
}

// Retry schedule:
// Attempt 1: Immediate
// Attempt 2: After 1 second
// Attempt 3: After 2 seconds
// Attempt 4: After 4 seconds
// Then: Move to Dead Letter Queue
```

### Dead Letter Queue

Events that fail all retries go to the DLQ:

```typescript
// Check dead letter queue
const failedEvents = bufferedEventBus.getDeadLetterQueue();

console.log(`${failedEvents.length} events failed permanently`);

// Retry a failed event
for (const event of failedEvents) {
  console.log("Retrying failed event:", event.type);
  await bufferedEventBus.emitEvent(event.type, event.payload);
}
```

### Fallback to Synchronous Processing

If buffered processing fails to initialize, it can fall back to synchronous processing:

```typescript
{
  fallbackToSync: true; // Enable fallback
}
```

This ensures your application continues working even if worker threads fail to start.

## Performance Characteristics

### Throughput

| Scenario    | Events/Second | Main Thread Impact |
| ----------- | ------------- | ------------------ |
| Light load  | 100           | < 1% CPU           |
| Medium load | 500           | < 3% CPU           |
| Heavy load  | 1,000         | < 5% CPU           |
| Maximum     | 5,000+        | < 10% CPU          |

### Latency

| Metric          | Target   | Notes                       |
| --------------- | -------- | --------------------------- |
| Enqueue latency | < 1ms    | Time to add event to buffer |
| Queue wait time | < 100ms  | Time event waits in buffer  |
| Processing time | Variable | Depends on handler          |
| End-to-end      | < 5s     | For non-critical events     |

### Memory Usage

- **Base overhead**: ~50MB (default configuration)
- **Per event**: ~5KB (configurable)
- **Worker threads**: ~10MB per worker
- **Total**: ~100-150MB for typical setup

## Best Practices

### 1. Choose the Right Priority

```typescript
// ✅ Good: Appropriate priorities
await bufferedEventBus.emitEvent("payment.process", data, {
  priority: "critical", // Money matters!
});

await bufferedEventBus.emitEvent("email.send", data, {
  priority: "normal", // Standard priority
});

await bufferedEventBus.emitEvent("analytics.track", data, {
  priority: "low", // Can wait
});

// ❌ Bad: Everything is critical
await bufferedEventBus.emitEvent("analytics.track", data, {
  priority: "critical", // Not actually critical!
});
```

### 2. Keep Events Small

```typescript
// ✅ Good: Small event payload
await bufferedEventBus.emitEvent("user.created", {
  userId: user.id,
  email: user.email,
});

// ❌ Bad: Large payload
await bufferedEventBus.emitEvent("user.created", {
  userId: user.id,
  email: user.email,
  fullProfile: user, // Too much data
  allOrders: user.orders, // Unnecessary
  preferences: user.preferences, // Can fetch later
});
```

### 3. Monitor Queue Health

```typescript
// Set up monitoring
setInterval(() => {
  const metrics = bufferedEventBus.getMetrics();

  if (metrics.queue.utilization > 0.9) {
    console.error("Queue is 90% full - consider scaling workers");
  }

  if (metrics.processing.totalDropped > 0) {
    console.error(`${metrics.processing.totalDropped} events dropped!`);
  }
}, 5000);
```

### 4. Handle Serialization

Events must be serializable (no functions, circular references):

```typescript
// ✅ Good: Serializable
await bufferedEventBus.emitEvent("order.placed", {
  orderId: "123",
  items: ["item1", "item2"],
  total: 99.99,
});

// ❌ Bad: Not serializable
await bufferedEventBus.emitEvent("order.placed", {
  orderId: "123",
  processOrder: () => {}, // Functions can't be serialized
  customer: circularRef, // Circular references fail
});
```

### 5. Graceful Shutdown

Always shut down gracefully:

```typescript
process.on("SIGTERM", async () => {
  console.log("Shutting down...");

  // Drain the queue and stop workers
  await bufferedEventBus.shutdown();

  process.exit(0);
});
```

## Migration from Standard Events

### Step 1: Enable Buffered Processing

```typescript
// Before
bootstrapEventSystem(components);

// After
bootstrapEventSystem(components, {
  useBufferedProcessing: true,
});
```

### Step 2: Update Event Emission (Optional)

```typescript
// Standard Event Bus (still works)
eventBus.emit(new UserCreatedEvent({ userId, email }));

// Buffered Event Bus (with priority)
await bufferedEventBus.emitEvent(
  "user.created",
  { userId, email },
  { priority: "normal" }
);
```

### Step 3: Monitor and Tune

```typescript
// Add monitoring
bufferedEventBus.on("metrics", (metrics) => {
  // Log or send to monitoring service
  console.log("Queue size:", metrics.queue.size);
});
```

## Troubleshooting

### Queue Filling Up

**Symptom**: Queue utilization > 80%

**Solutions**:

1. Increase worker count
2. Optimize slow handlers
3. Increase queue size
4. Add more priority levels

```typescript
// Scale up workers
await bufferedEventBus.scaleWorkers(10);
```

### Events Being Dropped

**Symptom**: `totalDropped` > 0 in metrics

**Solutions**:

1. Increase `maxQueueSize`
2. Add more workers
3. Reduce event emission rate
4. Enable `fallbackToSync`

### High Memory Usage

**Symptom**: Memory usage growing

**Solutions**:

1. Reduce `maxQueueSize`
2. Reduce `maxEventSize`
3. Reduce `workerCount`
4. Check for memory leaks in handlers

### Workers Crashing

**Symptom**: `failedWorkers` > 0 in metrics

**Solutions**:

1. Check handler code for errors
2. Review worker logs
3. Ensure events are serializable
4. Check memory limits

## Advanced Topics

### Custom Worker Configuration

```typescript
{
  workerCount: 5,
  workerOptions: {
    resourceLimits: {
      maxOldGenerationSizeMb: 100,
      maxYoungGenerationSizeMb: 50
    }
  }
}
```

### Event Batching

Process multiple events at once:

```typescript
{
  batchSize: 10,              // Process 10 events per batch
  processingIntervalMs: 10    // Check for new events every 10ms
}
```

### Custom Retry Strategies

```typescript
{
  maxRetries: 5,
  retryDelayMs: 500,
  retryBackoffMultiplier: 1.5,  // Gentler backoff
  retryJitter: true             // Add randomness to prevent thundering herd
}
```

## Next Steps

- [Event Bus](./event-bus) - Standard event processing
- [Event Handlers](./event-handlers) - Creating event handlers

## Performance Benchmarks

Real-world performance data:

```
Test: 10,000 events with 100ms handler execution time

Standard Event Bus:
- Total time: 1000 seconds (sequential)
- Main thread blocked: 100%
- Requests affected: All

Buffered Event Bus (5 workers):
- Total time: 200 seconds (parallel)
- Main thread blocked: < 5%
- Requests affected: None
- 5x faster processing
```

:::tip
Start with standard events for simplicity. Migrate to buffered events when you experience:

- Request latency during event processing
- High event volumes (> 100/sec)
- Long-running event handlers (> 100ms)
- Need for priority-based processing
  :::
