# Buffered Event Processing - Technical Specification

## 🎯 Executive Summary

**Feature**: Off-main-thread buffered event processing system for BootifyJS framework
**Goal**: Prevent Node.js main event loop bottlenecks during high-throughput event processing
**Architecture**: Worker thread-based processing similar to Pino logging architecture

## ✅ Approved Technical Decisions

### 1. **Concurrency Strategy: Option A - Fixed Worker Pool**
- **Decision**: Start with 5 fixed worker threads
- **Rationale**: Simpler to implement, predictable resource usage
- **Future**: Can evolve to dynamic scaling in Phase 2

### 2. **Queue Limits & Memory Management**
- **Max Queue Size**: 10,000 events (configurable)
- **Memory Limit**: ~50MB dedicated (assuming 5KB avg event size)
- **Overflow Strategy**: Drop oldest events (FIFO)
- **Priority Levels**: 3 levels (Critical, Normal, Low)

### 3. **Retry Strategy**
- **Max Retries**: 3 attempts
- **Backoff**: Simple exponential (1s → 2s → 4s)
- **DLQ**: Failed events after max retries

### 4. **Success Metrics**
- Queue depth monitoring
- Processing throughput (events/sec)
- Worker thread health status
- Main thread impact measurement

## 🏗️ Architecture Design

### **Core Components**

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Main Thread   │    │  Shared Memory   │    │ Worker Threads  │
│                 │    │                  │    │                 │
│ ┌─────────────┐ │    │ ┌──────────────┐ │    │ ┌─────────────┐ │
│ │EventBusProxy│ │───▶│ │ Event Queue  │ │───▶│ │EventProcessor│ │
│ └─────────────┘ │    │ │ (Circular)   │ │    │ │   Worker    │ │
│                 │    │ └──────────────┘ │    │ └─────────────┘ │
│ ┌─────────────┐ │    │ ┌──────────────┐ │    │ ┌─────────────┐ │
│ │   Metrics   │ │◀───│ │   Metrics    │ │◀───│ │   Metrics   │ │
│ │ Collector   │ │    │ │   Buffer     │ │    │ │  Reporter   │ │
│ └─────────────┘ │    │ └──────────────┘ │    │ └─────────────┘ │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### **Worker Thread Architecture**

1. **Main Thread**: 
   - Receives events via `BufferedEventBusService.emit()`
   - Writes to shared circular buffer
   - Non-blocking, minimal CPU impact

2. **Worker Threads**:
   - Read from shared buffer
   - Execute event handlers
   - Report metrics back
   - Handle retries and DLQ

3. **Shared Memory**:
   - Circular buffer for events
   - Atomic operations for thread safety
   - Metrics collection buffer

## 📋 Implementation Plan

### **Phase 1: Core Implementation (Week 1-2)**

#### **1.1 Shared Buffer Implementation**
```typescript
// src/events/shared-buffer.ts
export class SharedEventBuffer {
  private buffer: SharedArrayBuffer
  private writeIndex: Int32Array
  private readIndex: Int32Array
  private eventData: Uint8Array
  
  constructor(maxEvents: number = 10000) {
    // Initialize shared memory structures
  }
  
  enqueue(event: IEvent): boolean
  dequeue(): IEvent | null
  size(): number
  isFull(): boolean
}
```

#### **1.2 Worker Thread Event Processor**
```typescript
// src/events/worker/event-processor.worker.ts
import { parentPort, workerData } from 'worker_threads'
import { SharedEventBuffer } from '../shared-buffer'

class EventProcessorWorker {
  private buffer: SharedEventBuffer
  private handlers: Map<string, IEventHandler>
  private retryQueue: IEvent[]
  
  async processEvents(): Promise<void> {
    while (true) {
      const event = this.buffer.dequeue()
      if (event) {
        await this.handleEventWithRetry(event)
      } else {
        await this.sleep(10) // Prevent busy waiting
      }
    }
  }
}
```

#### **1.3 Buffered Event Bus Service**
```typescript
// src/events/buffered-event-bus.service.ts
@Service()
export class BufferedEventBusService {
  private workers: Worker[]
  private sharedBuffer: SharedEventBuffer
  private metrics: EventMetrics
  
  constructor() {
    this.initializeWorkers(5) // Fixed pool of 5 workers
    this.sharedBuffer = new SharedEventBuffer(10000)
  }
  
  emit(event: IEvent): boolean {
    // Non-blocking enqueue to shared buffer
    return this.sharedBuffer.enqueue(event)
  }
  
  private initializeWorkers(count: number): void {
    // Spawn worker threads
  }
}
```

### **Phase 2: Monitoring & Metrics (Week 3)**

