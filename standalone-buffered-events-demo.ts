#!/usr/bin/env ts-node

/**
 * Standalone Buffered Event Processing Demo
 * 
 * This is a complete, self-contained example showing how buffered event processing
 * works without any web framework dependencies. Just pure TypeScript/Node.js.
 * 
 * Run with: npx ts-node standalone-buffered-events-demo.ts
 */

import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { EventEmitter } from 'events';
import * as path from 'path';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

interface IEvent {
  readonly type: string;
  payload: any;
  correlationId?: string;
}

type EventPriority = 'critical' | 'normal' | 'low';

interface PriorityEvent extends IEvent {
  priority?: EventPriority;
  timestamp?: number;
  retryCount?: number;
  eventId?: string;
}

interface EventOptions {
  priority?: EventPriority;
  correlationId?: string;
}

interface IEventHandler {
  handle(event: PriorityEvent): Promise<void> | void;
}

// ============================================================================
// SIMPLE SHARED BUFFER (In-Memory Queue for Demo)
// ============================================================================

class SimpleEventQueue {
  private events: PriorityEvent[] = [];
  private maxSize: number;
  
  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }
  
  enqueue(event: PriorityEvent): boolean {
    if (this.events.length >= this.maxSize) {
      return false; // Queue full
    }
    
    // Insert based on priority (critical=3, normal=2, low=1)
    const priorityValue = this.getPriorityValue(event.priority || 'normal');
    let insertIndex = this.events.length;
    
    for (let i = 0; i < this.events.length; i++) {
      const existingPriority = this.getPriorityValue(this.events[i].priority || 'normal');
      if (priorityValue > existingPriority) {
        insertIndex = i;
        break;
      }
    }
    
    this.events.splice(insertIndex, 0, event);
    return true;
  }
  
  dequeue(): PriorityEvent | null {
    return this.events.shift() || null;
  }
  
  size(): number {
    return this.events.length;
  }
  
  isEmpty(): boolean {
    return this.events.length === 0;
  }
  
  private getPriorityValue(priority: EventPriority): number {
    switch (priority) {
      case 'critical': return 3;
      case 'normal': return 2;
      case 'low': return 1;
      default: return 2;
    }
  }
}

// ============================================================================
// WORKER THREAD CODE
// ============================================================================

if (!isMainThread) {
  // This code runs in worker threads
  const { workerId } = workerData;
  
  console.log(`🔧 Worker ${workerId} started`);
  
  // Simulate event handlers registry
  const eventHandlers = new Map<string, IEventHandler[]>();
  
  // Register some demo handlers
  eventHandlers.set('user.registered', [{
    async handle(event: PriorityEvent) {
      console.log(`👤 [Worker ${workerId}] Processing user registration: ${JSON.stringify(event.payload)}`);
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 100));
      console.log(`✅ [Worker ${workerId}] User registration completed for ${event.payload.email}`);
    }
  }]);
  
  eventHandlers.set('order.created', [{
    async handle(event: PriorityEvent) {
      console.log(`🛒 [Worker ${workerId}] Processing order: ${JSON.stringify(event.payload)}`);
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, Math.random() * 800 + 200));
      console.log(`✅ [Worker ${workerId}] Order ${event.payload.orderId} processed successfully`);
    }
  }]);
  
  eventHandlers.set('system.alert', [{
    async handle(event: PriorityEvent) {
      console.log(`🚨 [Worker ${workerId}] CRITICAL ALERT: ${JSON.stringify(event.payload)}`);
      // Critical events process faster
      await new Promise(resolve => setTimeout(resolve, 50));
      console.log(`✅ [Worker ${workerId}] Alert handled`);
    }
  }]);
  
  // Listen for events from main thread
  parentPort?.on('message', async (event: PriorityEvent) => {
    try {
      const handlers = eventHandlers.get(event.type) || [];
      
      if (handlers.length === 0) {
        console.log(`⚠️ [Worker ${workerId}] No handlers for event type: ${event.type}`);
        return;
      }
      
      // Process all handlers for this event type
      await Promise.all(handlers.map(handler => handler.handle(event)));
      
      // Notify main thread of completion
      parentPort?.postMessage({ 
        type: 'event_processed', 
        eventId: event.eventId,
        workerId 
      });
      
    } catch (error) {
      console.error(`❌ [Worker ${workerId}] Error processing event:`, error);
      parentPort?.postMessage({ 
        type: 'event_error', 
        eventId: event.eventId, 
        error: error instanceof Error ? error.message : String(error),
        workerId 
      });
    }
  });
  
  // Keep worker alive
  parentPort?.on('close', () => {
    console.log(`🔴 Worker ${workerId} shutting down`);
    process.exit(0);
  });
}

