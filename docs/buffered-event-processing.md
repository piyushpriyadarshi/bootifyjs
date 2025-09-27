# Buffered Event Processing

The BootifyJS framework now includes a high-performance buffered event processing system that enables asynchronous, multi-threaded event handling with advanced features like priority queues, retry mechanisms, and health monitoring.

## Overview

The buffered event processing system extends the existing synchronous event system by providing:

- **Asynchronous Processing**: Events are processed in worker threads, preventing main thread blocking
- **Priority Queues**: Events can be prioritized (critical, normal, low) for optimal processing order
- **Shared Memory**: Zero-copy event passing using SharedArrayBuffer for maximum performance
- **Retry Handling**: Automatic retry with exponential backoff and dead letter queue
- **Health Monitoring**: Real-time system health checks and metrics
- **Graceful Scaling**: Dynamic worker thread management based on load

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Application   │───▶│ BufferedEventBus │───▶│ SharedEventBuffer│
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │ Worker Threads  │◀───│ Event Processor │
                       └─────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │ Event Handlers  │    │ Health Monitor  │
                       └─────────────────┘    └─────────────────┘
```

## Quick Start

### 1. Enable Buffered Processing

```typescript
import { bootstrapEventSystem } from './events/bootstrap';
import { defaultBufferedEventConfig } from './events/config/buffered-event-config';

// Bootstrap with buffered processing enabled
const eventSystem = bootstrapEventSystem([], {
  useBufferedProcessing: true,
  bufferedEventConfig: {
    ...defaultBufferedEventConfig,
    enabled: true,
    workerCount: 4,
    maxQueueSize: 10000
  }
});
```

### 2. Create Events

```typescript
import { IEvent } from './events/event.types';

export class UserRegisteredEvent implements IEvent {
  readonly type = 'user.registered';
  
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly timestamp: number = Date.now(),
    public correlationId?: string
  ) {}
  
  get payload() {
    return {
      userId: this.userId,
      email: this.email,
      timestamp: this.timestamp
    };
  }
}
```

### 3. Create Event Handlers

```typescript
import { EventListener, OnEvent } from './events/decorators';

@EventListener()
export class UserEventHandler {
  @OnEvent('user.registered')
  async handleUserRegistered(event: UserRegisteredEvent) {
    console.log(`Processing user registration for ${event.email}`);
    
    // Your business logic here
    await this.sendWelcomeEmail(event.email);
    await this.createUserProfile(event.userId);
    
    console.log(`User ${event.userId} processed successfully`);
  }
  
  private async sendWelcomeEmail(email: string) {
    // Email sending logic
  }
  
  private async createUserProfile(userId: string) {
    // Profile creation logic
  }
}
```

### 4. Emit Events

```typescript
import { Service, Autowired } from './core/decorators';
import { BufferedEventBusService } from './events';

@Service()
export class UserService {
  constructor(
    @Autowired() private readonly bufferedEventBus: BufferedEventBusService
  ) {}
  
  async registerUser(userData: any) {
    // Create user in database
    const user = await this.createUser(userData);
    
    // Emit event for asynchronous processing
    await this.bufferedEventBus.emitEvent(
      'user.registered',
      { userId: user.id, email: user.email },
      { priority: 'normal' }
    );
    
    return user;
  }
}
```

## Configuration

### Basic Configuration

```typescript
import { BufferedEventConfig } from './events/config/buffered-event-config';

const config: BufferedEventConfig = {
  enabled: true,
  workerCount: 4,                    // Number of worker threads
  maxQueueSize: 10000,              // Maximum events in queue
  maxMemoryMB: 50,                  // Memory limit in MB
  maxEventSize: 5120,               // Max event size in bytes
  retryAttempts: 3,                 // Retry attempts before DLQ
  retryDelays: [1000, 2000, 4000],  // Retry delays (ms)
  fallbackToSync: true,             // Fallback if workers fail
  
  // Priority weights
  priorities: {
    critical: 3,
    normal: 2,
    low: 1
  },
  
  // Monitoring
  monitoring: {
    enabled: true,
    metricsInterval: 1000,
    healthMonitoring: true,
    healthCheckInterval: 5000
  }
};
```

### Advanced Configuration

```typescript
const advancedConfig: BufferedEventConfig = {
  ...config,
  
  // Memory limits
  memoryLimits: {
    maxQueueSize: 10000,
    maxEventSize: 5120,
    totalMemoryMB: 50,
    workerHeapMB: 100
  },
  
  // Performance limits
  performanceLimits: {
    maxInputRate: 1000,           // Events per second
    targetProcessingRate: 500,    // Target processing rate
    maxMainThreadImpact: 5,       // Max main thread CPU %
    maxQueueLatency: 100          // Max queue latency (ms)
  },
  
  // Reliability limits
  reliabilityLimits: {
    maxRetryAttempts: 3,
    workerRestartDelay: 1000,
    healthCheckInterval: 5000,
    gracefulShutdownTimeout: 10000
  }
};
```

## Event Priorities

Events can be assigned priorities to control processing order:

```typescript
// Critical priority - processed first
await bufferedEventBus.emitEvent(
  'system.alert',
  { message: 'Critical system error' },
  { priority: 'critical' }
);

