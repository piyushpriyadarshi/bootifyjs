#!/usr/bin/env ts-node

/**
 * Minimal BootifyJS Framework Buffered Event Demo
 * 
 * This demonstrates the core buffered event processing concepts
 * using the framework's types and interfaces without full initialization.
 * 
 * Run with: npx ts-node minimal-framework-demo.ts
 */

import { EventPriority } from './src/events/shared-buffer';
import { IEvent, IEventHandler } from './src/events/event.types';

// ============================================================================
// DEMO EVENT CLASSES (Using Framework Interfaces)
// ============================================================================

class UserRegisteredEvent implements IEvent {
  readonly type = 'user.registered';
  readonly payload: any;
  
  constructor(
    private userId: string,
    private email: string,
    private name: string
  ) {
    this.payload = {
      userId: this.userId,
      email: this.email,
      name: this.name,
      timestamp: new Date().toISOString()
    };
  }
}

class OrderCreatedEvent implements IEvent {
  readonly type = 'order.created';
  readonly payload: any;
  
  constructor(
    private orderId: string,
    private userId: string,
    private amount: number,
    private items: string[]
  ) {
    this.payload = {
      orderId: this.orderId,
      userId: this.userId,
      amount: this.amount,
      items: this.items,
      timestamp: new Date().toISOString()
    };
  }
}

class SystemAlertEvent implements IEvent {
  readonly type = 'system.alert';
  readonly payload: any;
  
  constructor(
    private message: string,
    private severity: 'info' | 'warning' | 'error' | 'critical'
  ) {
    this.payload = {
      message: this.message,
      severity: this.severity,
      timestamp: new Date().toISOString(),
      source: 'demo-application'
    };
  }
}

// ============================================================================
// DEMO EVENT HANDLERS (Using Framework Interface)
// ============================================================================

