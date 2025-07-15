import { BaseEvent, EventMiddleware } from '../types/event.types';
import { LoggerService } from '../../logging';

export class LoggingMiddleware implements EventMiddleware {
  name = 'LoggingMiddleware';
  private logger: LoggerService;

  constructor() {
    this.logger = LoggerService.getInstance();
  }

  async execute(event: BaseEvent, next: () => Promise<void>): Promise<void> {
    const startTime = Date.now();
    
    this.logger.info('Event processing started', {
      component: 'EventMiddleware',
      middleware: this.name,
      eventType: event.type,
      eventId: event.id,
      correlationId: event.correlationId
    });

    try {
      await next();
      
      const duration = Date.now() - startTime;
      this.logger.info('Event processing completed', {
        component: 'EventMiddleware',
        middleware: this.name,
        eventType: event.type,
        eventId: event.id,
        duration
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Event processing failed', error as Error, {
        component: 'EventMiddleware',
        middleware: this.name,
        eventType: event.type,
        eventId: event.id,
        duration
      });
      throw error;
    }
  }
}