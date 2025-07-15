import { BaseEvent, EventHandler, EventBusOptions, EventMiddleware, EventMetrics } from '../types/event.types';
import { EventRegistry } from './event-registry';
import { LoggerService } from '../../logging';
import { randomBytes } from 'crypto';
import { DeadLetterEvent } from '../types/event.types';

export class EventBus {
  private static instance: EventBus;
  private registry: EventRegistry;
  private middlewares: EventMiddleware[] = [];
  private metrics: EventMetrics;
  private options: EventBusOptions;
  private logger?: LoggerService;
  private processingTimes: number[] = [];

  private constructor(options: EventBusOptions = {}) {
    this.registry = EventRegistry.getInstance();
    this.options = {
      enableLogging: true,
      enableMetrics: true,
      maxRetries: 3,
      retryDelay: 1000,
      enableDeadLetterQueue: true,
      ...options
    };

    this.metrics = {
      totalEvents: 0,
      eventsByType: {},
      failedEvents: 0,
      averageProcessingTime: 0
    };

    try {
      this.logger = LoggerService.getInstance();
    } catch (error) {
      // Logger not initialized yet
    }
  }

  static getInstance(options?: EventBusOptions): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus(options);
    }
    return EventBus.instance;
  }

  // Add middleware
  use(middleware: EventMiddleware): void {
    this.middlewares.push(middleware);
    
    if (this.logger && this.options.enableLogging) {
      this.logger.debug('Event middleware added', {
        component: 'EventBus',
        middleware: middleware.name,
        totalMiddlewares: this.middlewares.length
      });
    }
  }

  // Emit event
  async emit<T extends BaseEvent>(eventType: string, eventData: Partial<T>): Promise<void> {
    const startTime = Date.now();
    
    // Create complete event
    const event: BaseEvent = {
      id: this.generateEventId(),
      type: eventType,
      timestamp: new Date(),
      version: 1,
      correlationId: eventData.correlationId,
      causationId: eventData.causationId,
      metadata: eventData.metadata,
      ...eventData
    } as BaseEvent;

    if (this.logger && this.options.enableLogging) {
      this.logger.info('Event emitted', {
        component: 'EventBus',
        eventType,
        eventId: event.id,
        correlationId: event.correlationId
      });
    }

    try {
      // Execute middlewares and handlers
      await this.executeMiddlewares(event, async () => {
        await this.processEvent(event);
      });

      // Update metrics
      if (this.options.enableMetrics) {
        this.updateMetrics(event, Date.now() - startTime, false);
      }

    } catch (error) {
      if (this.logger) {
        this.logger.error('Event processing failed', error as Error, {
          component: 'EventBus',
          eventType,
          eventId: event.id
        });
      }

      // Update failure metrics
      if (this.options.enableMetrics) {
        this.updateMetrics(event, Date.now() - startTime, true);
      }

      throw error;
    }
  }

  // Process event with handlers
  private async processEvent(event: BaseEvent): Promise<void> {
    const handlers = this.registry.getHandlers(event.type);
    
    if (handlers.length === 0) {
      if (this.logger && this.options.enableLogging) {
        this.logger.warn('No handlers found for event', {
          component: 'EventBus',
          eventType: event.type,
          eventId: event.id
        });
      }
      return;
    }

    // Execute handlers in parallel (can be changed to sequential if needed)
    const handlerPromises = handlers.map(subscription => 
      this.executeHandler(subscription.handler, event, subscription.id)
    );

    await Promise.all(handlerPromises);
  }

  // Execute single handler with retry logic
  private async executeHandler(
    handler: EventHandler,
    event: BaseEvent,
    subscriptionId: string,
    attempt: number = 1
  ): Promise<void> {
    try {
      await handler.handle(event);
      
      if (this.logger && this.options.enableLogging) {
        this.logger.debug('Event handler executed successfully', {
          component: 'EventBus',
          eventType: event.type,
          eventId: event.id,
          subscriptionId,
          attempt
        });
      }
    } catch (error) {
      if (this.logger) {
        this.logger.error('Event handler failed', error as Error, {
          component: 'EventBus',
          eventType: event.type,
          eventId: event.id,
          subscriptionId,
          attempt
        });
      }

      // Retry logic
      if (attempt < this.options.maxRetries!) {
        if (this.logger) {
          this.logger.info('Retrying event handler', {
            component: 'EventBus',
            eventType: event.type,
            eventId: event.id,
            subscriptionId,
            attempt: attempt + 1,
            maxRetries: this.options.maxRetries
          });
        }

        // Wait before retry
        await this.delay(this.options.retryDelay! * attempt);
        
        return this.executeHandler(handler, event, subscriptionId, attempt + 1);
      }

      // Send to dead letter queue if enabled
      if (this.options.enableDeadLetterQueue) {
        await this.sendToDeadLetterQueue(event, error as Error, subscriptionId);
      }

      throw error;
    }
  }

  // Execute middlewares
  private async executeMiddlewares(event: BaseEvent, next: () => Promise<void>): Promise<void> {
    let index = 0;

    const executeNext = async (): Promise<void> => {
      if (index < this.middlewares.length) {
        const middleware = this.middlewares[index++];
        await middleware.execute(event, executeNext);
      } else {
        await next();
      }
    };

    await executeNext();
  }

  // Send to dead letter queue
  private async sendToDeadLetterQueue(event: BaseEvent, error: Error, subscriptionId: string): Promise<void> {
    if (this.logger) {
      this.logger.error('Event sent to dead letter queue', error, {
        component: 'EventBus',
        eventType: event.type,
        eventId: event.id,
        subscriptionId,
        deadLetterQueue: true
      });
    }

    // Emit dead letter event
    try {
      await this.emit<DeadLetterEvent>('system.event.dead_letter', {
        id: event.id,
        type: event.type,
        failedEventData: JSON.stringify(event),
        error: error.message,
        subscriptionId,
        timestamp: new Date()
      });
    } catch (dlqError) {
      if (this.logger) {
        this.logger.error('Failed to send event to dead letter queue', dlqError as Error, {
          component: 'EventBus',
          originalEventId: event.id
        });
      }
    }
  }

  // Update metrics
  private updateMetrics(event: BaseEvent, processingTime: number, failed: boolean): void {
    this.metrics.totalEvents++;
    this.metrics.eventsByType[event.type] = (this.metrics.eventsByType[event.type] || 0) + 1;
    this.metrics.lastEventTimestamp = event.timestamp;

    if (failed) {
      this.metrics.failedEvents++;
    }

    // Update processing time
    this.processingTimes.push(processingTime);
    if (this.processingTimes.length > 100) {
      this.processingTimes.shift(); // Keep only last 100 measurements
    }
    
    this.metrics.averageProcessingTime = 
      this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length;
  }

  // Get metrics
  getMetrics(): EventMetrics {
    return { ...this.metrics };
  }

  // Get registry
  getRegistry(): EventRegistry {
    return this.registry;
  }

  // Utility methods
  private generateEventId(): string {
    return `evt_${Date.now()}_${randomBytes(8).toString('hex')}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Health check
  isHealthy(): boolean {
    const stats = this.registry.getStatistics();
    return stats.activeSubscriptions > 0;
  }

  // Shutdown gracefully
  async shutdown(): Promise<void> {
    if (this.logger) {
      this.logger.info('Event bus shutting down', {
        component: 'EventBus',
        metrics: this.metrics
      });
    }
  }
}