// Normal priority - default
await bufferedEventBus.emitEvent(
  'user.action',
  { userId: '123', action: 'login' },
  { priority: 'normal' }
);

// Low priority - processed last
await bufferedEventBus.emitEvent(
  'analytics.track',
  { event: 'page_view', page: '/dashboard' },
  { priority: 'low' }
);
```

## Monitoring and Metrics

### Getting System Metrics

```typescript
const metrics = bufferedEventBus.getMetrics();

console.log('Queue Metrics:', {
  size: metrics.queueMetrics.size,
  utilization: metrics.queueMetrics.utilization,
  totalProcessed: metrics.queueMetrics.totalProcessed,
  averageProcessingTime: metrics.queueMetrics.averageProcessingTime
});

console.log('Retry Stats:', {
  totalRetries: metrics.retryStats.totalRetries,
  deadLetterQueueSize: metrics.retryStats.deadLetterQueueSize,
  successRate: metrics.retryStats.successRate
});
```

### Health Monitoring

```typescript
const health = await bufferedEventBus.getHealthStatus();

console.log('System Health:', {
  status: health.status,           // 'healthy', 'degraded', 'unhealthy'
  activeWorkers: health.activeWorkers,
  queueDepth: health.queueDepth,
  processingRate: health.processingRate,
  alerts: health.alerts
});
```

### Worker Statistics

```typescript
const workerStats = bufferedEventBus.getWorkerStatistics();

console.log('Worker Stats:', {
  totalWorkers: workerStats.totalWorkers,
  activeWorkers: workerStats.activeWorkers,
  idleWorkers: workerStats.idleWorkers,
  averageProcessingTime: workerStats.averageProcessingTime,
  totalEventsProcessed: workerStats.totalEventsProcessed
});
```

## Error Handling and Retry Logic

### Automatic Retries

The system automatically retries failed events with exponential backoff:

```typescript
// Configure retry behavior
const config = {
  retryAttempts: 3,
  retryDelays: [1000, 2000, 4000], // 1s, 2s, 4s delays
};

// Events that fail will be retried automatically
// After all retries are exhausted, events move to Dead Letter Queue
```

### Dead Letter Queue

```typescript
// Access dead letter queue for manual inspection
const dlq = bufferedEventBus.getDeadLetterQueue();

console.log('Failed Events:', dlq.map(entry => ({
  event: entry.event,
  attempts: entry.attempts,
  lastError: entry.lastError,
  timestamp: entry.timestamp
})));
```

### Custom Error Handling

```typescript
@EventListener()
export class RobustEventHandler {
  @OnEvent('user.process')
  async handleUserProcess(event: UserProcessEvent) {
    try {
      await this.processUser(event.payload);
    } catch (error) {
      // Log error for monitoring
      console.error('User processing failed:', error);
      
      // The retry system will automatically handle retries
      // You can also emit a compensation event if needed
      throw error; // Re-throw to trigger retry
    }
  }
}
```

## Performance Optimization

### Worker Scaling

```typescript
// Dynamically adjust worker count based on load
const currentLoad = bufferedEventBus.getMetrics().queueMetrics.utilization;

if (currentLoad > 0.8) {
  // Scale up workers
  await bufferedEventBus.scaleWorkers(8);
} else if (currentLoad < 0.2) {
  // Scale down workers
  await bufferedEventBus.scaleWorkers(2);
}
```

### Memory Management

```typescript
// Monitor memory usage
const metrics = bufferedEventBus.getMetrics();
const memoryUsage = metrics.queueMetrics.memoryUsage;

if (memoryUsage > 0.9) {
  console.warn('High memory usage detected:', memoryUsage);
  // Consider scaling workers or adjusting queue size
}
```

## Best Practices

### 1. Event Design

- Keep events small and focused
- Use meaningful event types
- Include correlation IDs for tracing
- Make events serializable

```typescript
// Good: Small, focused event
export class OrderCreatedEvent implements IEvent {
  readonly type = 'order.created';
  
  constructor(
    public readonly orderId: string,
    public readonly customerId: string,
    public readonly amount: number,
    public correlationId?: string
  ) {}
  
