#!/usr/bin/env ts-node

/**
 * BootifyJS Framework Buffered Event Processing Demo
 * 
 * This demonstrates how to use the existing BufferedEventBusService
 * from the BootifyJS framework in a standalone TypeScript application.
 * 
 * Run with: npx ts-node framework-buffered-demo.ts
 */

import { BufferedEventBusService } from './src/events/buffered-event-bus.service';
import { EventBusService } from './src/events/event-bus.service';
import { IEvent, IEventHandler } from './src/events/event.types';
import { EventPriority } from './src/events/shared-buffer';
import { BufferedEventConfig } from './src/events/config/buffered-event-config';

// ============================================================================
// DEMO EVENT CLASSES
// ============================================================================

class UserRegisteredEvent implements IEvent {
  readonly type = 'user.registered';
  
  constructor(
    private userId: string,
    private email: string,
    private name: string
  ) {}
  
  get payload() {
    return {
      userId: this.userId,
      email: this.email,
      name: this.name,
      timestamp: new Date().toISOString()
    };
  }
}

class OrderCreatedEvent implements IEvent {
  readonly type = 'order.created';
  
  constructor(
    private orderId: string,
    private userId: string,
    private amount: number,
    private items: string[]
  ) {}
  
  get payload() {
    return {
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
  
  constructor(
    private message: string,
    private severity: 'info' | 'warning' | 'error' | 'critical'
  ) {}
  
  get payload() {
    return {
      message: this.message,
      severity: this.severity,
      timestamp: new Date().toISOString(),
      source: 'demo-application'
    };
  }
}

// ============================================================================
// DEMO EVENT HANDLERS
// ============================================================================

class UserRegistrationHandler implements IEventHandler {
  async handle(event: IEvent): Promise<void> {
    const { userId, email, name } = event.payload;
    console.log(`👤 Processing user registration for ${name} (${email})...`);
    
    // Simulate async processing
    await this.sleep(Math.random() * 400 + 100);
    
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
    console.log(`🛒 Processing order ${orderId} for user ${userId} ($${amount})...`);
    
    // Simulate async processing
    await this.sleep(Math.random() * 600 + 200);
    
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
    console.log(`🚨 SYSTEM ALERT [${severity.toUpperCase()}] from ${source}: ${message}`);
    
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
// DEMO APPLICATION
// ============================================================================

class DemoApplication {
  private bufferedEventBus: BufferedEventBusService;
  private regularEventBus: EventBusService;
  
  constructor() {
    // Configure buffered event processing
    const config: Partial<BufferedEventConfig> = {
      enabled: true,
      workerCount: 3,
      maxQueueSize: 1000,
      maxMemoryMB: 50,
      maxEventSize: 5120,
      retryAttempts: 3,
      retryDelays: [1000, 2000, 4000],
      priorities: {
        critical: 3,
        normal: 2,
        low: 1
      },
      monitoring: {
        enabled: true,
        metricsInterval: 2000,
        healthMonitoring: true,
        healthCheckInterval: 5000,
        alertThresholds: {
          queueDepthWarning: 800,
          processingRateMin: 50,
          maxFailedWorkers: 1,
          dlqSizeAlert: 50,
          mainThreadCpuAlert: 10
        }
      }
    };
    
    // Initialize event buses
    this.regularEventBus = new EventBusService();
    this.bufferedEventBus = new BufferedEventBusService({ config });
  }
  
  async initialize(): Promise<void> {
    console.log('🚀 Initializing BootifyJS Buffered Event Processing Demo\n');
    
    // Register event handlers with the regular event bus
    // The buffered event bus will delegate to these handlers
    this.regularEventBus.subscribe('user.registered', new UserRegistrationHandler());
    this.regularEventBus.subscribe('order.created', new OrderProcessingHandler());
    this.regularEventBus.subscribe('system.alert', new SystemAlertHandler());
    
    // Initialize the buffered event bus
    await this.bufferedEventBus.initialize();
    
    console.log('✅ Event handlers registered and buffered processing initialized\n');
  }
  
  async runDemo(): Promise<void> {
    console.log('📊 Starting event emission with different priorities...\n');
    
    // Create sample events
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
    
    // Emit all events through the buffered event bus
    for (const { event, priority } of events) {
      try {
        const result = await this.bufferedEventBus.emitEvent(event.type, event.payload, { priority });
        const eventId = result.eventId;
        console.log(`✨ Emitted ${event.type} with priority ${priority} (ID: ${eventId})`);
      } catch (error) {
        console.error('❌ Failed to emit event:', error);
      }
      
      // Small delay between emissions to see the queuing effect
      await this.sleep(150);
    }
    
    console.log('\n📊 All events emitted. Processing through buffered system...\n');
  }
  
  async showMetrics(): Promise<void> {
    // Show metrics periodically
    const metricsInterval = setInterval(() => {
      const metrics = this.bufferedEventBus.getMetrics();
      console.log(`📈 Metrics - Queued: ${metrics.queueSize}, Processed: ${metrics.processedEvents}, Failed: ${metrics.failedEvents}, Workers: ${metrics.activeWorkers}`);
      
      // Stop showing metrics when processing is complete
      if (metrics.queueSize === 0 && metrics.processedEvents > 0) {
        clearInterval(metricsInterval);
        
        setTimeout(async () => {
          console.log('\n🎉 All events processed! Final metrics:');
          console.log(this.bufferedEventBus.getMetrics());
          
          await this.shutdown();
        }, 2000);
      }
    }, 1500);
    
    // Safety timeout
    setTimeout(async () => {
      console.log('\n⏰ Demo timeout reached, shutting down...');
      clearInterval(metricsInterval);
      await this.shutdown();
    }, 30000);
  }
  
  async runPerformanceComparison(): Promise<void> {
    console.log('\n🏁 Running Performance Comparison\n');
    
    const eventCount = 20;
    const testEvents = Array.from({ length: eventCount }, (_, i) => 
      new UserRegisteredEvent(`perf_user_${i}`, `user${i}@example.com`, `User ${i}`)
    );
    
    // Test 1: Regular synchronous processing
    console.log('🔄 Testing regular event processing...');
    const regularStart = Date.now();
    
    for (const event of testEvents) {
      this.regularEventBus.emit(event);
    }
    
    // Wait a bit for regular processing
    await this.sleep(2000);
    const regularTime = Date.now() - regularStart;
    console.log(`⏱️ Regular processing: ${regularTime}ms for ${eventCount} events`);
    
    // Test 2: Buffered processing
    console.log('\n🔄 Testing buffered event processing...');
    const bufferedStart = Date.now();
    
    for (const event of testEvents) {
      await this.bufferedEventBus.emitEvent(event.type, event.payload, { priority: 'normal' });
    }
    
    // Wait for buffered processing to complete
    await this.waitForProcessingComplete();
    const bufferedTime = Date.now() - bufferedStart;
    
    console.log(`⏱️ Buffered processing: ${bufferedTime}ms for ${eventCount} events`);
    
    if (bufferedTime < regularTime) {
      console.log(`📊 Buffered processing was ${Math.round(((regularTime - bufferedTime) / regularTime) * 100)}% faster`);
    } else {
      console.log(`📊 Regular processing was ${Math.round(((bufferedTime - regularTime) / bufferedTime) * 100)}% faster`);
    }
  }
  
  private async waitForProcessingComplete(): Promise<void> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const metrics = this.bufferedEventBus.getMetrics();
        if (metrics.queueSize === 0) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }
  
  private async shutdown(): Promise<void> {
    console.log('\n🔄 Shutting down buffered event processing...');
    await this.bufferedEventBus.shutdown();
    console.log('✅ Demo completed successfully!');
    process.exit(0);
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// RUN THE DEMO
// ============================================================================

async function main() {
  const demo = new DemoApplication();
  
  try {
    await demo.initialize();
    await demo.runDemo();
    await demo.showMetrics();
    
    // Uncomment to run performance comparison
    // await demo.runPerformanceComparison();
    
  } catch (error) {
    console.error('💥 Demo failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { DemoApplication };