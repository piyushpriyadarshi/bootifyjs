# Buffered Event Processing System

## 🎯 Overview

The Buffered Event Processing System is a high-performance, off-main-thread event processing solution for BootifyJS framework. It prevents Node.js main event loop bottlenecks during high-throughput event scenarios by utilizing worker threads and shared memory buffers.

## 🤔 Why This Feature?

### **Problem Statement**
Node.js applications face performance bottlenecks when processing high volumes of events synchronously on the main thread. Traditional event emitters block the main event loop, causing:

- **Web service degradation** during event processing spikes
- **Request latency increases** when events take 1-2+ seconds to process
- **Memory pressure** from immediate event handler execution
- **Cascading failures** when event handlers throw exceptions

### **Real-World Use Cases**
- **Welcome emails** after user registration
- **Notification alerts** for system events
- **Analytics tracking** events
- **Audit logging** for compliance
- **Third-party API calls** triggered by business events

## 🏗️ Architecture Decisions & Rationale

### **Decision 1: Worker Thread Architecture**

**Choice**: Off-main-thread processing using Node.js worker threads

**Why?**
- ✅ **Main thread protection**: Web requests remain responsive
- ✅ **True parallelism**: CPU-intensive event handlers don't block I/O
- ✅ **Fault isolation**: Worker crashes don't affect main application
- ✅ **Scalability**: Can utilize multiple CPU cores

**Alternatives Considered**:
- ❌ **Process forking**: Too heavy, complex IPC
- ❌ **Cluster module**: Designed for load balancing, not event processing
- ❌ **External queues**: Adds infrastructure complexity for MVP

### **Decision 2: In-Memory Shared Buffer**

**Choice**: SharedArrayBuffer-based circular queue

**Why?**
- ✅ **Zero serialization cost**: Direct memory access
- ✅ **Lock-free operations**: Atomic operations for thread safety
- ✅ **Low latency**: <1ms enqueue time
- ✅ **Memory efficient**: Fixed allocation, no GC pressure

**Constraints**:
- ⚠️ **Memory limit**: 50MB default allocation
- ⚠️ **Event size**: Max 5KB per event (configurable)
- ⚠️ **Browser compatibility**: SharedArrayBuffer requires specific headers

### **Decision 3: Fixed Worker Pool (Phase 1)**

**Choice**: 5 fixed worker threads

**Why?**
- ✅ **Predictable resource usage**: Known memory/CPU footprint
- ✅ **Simple implementation**: No complex scaling logic
- ✅ **Debugging friendly**: Fixed number of threads to monitor
- ✅ **Production ready**: Proven pattern in many systems

**Future Evolution**:
- 📈 **Phase 2**: Dynamic scaling based on queue depth
- 📈 **Phase 3**: Event-type specific worker pools

### **Decision 4: Priority-Based Processing**

**Choice**: 3-tier priority system (Critical, Normal, Low)

**Why?**
- ✅ **Business alignment**: Critical events (payments) vs nice-to-have (analytics)
- ✅ **SLA compliance**: Guaranteed processing for important events
- ✅ **Resource optimization**: Low-priority events don't starve critical ones

**Implementation**:
```typescript
interface PriorityEvent extends IEvent {
  priority?: 'critical' | 'normal' | 'low'
}
```

### **Decision 5: Simple Retry Strategy**

**Choice**: 3 attempts with exponential backoff (1s → 2s → 4s)

**Why?**
- ✅ **Transient failure recovery**: Network timeouts, temporary service unavailability
- ✅ **Backpressure prevention**: Exponential delays prevent thundering herd
- ✅ **Bounded retry time**: Max 7 seconds total retry time
- ✅ **Dead letter queue**: Failed events preserved for analysis

**Alternatives Considered**:
- ❌ **Infinite retries**: Risk of infinite loops
- ❌ **Fixed delays**: Can overwhelm downstream services
- ❌ **Complex backoff**: Unnecessary complexity for MVP

## 🔧 Configuration & Constraints

### **Memory Constraints**

```typescript
interface MemoryLimits {
  maxQueueSize: 10000        // Max events in buffer
  maxEventSize: 5120         // 5KB per event
  totalMemoryMB: 50          // ~50MB total allocation
  workerHeapMB: 100          // Per-worker heap limit
}
```

**Why these limits?**
- **Queue size**: Balances memory usage vs throughput buffering
- **Event size**: Prevents single large events from dominating memory
- **Total memory**: Reasonable allocation for most applications
- **Worker heap**: Prevents runaway memory usage in handlers

### **Performance Constraints**

```typescript
interface PerformanceLimits {
  maxInputRate: 1000         // Events/sec input rate
  targetProcessingRate: 500  // Events/sec processing rate
  maxMainThreadImpact: 5     // % CPU usage on main thread
  maxQueueLatency: 100       // ms for 95th percentile
}
```

### **Reliability Constraints**

```typescript
interface ReliabilityLimits {
  maxRetryAttempts: 3        // Before moving to DLQ
  workerRestartDelay: 1000   // ms before restarting failed worker
  healthCheckInterval: 5000  // ms between health checks
  gracefulShutdownTimeout: 10000 // ms to drain queue on shutdown
}
```