  get payload() {
    return {
      orderId: this.orderId,
      customerId: this.customerId,
      amount: this.amount
    };
  }
}
```

### 2. Handler Design

- Keep handlers idempotent
- Handle errors gracefully
- Use appropriate timeouts
- Log important operations

```typescript
@EventListener()
export class OrderEventHandler {
  @OnEvent('order.created')
  async handleOrderCreated(event: OrderCreatedEvent) {
    const { orderId, customerId, amount } = event.payload;
    
    try {
      // Idempotent operation - safe to retry
      await this.inventoryService.reserveItems(orderId);
      await this.paymentService.processPayment(orderId, amount);
      await this.notificationService.sendConfirmation(customerId);
      
      console.log(`Order ${orderId} processed successfully`);
    } catch (error) {
      console.error(`Failed to process order ${orderId}:`, error);
      throw error; // Let retry system handle it
    }
  }
}
```

### 3. Configuration

- Start with conservative settings
- Monitor performance metrics
- Adjust based on actual load
- Use environment-specific configs

```typescript
// Development config
const devConfig = {
  workerCount: 2,
  maxQueueSize: 1000,
  monitoring: { enabled: true, metricsInterval: 5000 }
};

// Production config
const prodConfig = {
  workerCount: 8,
  maxQueueSize: 50000,
  monitoring: { enabled: true, metricsInterval: 1000 }
};
```

### 4. Monitoring

- Set up alerts for key metrics
- Monitor queue depth and processing rates
- Track error rates and retry patterns
- Use correlation IDs for tracing

## Troubleshooting

### Common Issues

#### High Queue Depth
```typescript
// Check if workers are overwhelmed
const metrics = bufferedEventBus.getMetrics();
if (metrics.queueMetrics.size > 5000) {
  console.warn('High queue depth detected');
  // Consider scaling workers or optimizing handlers
}
```

#### Worker Failures
```typescript
// Monitor worker health
const health = await bufferedEventBus.getHealthStatus();
if (health.status === 'unhealthy') {
  console.error('System unhealthy:', health.alerts);
  // Check logs and restart if necessary
}
```

#### Memory Issues
```typescript
// Monitor memory usage
const memoryUsage = bufferedEventBus.getMetrics().queueMetrics.memoryUsage;
if (memoryUsage > 0.9) {
  console.warn('High memory usage');
  // Reduce queue size or increase memory limits
}
```

## Migration from Synchronous Events

To migrate from the existing synchronous event system:

### 1. Update Bootstrap
```typescript
// Before
const eventSystem = bootstrapEventSystem([]);

// After
const eventSystem = bootstrapEventSystem([], {
  useBufferedProcessing: true,
  bufferedEventConfig: defaultBufferedEventConfig
});
```

### 2. Update Event Emission
```typescript
// Before (synchronous)
eventBus.emit(new UserRegisteredEvent(userId, email));

// After (asynchronous)
await bufferedEventBus.emitEvent(
  'user.registered',
  { userId, email },
  { priority: 'normal' }
);
```

### 3. Handlers Remain the Same
Existing event handlers work without modification:

```typescript
@EventListener()
export class UserEventHandler {
  @OnEvent('user.registered')
  async handleUserRegistered(event: UserRegisteredEvent) {
    // Same handler code works for both systems
  }
}
```

## Examples

See the complete examples in:
- `src/examples/events/buffered-event-example.ts` - Basic usage examples
- `src/examples/events/integration-test.ts` - Integration and performance tests

Run the examples:
```bash
# Build the project
npm run build

# Run integration test
node dist/examples/events/integration-test.js
```

## API Reference

### BufferedEventBusService

#### Methods

- `emitEvent(type: string, payload: any, options?: EventOptions): Promise<string>`
- `registerHandler(eventType: string, handler: IEventHandler): void`
- `getMetrics(): EventSystemMetrics`
- `getHealthStatus(): Promise<HealthCheckResult>`
- `getWorkerStatistics(): WorkerStatistics`
- `scaleWorkers(count: number): Promise<void>`
- `initialize(): Promise<void>`
- `shutdown(): Promise<void>`

#### Types

```typescript
interface EventOptions {
  priority?: EventPriority;
  correlationId?: string;
}

type EventPriority = 'critical' | 'normal' | 'low';

interface EventSystemMetrics {
  queueMetrics: QueueMetrics;
  retryStats: RetryStats;
}

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  activeWorkers: number;
  queueDepth: number;
  processingRate: number;
  alerts: Alert[];
}
```

For more detailed API documentation, see the TypeScript definitions in the source code.