// ============================================================================
// MAIN THREAD - BUFFERED EVENT BUS
// ============================================================================

class SimpleBufferedEventBus extends EventEmitter {
  private workers: Worker[] = [];
  private eventQueue: SimpleEventQueue;
  private workerCount: number;
  private isProcessing: boolean = false;
  private metrics = {
    totalEvents: 0,
    processedEvents: 0,
    failedEvents: 0,
    queueSize: 0
  };
  
  constructor(workerCount: number = 3, maxQueueSize: number = 1000) {
    super();
    this.workerCount = workerCount;
    this.eventQueue = new SimpleEventQueue(maxQueueSize);
  }
  
  async initialize(): Promise<void> {
    console.log(`🚀 Initializing BufferedEventBus with ${this.workerCount} workers...`);
    
    // Create worker threads
    for (let i = 0; i < this.workerCount; i++) {
      const worker = new Worker(__filename, {
        workerData: { workerId: i + 1 }
      });
      
      worker.on('message', (message) => {
        if (message.type === 'event_processed') {
          this.metrics.processedEvents++;
          console.log(`📊 Event processed by worker ${message.workerId}`);
        } else if (message.type === 'event_error') {
          this.metrics.failedEvents++;
          console.error(`📊 Event failed in worker ${message.workerId}:`, message.error);
        }
      });
      
      worker.on('error', (error) => {
        console.error(`❌ Worker ${i + 1} error:`, error);
      });
      
      this.workers.push(worker);
    }
    
    // Start processing queue
    this.startProcessing();
    
    console.log(`✅ BufferedEventBus initialized with ${this.workers.length} workers`);
  }
  
  async emitEvent(type: string, payload: any, options: EventOptions = {}): Promise<string> {
    const eventId = this.generateEventId();
    const event: PriorityEvent = {
      type,
      payload,
      priority: options.priority || 'normal',
      correlationId: options.correlationId,
      timestamp: Date.now(),
      eventId,
      retryCount: 0
    };
    
    const queued = this.eventQueue.enqueue(event);
    if (!queued) {
      throw new Error('Event queue is full');
    }
    
    this.metrics.totalEvents++;
    this.metrics.queueSize = this.eventQueue.size();
    
    console.log(`📤 Event queued: ${type} (Priority: ${event.priority}, Queue size: ${this.metrics.queueSize})`);
    
    return eventId;
  }
  
  private startProcessing(): void {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    
    const processNext = () => {
      if (this.eventQueue.isEmpty()) {
        // Check again in 100ms
        setTimeout(processNext, 100);
        return;
      }
      
      const event = this.eventQueue.dequeue();
      if (event) {
        // Find least busy worker (simple round-robin for demo)
        const workerIndex = this.metrics.processedEvents % this.workers.length;
        const worker = this.workers[workerIndex];
        
        console.log(`📨 Sending event ${event.type} to worker ${workerIndex + 1}`);
        worker.postMessage(event);
        
        this.metrics.queueSize = this.eventQueue.size();
      }
      
      // Process next event immediately
      setImmediate(processNext);
    };
    
    processNext();
  }
  
  getMetrics() {
    return {
      ...this.metrics,
      activeWorkers: this.workers.length,
      queueUtilization: this.metrics.queueSize / 1000 // Assuming max 1000
    };
  }
  