## 🚦 Trade-offs & Limitations

### **✅ Benefits**
- **Main thread protection**: Web service remains responsive
- **Horizontal scalability**: Can add more workers
- **Fault tolerance**: Worker failures don't crash main app
- **Monitoring**: Rich metrics and observability
- **Backward compatibility**: Existing code works unchanged

### **⚠️ Trade-offs**
- **Memory overhead**: ~50MB additional memory usage
- **Complexity**: Worker thread management adds complexity
- **Event ordering**: No strict ordering guarantees
- **Serialization**: Events must be serializable
- **Debugging**: Harder to debug across thread boundaries

### **❌ Limitations**
- **No persistence**: Events lost on process restart
- **Single machine**: No distributed processing
- **Event size**: Limited to 5KB per event
- **Handler constraints**: Must be stateless and serializable

## 📊 Performance Expectations

### **Throughput Benchmarks**

| Scenario | Input Rate | Processing Rate | Main Thread Impact |
|----------|------------|-----------------|--------------------|
| Light load | 100 events/sec | 100 events/sec | <1% CPU |
| Medium load | 500 events/sec | 400 events/sec | <3% CPU |
| Heavy load | 1000 events/sec | 500 events/sec | <5% CPU |
| Overload | 2000 events/sec | 500 events/sec | Queue fills, drops events |

### **Latency Expectations**

| Metric | Target | Measurement |
|--------|--------|-------------|
| Enqueue latency | <1ms | Time to add event to buffer |
| Queue wait time | <100ms | Time event waits in buffer |
| Processing time | Variable | Depends on event handler |
| End-to-end | <5s | For non-critical events |

## 🧪 Testing Strategy

### **Unit Tests**
- Shared buffer operations (enqueue/dequeue)
- Event serialization/deserialization
- Retry logic and backoff calculations
- Metrics collection accuracy

### **Integration Tests**
- Worker thread lifecycle management
- Event handler execution in workers
- Error propagation and DLQ functionality
- Graceful shutdown behavior

### **Performance Tests**
- High-throughput scenarios (1000+ events/sec)
- Memory pressure under sustained load
- Main thread impact measurement
- Worker failure and recovery

### **Chaos Tests**
- Random worker crashes
- Memory exhaustion scenarios
- Network failures in event handlers
- Process restart during high load

## 🔍 Monitoring & Observability

### **Key Metrics**

```typescript
interface EventSystemMetrics {
  // Throughput
  eventsEnqueued: number
  eventsProcessed: number
  eventsDropped: number
  
  // Performance
  queueDepth: number
  processingRate: number
  averageLatency: number
  
  // Health
  activeWorkers: number
  failedWorkers: number
  deadLetterQueueSize: number
  
  // Resource Usage
  memoryUsage: number
  mainThreadCpuImpact: number
}
```

### **Alerting Thresholds**
- **Queue depth > 8000**: High load warning
- **Processing rate < 100/sec**: Performance degradation
- **Failed workers > 1**: Worker health issue
- **DLQ size > 100**: Event processing failures
- **Main thread CPU > 10%**: Architecture violation

## 🚀 Migration Guide

### **Phase 1: Opt-in Adoption**

```typescript
// Enable buffered processing
const config = {
  events: {
    buffered: {
      enabled: true,
      workerCount: 5
    }
  }
}
```

### **Phase 2: Gradual Migration**

```typescript
// Migrate specific event types
@EventListener({ buffered: true })
export class EmailHandler {
  @OnEvent('user.registered')
  async sendWelcomeEmail(event: UserRegisteredEvent) {
    // Runs in worker thread
  }
}
```

### **Phase 3: Default Behavior**

```typescript
// Eventually becomes default
const config = {
  events: {
    buffered: {
      enabled: true, // Default
      fallbackToSync: true // Safety net
    }
  }
}
```

## 🔮 Future Roadmap

### **Phase 2 Enhancements**
- **Dynamic worker scaling** based on queue depth
- **Event-type specific workers** for specialized processing
- **Advanced retry strategies** (circuit breakers, jitter)
- **Monitoring dashboard** with real-time metrics

### **Phase 3 Enterprise Features**
- **Redis-backed persistence** for critical events
- **Distributed processing** across multiple nodes
- **Event sourcing integration** for audit trails
- **Advanced analytics** and event correlation

## 📚 References & Inspiration

- **Pino Logger**: Worker thread architecture inspiration
- **Bull Queue**: Retry and DLQ patterns
- **Node.js Worker Threads**: Core technology foundation
- **Shared Array Buffer**: High-performance inter-thread communication

---

## 🤝 Contributing

This feature represents a significant architectural enhancement to BootifyJS. Contributions should focus on:

1. **Performance optimization**: Reducing latency and memory usage
2. **Reliability improvements**: Better error handling and recovery
3. **Monitoring enhancements**: More detailed metrics and alerting
4. **Documentation**: Usage examples and best practices

**Remember**: The goal is to make event processing invisible to the main application while providing enterprise-grade reliability and performance.

---

*This document serves as the definitive guide for understanding the design decisions, constraints, and trade-offs of the Buffered Event Processing System in BootifyJS.*