class UserRegistrationHandler implements IEventHandler {
  async handle(event: IEvent): Promise<void> {
    const { userId, email, name } = event.payload;
    console.log(`👤 [Framework Handler] Processing user registration for ${name} (${email})...`);
    
    // Simulate async processing
    await this.sleep(Math.random() * 300 + 100);
    
    // Simulate business logic
    console.log(`  📧 Sending welcome email to ${email}`);
    console.log(`  🔐 Creating user profile for ${userId}`);
    console.log(`  📊 Adding user to analytics`);
    
    console.log(`✅ User ${name} registered successfully!`);
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class OrderProcessingHandler implements IEventHandler {
  async handle(event: IEvent): Promise<void> {
    const { orderId, userId, amount, items } = event.payload;
    console.log(`🛒 [Framework Handler] Processing order ${orderId} for user ${userId} ($${amount})...`);
    
    // Simulate async processing
    await this.sleep(Math.random() * 500 + 200);
    
    // Simulate business logic
    console.log(`  💳 Processing payment of $${amount}`);
    console.log(`  📦 Preparing shipment for ${items.length} items: ${items.join(', ')}`);
    console.log(`  📧 Sending order confirmation`);
    console.log(`  📊 Updating inventory`);
    
    console.log(`✅ Order ${orderId} processed successfully!`);
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class SystemAlertHandler implements IEventHandler {
  async handle(event: IEvent): Promise<void> {
    const { message, severity, source } = event.payload;
    console.log(`🚨 [Framework Handler] SYSTEM ALERT [${severity.toUpperCase()}] from ${source}: ${message}`);
    
    // Critical alerts process faster
    await this.sleep(severity === 'critical' ? 50 : 100);
    
    // Simulate alert handling
    console.log(`  📞 Notifying system administrators`);
    console.log(`  📊 Logging alert to monitoring system`);
    
    if (severity === 'critical') {
      console.log(`  🚨 Triggering emergency response protocol`);
    }
    
    console.log(`✅ Alert handled successfully`);
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// SIMPLIFIED BUFFERED EVENT PROCESSOR (Framework-Compatible)
// ============================================================================

interface PriorityEvent extends IEvent {
  priority?: EventPriority;
  timestamp?: number;
  eventId?: string;
  retryCount?: number;
}

class FrameworkCompatibleEventProcessor {
  private eventQueue: PriorityEvent[] = [];
  private handlers = new Map<string, IEventHandler[]>();
  private isProcessing = false;
  private metrics = {
    totalEvents: 0,
    processedEvents: 0,
    failedEvents: 0,
    queueSize: 0,
    batchesProcessed: 0
  };
  
  // Register handlers (framework-compatible)
  registerHandler(eventType: string, handler: IEventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);
    console.log(`📝 Registered handler for event type: ${eventType}`);
  }
  
  // Emit events with priority (framework-compatible)
  async emitEvent(event: IEvent, options: { priority?: EventPriority } = {}): Promise<string> {
    const eventId = this.generateEventId();
    const priorityEvent: PriorityEvent = {
      ...event,
      priority: options.priority || 'normal',
      timestamp: Date.now(),
      eventId,
      retryCount: 0
    };
    
    // Insert based on priority
    this.insertByPriority(priorityEvent);
    
    this.metrics.totalEvents++;
    this.metrics.queueSize = this.eventQueue.length;
    
    console.log(`📤 Event queued: ${event.type} (Priority: ${priorityEvent.priority}, Queue: ${this.metrics.queueSize})`);
    
    // Start processing if not already running
    if (!this.isProcessing) {
      this.startProcessing();
    }
    
    return eventId;
  }
  
  private insertByPriority(event: PriorityEvent): void {
    const priorityValue = this.getPriorityValue(event.priority || 'normal');
    let insertIndex = this.eventQueue.length;
    
    // Find insertion point to maintain priority order
    for (let i = 0; i < this.eventQueue.length; i++) {
      const existingPriority = this.getPriorityValue(this.eventQueue[i].priority || 'normal');
      if (priorityValue > existingPriority) {
        insertIndex = i;
        break;
      }
    }
    
    this.eventQueue.splice(insertIndex, 0, event);
  }
  
  private getPriorityValue(priority: EventPriority): number {
    switch (priority) {
      case 'critical': return 3;
      case 'normal': return 2;
      case 'low': return 1;
      default: return 2;
    }
  }
  
  private async startProcessing(): Promise<void> {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    console.log('🔄 Starting framework-compatible buffered processing...');
    
    while (this.isProcessing && this.eventQueue.length > 0) {
      // Process events in batches
      const batchSize = Math.min(3, this.eventQueue.length);
      const batch = this.eventQueue.splice(0, batchSize);
      
      if (batch.length > 0) {
        await this.processBatch(batch);
        this.metrics.batchesProcessed++;
      }
      
      this.metrics.queueSize = this.eventQueue.length;
      
      // Small delay between batches
      await this.sleep(100);
    }
    
    this.isProcessing = false;
    console.log('✅ Buffered processing completed');
  }
  
  private async processBatch(events: PriorityEvent[]): Promise<void> {
    const startTime = Date.now();
    console.log(`🔄 Processing batch of ${events.length} events...`);
    
    // Process events concurrently within the batch
    const processingPromises = events.map(event => this.processEvent(event));
    await Promise.allSettled(processingPromises);
    
    const processingTime = Date.now() - startTime;
    console.log(`✅ Batch processed in ${processingTime}ms`);
  }
  
  private async processEvent(event: PriorityEvent): Promise<void> {
    try {
      const handlers = this.handlers.get(event.type) || [];
      
      if (handlers.length === 0) {
        console.log(`⚠️ No handlers for event type: ${event.type}`);
        return;
      }
      
      console.log(`🔧 Processing: ${event.type} (${event.eventId})`);
      
      // Process all handlers for this event type
      await Promise.all(handlers.map(handler => handler.handle(event)));
      
      this.metrics.processedEvents++;
      console.log(`✅ Completed: ${event.type} (${event.eventId})`);
      
    } catch (error) {
      this.metrics.failedEvents++;
      console.error(`❌ Failed: ${event.type} (${event.eventId}):`, error instanceof Error ? error.message : String(error));
    }
  }
  
  getMetrics() {
    return {
      ...this.metrics,
      queueSize: this.eventQueue.length,
      isProcessing: this.isProcessing
    };
  }
  
  async waitForCompletion(timeoutMs: number = 30000): Promise<void> {
    const startTime = Date.now();
    
    while (this.eventQueue.length > 0 || this.isProcessing) {
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
// DEMO APPLICATION
// ============================================================================

async function runFrameworkDemo() {
  console.log('🎬 Starting BootifyJS Framework-Compatible Buffered Event Demo\n');
  
  // Initialize the framework-compatible event processor
  const eventProcessor = new FrameworkCompatibleEventProcessor();
  
  // Register event handlers (using framework interfaces)
  eventProcessor.registerHandler('user.registered', new UserRegistrationHandler());
  eventProcessor.registerHandler('order.created', new OrderProcessingHandler());
  eventProcessor.registerHandler('system.alert', new SystemAlertHandler());
  
  console.log('\n📊 Emitting events with framework-compatible types...\n');
  
  // Create sample events using framework-compatible classes
  const events = [
    // Normal priority events
    { event: new UserRegisteredEvent('user_001', 'alice@example.com', 'Alice Johnson'), priority: 'normal' as EventPriority },
    { event: new UserRegisteredEvent('user_002', 'bob@example.com', 'Bob Smith'), priority: 'normal' as EventPriority },
    { event: new OrderCreatedEvent('order_001', 'user_001', 99.99, ['Laptop', 'Mouse']), priority: 'normal' as EventPriority },
    
    // Low priority events
    { event: new UserRegisteredEvent('user_003', 'charlie@example.com', 'Charlie Brown'), priority: 'low' as EventPriority },
    { event: new OrderCreatedEvent('order_002', 'user_002', 149.99, ['Keyboard', 'Monitor']), priority: 'low' as EventPriority },
    
    // Critical priority events (should be processed first)
    { event: new SystemAlertEvent('Database connection lost!', 'critical'), priority: 'critical' as EventPriority },
    { event: new SystemAlertEvent('Memory usage above 90%', 'warning'), priority: 'critical' as EventPriority },
    
    // More normal events
    { event: new OrderCreatedEvent('order_003', 'user_003', 79.99, ['Headphones']), priority: 'normal' as EventPriority },
    { event: new UserRegisteredEvent('user_004', 'diana@example.com', 'Diana Prince'), priority: 'normal' as EventPriority },
    { event: new SystemAlertEvent('Scheduled maintenance completed', 'info'), priority: 'low' as EventPriority },
  ];
  
  // Emit all events
  for (const { event, priority } of events) {
    try {
      const eventId = await eventProcessor.emitEvent(event, { priority });
      console.log(`✨ Emitted ${event.type} with priority ${priority} (ID: ${eventId})`);
    } catch (error) {
      console.error('❌ Failed to emit event:', error);
    }
    
    // Small delay between emissions to see the queuing effect
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('\n📊 All events emitted. Processing through framework-compatible buffered system...\n');
  
  // Wait for processing to complete
  try {
    await eventProcessor.waitForCompletion();
    
    console.log('\n🎉 All events processed! Final metrics:');
    console.log(eventProcessor.getMetrics());
    
  } catch (error) {
    console.error('❌ Error during processing:', error);
  }
  
  console.log('\n✅ Framework-compatible demo completed successfully!');
}

// ============================================================================
// FRAMEWORK CONCEPTS EXPLANATION
// ============================================================================

function explainFrameworkConcepts() {
  console.log('\n📚 BootifyJS Buffered Event Processing Framework Concepts:\n');
  
  console.log('🔹 **IEvent Interface**: All events implement this interface with type and payload');
  console.log('🔹 **IEventHandler Interface**: All handlers implement handle(event) method');
  console.log('🔹 **EventPriority Type**: critical | normal | low for event prioritization');
  console.log('🔹 **BufferedEventBusService**: Main service for high-performance event processing');
  console.log('🔹 **Worker Threads**: Background processing with shared memory buffers');
  console.log('🔹 **Priority Queues**: Events processed based on priority levels');
  console.log('🔹 **Batch Processing**: Multiple events processed together for efficiency');
  console.log('🔹 **Retry Logic**: Failed events automatically retried with exponential backoff');
  console.log('🔹 **Metrics & Monitoring**: Real-time performance and health monitoring');
  console.log('🔹 **Graceful Degradation**: Falls back to synchronous processing if needed');
  
  console.log('\n💡 **Key Benefits**:');
  console.log('   • High throughput with worker thread parallelization');
  console.log('   • Priority-based processing for critical events');
  console.log('   • Memory-efficient shared buffer implementation');
  console.log('   • Built-in retry and error handling');
  console.log('   • Real-time metrics and health monitoring');
  console.log('   • Framework integration with dependency injection');
}

// ============================================================================
// RUN THE DEMO
// ============================================================================

if (require.main === module) {
  (async () => {
    try {
      await runFrameworkDemo();
      explainFrameworkConcepts();
    } catch (error) {
      console.error('💥 Demo failed:', error);
      process.exit(1);
    }
  })();
}

export { FrameworkCompatibleEventProcessor, UserRegisteredEvent, OrderCreatedEvent, SystemAlertEvent };