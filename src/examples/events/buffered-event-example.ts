import { Service, Autowired } from '../../core/decorators';
import { EventListener, OnEvent } from '../../events/decorators';
import { BufferedEventBusService, EventBusService } from '../../events';
import { IEvent } from '../../events/event.types';

/**
 * Example events for demonstrating buffered processing
 */
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

export class OrderProcessedEvent implements IEvent {
  readonly type = 'order.processed';
  
  constructor(
    public readonly orderId: string,
    public readonly userId: string,
    public readonly amount: number,
    public readonly timestamp: number = Date.now(),
    public correlationId?: string
  ) {}
  
  get payload() {
    return {
      orderId: this.orderId,
      userId: this.userId,
      amount: this.amount,
      timestamp: this.timestamp
    };
  }
}

/**
 * Service demonstrating both regular and buffered event processing
 */
@Service()
export class EventProcessingDemoService {
  constructor(
    @Autowired() private readonly eventBus: EventBusService,
    @Autowired() private readonly bufferedEventBus?: BufferedEventBusService
  ) {}

  /**
   * Emit events using regular event bus (synchronous processing)
   */
  async emitRegularEvents() {
    console.log('🔄 Emitting events via regular EventBus...');
    
    // These will be processed synchronously on the main thread
    this.eventBus.emit(new UserRegisteredEvent('user-123', 'user@example.com'));
    this.eventBus.emit(new OrderProcessedEvent('order-456', 'user-123', 99.99));
    
    console.log('✅ Regular events emitted');
  }

  /**
   * Emit events using buffered event bus (asynchronous worker processing)
   */
  async emitBufferedEvents() {
    if (!this.bufferedEventBus) {
      console.log('⚠️ Buffered event bus not available');
      return;
    }

    console.log('🔄 Emitting events via BufferedEventBus...');
    
    // These will be processed asynchronously by worker threads
    const result1 = await this.bufferedEventBus.emitEvent(
      'user.registered',
      { userId: 'user-789', email: 'buffered@example.com' },
      { priority: 'normal' }
    );
    
    const result2 = await this.bufferedEventBus.emitEvent(
      'order.processed',
      { orderId: 'order-101', userId: 'user-789', amount: 149.99 },
      { priority: 'critical' }
    );
    
    console.log('✅ Buffered events emitted:', { result1, result2 });
  }

  /**
   * Get metrics from buffered event processing
   */
  getBufferedEventMetrics() {
    if (!this.bufferedEventBus) {
      return null;
    }
    
    return this.bufferedEventBus.getMetrics();
  }

  /**
   * Get health status of buffered event processing
   */
  async getBufferedEventHealth() {
    if (!this.bufferedEventBus) {
      return null;
    }
    
    return await this.bufferedEventBus.getHealthStatus();
  }
}

/**
 * Event handlers that will process both regular and buffered events
 */
@EventListener()
export class UserEventHandler {
  @OnEvent('user.registered')
  async handleUserRegistered(event: UserRegisteredEvent) {
    console.log(`📧 Processing user registration for ${event.email} (ID: ${event.userId})`);
    
    // Simulate some processing time
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log(`✅ Welcome email sent to ${event.email}`);
  }
}

@EventListener()
export class OrderEventHandler {
  @OnEvent('order.processed')
  async handleOrderProcessed(event: OrderProcessedEvent) {
    console.log(`📦 Processing order ${event.orderId} for user ${event.userId} ($${event.amount})`);
    
    // Simulate some processing time
    await new Promise(resolve => setTimeout(resolve, 200));
    
    console.log(`✅ Order ${event.orderId} processed successfully`);
  }
}

/**
 * Example usage function
 */
export async function runBufferedEventExample() {
  console.log('\n🚀 Buffered Event Processing Example\n');
  
  // This would typically be injected via DI
  const demoService = new EventProcessingDemoService(
    new EventBusService(),
    // BufferedEventBusService would be available if initialized in bootstrap
  );
  
  // Emit regular events
  await demoService.emitRegularEvents();
  
  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Emit buffered events (if available)
  await demoService.emitBufferedEvents();
  
  // Show metrics (if available)
  const metrics = demoService.getBufferedEventMetrics();
  if (metrics) {
    console.log('📊 Buffered Event Metrics:', metrics);
  }
  
  // Show health status (if available)
  const health = await demoService.getBufferedEventHealth();
  if (health) {
    console.log('🏥 Buffered Event Health:', health);
  }
  
  console.log('\n✅ Example completed\n');
}