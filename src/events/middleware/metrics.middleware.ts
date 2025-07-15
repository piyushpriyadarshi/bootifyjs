import { BaseEvent, EventMiddleware } from '../types/event.types';
import { LoggerService } from '../../logging';

export class MetricsMiddleware implements EventMiddleware {
  name = 'MetricsMiddleware';
  private logger: LoggerService;
  private metrics = new Map<string, {
    count: number;
    totalTime: number;
    errors: number;
    lastProcessed: Date;
  }>();

  constructor() {
    this.logger = LoggerService.getInstance();
  }

  async execute(event: BaseEvent, next: () => Promise<void>): Promise<void> {
    const startTime = Date.now();
    let hasError = false;

    try {
      await next();
    } catch (error) {
      hasError = true;
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      this.updateMetrics(event.type, duration, hasError);
      
      // Log performance metrics for slow events
      if (duration > 1000) {
        this.logger.warn('Slow event processing detected', {
          component: 'EventMiddleware',
          middleware: this.name,
          eventType: event.type,
          eventId: event.id,
          duration,
          slow: true
        });
      }
    }
  }

  private updateMetrics(eventType: string, duration: number, hasError: boolean): void {
    const current = this.metrics.get(eventType) || {
      count: 0,
      totalTime: 0,
      errors: 0,
      lastProcessed: new Date()
    };

    current.count++;
    current.totalTime += duration;
    current.lastProcessed = new Date();
    
    if (hasError) {
      current.errors++;
    }

    this.metrics.set(eventType, current);

    // Log metrics periodically
    if (current.count % 10 === 0) {
      this.logger.performance({
        operation: `event.${eventType}`,
        duration: current.totalTime / current.count,
        metadata: {
          totalEvents: current.count,
          totalErrors: current.errors,
          errorRate: (current.errors / current.count) * 100,
          averageTime: current.totalTime / current.count
        }
      });
    }
  }

  getMetrics(): Record<string, any> {
    const result: Record<string, any> = {};
    
    for (const [eventType, metrics] of this.metrics.entries()) {
      result[eventType] = {
        count: metrics.count,
        averageTime: metrics.totalTime / metrics.count,
        errors: metrics.errors,
        errorRate: (metrics.errors / metrics.count) * 100,
        lastProcessed: metrics.lastProcessed
      };
    }
    
    return result;
  }

  resetMetrics(): void {
    this.metrics.clear();
    this.logger.info('Event metrics reset', {
      component: 'EventMiddleware',
      middleware: this.name
    });
  }
}