  async shutdown(): Promise<void> {
    console.log('🔄 Shutting down BufferedEventBus...');
    
    // Wait for queue to empty
    while (!this.eventQueue.isEmpty()) {
      console.log(`⏳ Waiting for ${this.eventQueue.size()} events to process...`);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Terminate workers
    await Promise.all(this.workers.map(worker => worker.terminate()));
    
    console.log('✅ BufferedEventBus shut down successfully');
  }
  
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ============================================================================
// DEMO APPLICATION
// ============================================================================

async function runDemo() {
  if (!isMainThread) {
    // This prevents the demo from running in worker threads
    return;
  }
  
  console.log('🎬 Starting Buffered Event Processing Demo\n');
  
  // Initialize the buffered event bus
  const eventBus = new SimpleBufferedEventBus(3, 1000);
  await eventBus.initialize();
  
  console.log('\n📊 Starting event emission...\n');
  
  // Emit various events with different priorities
  const events = [
    // Normal priority events
    { type: 'user.registered', payload: { userId: 'user_001', email: 'alice@example.com' }, priority: 'normal' as EventPriority },
    { type: 'user.registered', payload: { userId: 'user_002', email: 'bob@example.com' }, priority: 'normal' as EventPriority },
    { type: 'order.created', payload: { orderId: 'order_001', userId: 'user_001', amount: 99.99 }, priority: 'normal' as EventPriority },
    
    // Low priority events
    { type: 'user.registered', payload: { userId: 'user_003', email: 'charlie@example.com' }, priority: 'low' as EventPriority },
    { type: 'order.created', payload: { orderId: 'order_002', userId: 'user_002', amount: 149.99 }, priority: 'low' as EventPriority },
    
    // Critical priority events (should be processed first)
    { type: 'system.alert', payload: { message: 'Database connection lost!', severity: 'critical' }, priority: 'critical' as EventPriority },
    { type: 'system.alert', payload: { message: 'Memory usage above 90%', severity: 'warning' }, priority: 'critical' as EventPriority },
    
    // More normal events
    { type: 'order.created', payload: { orderId: 'order_003', userId: 'user_003', amount: 79.99 }, priority: 'normal' as EventPriority },
    { type: 'user.registered', payload: { userId: 'user_004', email: 'diana@example.com' }, priority: 'normal' as EventPriority },
  ];
  
  // Emit all events
  for (const event of events) {
    try {
      const eventId = await eventBus.emitEvent(event.type, event.payload, { priority: event.priority });
      console.log(`✨ Emitted ${event.type} with ID: ${eventId}`);
    } catch (error) {
      console.error('❌ Failed to emit event:', error);
    }
    
    // Small delay between emissions
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log('\n📊 All events emitted. Processing in progress...\n');
  
  // Show metrics periodically
  const metricsInterval = setInterval(() => {
    const metrics = eventBus.getMetrics();
    console.log(`📈 Metrics - Total: ${metrics.totalEvents}, Processed: ${metrics.processedEvents}, Failed: ${metrics.failedEvents}, Queue: ${metrics.queueSize}, Workers: ${metrics.activeWorkers}`);
    
    // Stop when all events are processed
    if (metrics.processedEvents + metrics.failedEvents >= metrics.totalEvents && metrics.queueSize === 0) {
      clearInterval(metricsInterval);
      
      setTimeout(async () => {
        console.log('\n🎉 All events processed! Final metrics:');
        console.log(eventBus.getMetrics());
        
        console.log('\n🔄 Shutting down...');
        await eventBus.shutdown();
        
        console.log('\n✅ Demo completed successfully!');
        process.exit(0);
      }, 2000);
    }
  }, 1000);
  
  // Safety timeout
  setTimeout(async () => {
    console.log('\n⏰ Demo timeout reached, shutting down...');
    clearInterval(metricsInterval);
    await eventBus.shutdown();
    process.exit(0);
  }, 30000);
}

// ============================================================================
// RUN THE DEMO
// ============================================================================

if (require.main === module) {
  runDemo().catch(error => {
    console.error('💥 Demo failed:', error);
    process.exit(1);
  });
}

export { SimpleBufferedEventBus, PriorityEvent, EventOptions, IEventHandler };