#### **2.1 Metrics Collection**
```typescript
// src/events/metrics/event-metrics.ts
export interface EventMetrics {
  queueDepth: number
  processingRate: number // events/sec
  errorRate: number
  workerHealth: WorkerStatus[]
  mainThreadImpact: number // CPU usage
}

export class EventMetricsCollector {
  collectMetrics(): EventMetrics
  getQueueDepthByPriority(): Record<Priority, number>
  getProcessingLatency(): number
}
```

#### **2.2 Health Monitoring**
```typescript
// src/events/monitoring/health-monitor.ts
export class EventSystemHealthMonitor {
  checkWorkerHealth(): WorkerStatus[]
  detectBottlenecks(): BottleneckReport
  suggestOptimizations(): OptimizationHint[]
}
```

### **Phase 3: Error Handling & DLQ (Week 4)**

#### **3.1 Retry Mechanism**
```typescript
// src/events/retry/retry-handler.ts
export class RetryHandler {
  private retryDelays = [1000, 2000, 4000] // 1s, 2s, 4s
  
  async handleWithRetry(event: IEvent, handler: IEventHandler): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await handler.handle(event)
        return // Success
      } catch (error) {
        if (attempt < 2) {
          await this.delay(this.retryDelays[attempt])
        } else {
          this.moveToDeadLetterQueue(event, error)
        }
      }
    }
  }
}
```

## 🔧 Configuration

```typescript
// src/events/config/buffered-event-config.ts
export interface BufferedEventConfig {
  enabled: boolean
  workerCount: number
  maxQueueSize: number
  maxMemoryMB: number
  retryAttempts: number
  retryDelays: number[]
  priorities: {
    critical: number
    normal: number
    low: number
  }
}

export const defaultConfig: BufferedEventConfig = {
  enabled: true,
  workerCount: 5,
  maxQueueSize: 10000,
  maxMemoryMB: 50,
  retryAttempts: 3,
  retryDelays: [1000, 2000, 4000],
  priorities: { critical: 3, normal: 2, low: 1 }
}
```

## 🚀 Usage Examples

### **Basic Usage**
```typescript
// Existing code remains unchanged
@EventListener()
export class WelcomeEmailHandler {
  @OnEvent('user.registered')
  async handleUserRegistered(event: UserRegisteredEvent) {
    // This now runs in worker thread automatically
    await this.emailService.sendWelcomeEmail(event.payload.email)
  }
}

// Emitting events (no change)
this.eventBus.emit({
  type: 'user.registered',
  payload: { email: 'user@example.com' }
})
```

### **Priority Events**
```typescript
// High priority events
this.eventBus.emit({
  type: 'payment.failed',
  payload: { orderId: '123' },
  priority: 'critical'
})
```

## 📊 Performance Expectations

### **Throughput Targets**
- **Input Rate**: 1000+ events/sec
- **Processing Rate**: 200-500 events/sec (depends on handler complexity)
- **Main Thread Impact**: <5% CPU overhead
- **Memory Usage**: ~50MB for queue + worker overhead

### **Latency Expectations**
- **Queue Latency**: <1ms (enqueue time)
- **Processing Latency**: 10-100ms (depending on handler)
- **End-to-End**: 1-5 seconds for non-critical events

## 🔒 Thread Safety

### **Shared Memory Safety**
- Atomic operations for queue indices
- Lock-free circular buffer design
- Event serialization/deserialization

### **Error Isolation**
- Worker crashes don't affect main thread
- Failed workers auto-restart
- Graceful degradation to synchronous processing

## 🧪 Testing Strategy

### **Unit Tests**
- Shared buffer operations
- Event serialization
- Retry logic
- Metrics collection

### **Integration Tests**
- Worker thread communication
- End-to-end event processing
- Error scenarios
- Performance benchmarks

### **Load Tests**
- High-throughput scenarios (1000+ events/sec)
- Memory pressure tests
- Worker failure recovery
- Main thread impact measurement

## 🚦 Migration Strategy

### **Backward Compatibility**
- Existing `EventBusService` remains unchanged
- Opt-in via configuration flag
- Gradual migration path

### **Feature Flags**
```typescript
// Automatic fallback if workers fail
if (!bufferedEventConfig.enabled || workersFailed) {
  return this.fallbackToSyncProcessing(event)
}
```

## 📈 Success Criteria

1. **✅ Main thread CPU impact < 5%** during high event load
2. **✅ Process 500+ events/sec** with 5 workers
3. **✅ Zero event loss** under normal conditions
4. **✅ <100ms queue latency** for 95th percentile
5. **✅ Graceful degradation** when workers fail
6. **✅ Memory usage < 100MB** for full queue

---

**Next Steps**: 
1. Review and approve this specification
2. Begin Phase 1 implementation
3. Set up performance benchmarking
4. Create monitoring dashboard

**Estimated Timeline**: 4 weeks for complete implementation
**Risk Level**: Medium (worker thread complexity)
**Dependencies**: Node.js 12+ (worker_threads support)