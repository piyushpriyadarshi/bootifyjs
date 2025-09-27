#!/usr/bin/env ts-node

/**
 * Simple Buffered Event Processing Demo
 * 
 * This demonstrates buffered event processing without worker threads,
 * using async processing with priority queues and batching.
 * 
 * Run with: npx ts-node simple-buffered-demo.ts
 */

import { EventEmitter } from 'events';

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
// PRIORITY QUEUE FOR EVENTS
// ============================================================================

class PriorityEventQueue {
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
    
    // Find insertion point to maintain priority order
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
  
  dequeueBatch(batchSize: number): PriorityEvent[] {
    const batch = this.events.splice(0, Math.min(batchSize, this.events.length));
    return batch;
  }
  
  size(): number {
    return this.events.length;
  }
  
  isEmpty(): boolean {
    return this.events.length === 0;
  }
  
  peek(): PriorityEvent | null {
    return this.events[0] || null;
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
// BUFFERED EVENT BUS
// ============================================================================

class BufferedEventBus extends EventEmitter {
  private eventQueue: PriorityEventQueue;
  private eventHandlers = new Map<string, IEventHandler[]>();
  private isProcessing: boolean = false;
  private batchSize: number;
  private processingInterval: number;
  private metrics = {
    totalEvents: 0,
    processedEvents: 0,
    failedEvents: 0,
    queueSize: 0,
    batchesProcessed: 0,
    averageProcessingTime: 0
  };
  
  constructor(options: {
    maxQueueSize?: number;
    batchSize?: number;
    processingInterval?: number;
  } = {}) {
    super();
    this.eventQueue = new PriorityEventQueue(options.maxQueueSize || 1000);
    this.batchSize = options.batchSize || 5;
    this.processingInterval = options.processingInterval || 100;
  }
  
  // Register event handlers
  registerHandler(eventType: string, handler: IEventHandler): this {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType)!.push(handler);
    return this;
  }
  
  // Emit events to the buffer
  async emitBuffered(type: string, payload: any, options: EventOptions = {}): Promise<string> {
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
    
    console.log(`📤 Event buffered: ${type} (Priority: ${event.priority}, Queue: ${this.metrics.queueSize})`);
    
    // Start processing if not already running
    if (!this.isProcessing) {
      this.startProcessing();
    }
    
    return eventId;
  }
  
  // Start the buffered processing loop
  private startProcessing(): void {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    console.log('🔄 Starting buffered event processing...');
    
    const processLoop = async () => {
      while (this.isProcessing) {
        if (this.eventQueue.isEmpty()) {
          await this.sleep(this.processingInterval);
          continue;
        }
        
        // Process events in batches
        const batch = this.eventQueue.dequeueBatch(this.batchSize);
        if (batch.length > 0) {
          await this.processBatch(batch);
        }
        
        // Update metrics
        this.metrics.queueSize = this.eventQueue.size();
        
        // Small delay between batches
        await this.sleep(this.processingInterval);
      }
    };
    
    processLoop().catch(error => {
      console.error('❌ Error in processing loop:', error);
      this.isProcessing = false;
    });
  }
  
  // Process a batch of events
  private async processBatch(events: PriorityEvent[]): Promise<void> {
    const startTime = Date.now();
    
    console.log(`🔄 Processing batch of ${events.length} events...`);
    
    // Group events by type for efficient processing
    const eventsByType = new Map<string, PriorityEvent[]>();
    for (const event of events) {
      if (!eventsByType.has(event.type)) {
        eventsByType.set(event.type, []);
      }
      eventsByType.get(event.type)!.push(event);
    }
    
    // Process each event type
    const processingPromises: Promise<void>[] = [];
    
    for (const [eventType, typeEvents] of eventsByType) {
      const handlers = this.eventHandlers.get(eventType) || [];
      
      if (handlers.length === 0) {
        console.log(`⚠️ No handlers for event type: ${eventType}`);
        continue;
      }
      
      // Process all events of this type
      for (const event of typeEvents) {
        for (const handler of handlers) {
          processingPromises.push(
            this.processEvent(event, handler)
          );
        }
      }
    }
    
    // Wait for all events in batch to complete
    await Promise.allSettled(processingPromises);
    
    const processingTime = Date.now() - startTime;
    this.metrics.batchesProcessed++;
    this.metrics.averageProcessingTime = 
      (this.metrics.averageProcessingTime * (this.metrics.batchesProcessed - 1) + processingTime) / 
      this.metrics.batchesProcessed;
    
    console.log(`✅ Batch processed in ${processingTime}ms`);
  }
  
  // Process individual event
  private async processEvent(event: PriorityEvent, handler: IEventHandler): Promise<void> {
    try {
      console.log(`🔧 Processing: ${event.type} (${event.eventId})`);
      await handler.handle(event);
      this.metrics.processedEvents++;
      console.log(`✅ Completed: ${event.type} (${event.eventId})`);
    } catch (error) {
      this.metrics.failedEvents++;
      console.error(`❌ Failed: ${event.type} (${event.eventId}):`, error instanceof Error ? error.message : String(error));
      
      // Could implement retry logic here
      if (event.retryCount! < 3) {
        event.retryCount = (event.retryCount || 0) + 1;
        console.log(`🔄 Retrying: ${event.type} (attempt ${event.retryCount})`);
        this.eventQueue.enqueue(event);
      }
    }
  }
  
  // Stop processing
  stopProcessing(): void {
    console.log('🛑 Stopping buffered event processing...');
    this.isProcessing = false;
  }
  
  // Get current metrics
  getMetrics() {
    return {
      ...this.metrics,
      queueSize: this.eventQueue.size(),
      isProcessing: this.isProcessing
    };
  }
  
  // Wait for all events to be processed
  async waitForCompletion(timeoutMs: number = 30000): Promise<void> {
    const startTime = Date.now();
    
    while (this.eventQueue.size() > 0 || this.metrics.processedEvents + this.metrics.failedEvents < this.metrics.totalEvents) {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error('Timeout waiting for event processing completion');
      }
      await this.sleep(100);
    }
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ============================================================================
// DEMO EVENT HANDLERS
// ============================================================================

class UserRegistrationHandler implements IEventHandler {
  async handle(event: PriorityEvent): Promise<void> {
    const { userId, email } = event.payload;
    console.log(`👤 Processing user registration for ${email}...`);
    
    // Simulate processing time
    await this.sleep(Math.random() * 300 + 100);
    
    // Simulate some business logic
    console.log(`📧 Sending welcome email to ${email}`);
    console.log(`🔐 Creating user profile for ${userId}`);
    
    console.log(`✨ User ${email} registered successfully!`);
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class OrderProcessingHandler implements IEventHandler {
  async handle(event: PriorityEvent): Promise<void> {
    const { orderId, userId, amount } = event.payload;
    console.log(`🛒 Processing order ${orderId} for user ${userId} ($${amount})...`);
    
    // Simulate processing time
    await this.sleep(Math.random() * 500 + 200);
    
    // Simulate business logic
    console.log(`💳 Processing payment of $${amount}`);
    console.log(`📦 Preparing shipment for order ${orderId}`);
    console.log(`📧 Sending order confirmation`);
    
    console.log(`✨ Order ${orderId} processed successfully!`);
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class SystemAlertHandler implements IEventHandler {
  async handle(event: PriorityEvent): Promise<void> {
    const { message, severity } = event.payload;
    console.log(`🚨 SYSTEM ALERT [${severity.toUpperCase()}]: ${message}`);
    
    // Critical alerts process faster
    await this.sleep(50);
    
    console.log(`📞 Notifying system administrators`);
    console.log(`📊 Logging alert to monitoring system`);
    
    console.log(`✅ Alert handled successfully`);
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// DEMO APPLICATION
// ============================================================================

async function runDemo() {
  console.log('🎬 Starting Simple Buffered Event Processing Demo\n');
  
  // Initialize the buffered event bus
  const eventBus = new BufferedEventBus({
    maxQueueSize: 1000,
    batchSize: 3,
    processingInterval: 200
  });
  
  // Register event handlers
  eventBus.registerHandler('user.registered', new UserRegistrationHandler());
  eventBus.registerHandler('order.created', new OrderProcessingHandler());
  eventBus.registerHandler('system.alert', new SystemAlertHandler());
  
  console.log('✅ Event handlers registered\n');
  
  // Emit various events with different priorities
  console.log('📊 Emitting events...\n');
  
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
      const eventId = await eventBus.emitBuffered(event.type, event.payload, { priority: event.priority });
      console.log(`✨ Emitted ${event.type} with ID: ${eventId}`);
    } catch (error) {
      console.error('❌ Failed to emit event:', error);
    }
    
    // Small delay between emissions
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('\n📊 All events emitted. Processing in batches...\n');
  
  // Show metrics periodically
  const metricsInterval = setInterval(() => {
    const metrics = eventBus.getMetrics();
    console.log(`📈 Metrics - Total: ${metrics.totalEvents}, Processed: ${metrics.processedEvents}, Failed: ${metrics.failedEvents}, Queue: ${metrics.queueSize}, Batches: ${metrics.batchesProcessed}, Avg Time: ${Math.round(metrics.averageProcessingTime)}ms`);
  }, 2000);
  
  try {
    // Wait for all events to be processed
    await eventBus.waitForCompletion(30000);
    
    console.log('\n🎉 All events processed! Final metrics:');
    console.log(eventBus.getMetrics());
    
  } catch (error) {
    console.error('❌ Error during processing:', error);
  } finally {
    clearInterval(metricsInterval);
    eventBus.stopProcessing();
    
    console.log('\n✅ Demo completed successfully!');
  }
}

// ============================================================================
// PERFORMANCE COMPARISON
// ============================================================================

async function runPerformanceComparison() {
  console.log('\n🏁 Running Performance Comparison\n');
  
  const eventCount = 50;
  
  // Test 1: Synchronous processing
  console.log('🔄 Testing synchronous event processing...');
  const syncStart = Date.now();
  
  for (let i = 0; i < eventCount; i++) {
    const handler = new UserRegistrationHandler();
    await handler.handle({
      type: 'user.registered',
      payload: { userId: `user_${i}`, email: `user${i}@example.com` },
      eventId: `sync_${i}`,
      timestamp: Date.now()
    });
  }
  
  const syncTime = Date.now() - syncStart;
  console.log(`⏱️ Synchronous processing: ${syncTime}ms for ${eventCount} events`);
  
  // Test 2: Buffered processing
  console.log('\n🔄 Testing buffered event processing...');
  const bufferedStart = Date.now();
  
  const bufferedEventBus = new BufferedEventBus({
    batchSize: 10,
    processingInterval: 50
  });
  
  bufferedEventBus.registerHandler('user.registered', new UserRegistrationHandler());
  
  for (let i = 0; i < eventCount; i++) {
    await bufferedEventBus.emitBuffered('user.registered', {
      userId: `user_${i}`,
      email: `user${i}@example.com`
    });
  }
  
  await bufferedEventBus.waitForCompletion();
  const bufferedTime = Date.now() - bufferedStart;
  
  console.log(`⏱️ Buffered processing: ${bufferedTime}ms for ${eventCount} events`);
  console.log(`📊 Performance improvement: ${Math.round(((syncTime - bufferedTime) / syncTime) * 100)}%`);
  
  bufferedEventBus.stopProcessing();
}

// ============================================================================
// RUN THE DEMO
// ============================================================================

if (require.main === module) {
  (async () => {
    try {
      await runDemo();
      await runPerformanceComparison();
    } catch (error) {
      console.error('💥 Demo failed:', error);
      process.exit(1);
    }
  })();
}

export { BufferedEventBus, PriorityEventQueue, PriorityEvent, EventOptions, IEventHandler };