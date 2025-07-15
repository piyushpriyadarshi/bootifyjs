import { BaseEvent, EventMiddleware } from '../types/event.types';
import { LoggerService } from '../../logging';
import { ValidationError } from '../../core/errors';

export class ValidationMiddleware implements EventMiddleware {
  name = 'ValidationMiddleware';
  private logger: LoggerService;

  constructor() {
    this.logger = LoggerService.getInstance();
  }

  async execute(event: BaseEvent, next: () => Promise<void>): Promise<void> {
    // Validate required event properties
    this.validateEvent(event);
    
    this.logger.debug('Event validation passed', {
      component: 'EventMiddleware',
      middleware: this.name,
      eventType: event.type,
      eventId: event.id
    });

    await next();
  }

  private validateEvent(event: BaseEvent): void {
    const errors: string[] = [];

    // Required fields validation
    if (!event.id) errors.push('Event ID is required');
    if (!event.type) errors.push('Event type is required');
    if (!event.timestamp) errors.push('Event timestamp is required');
    if (typeof event.version !== 'number') errors.push('Event version must be a number');

    // Type validation
    if (typeof event.id !== 'string') errors.push('Event ID must be a string');
    if (typeof event.type !== 'string') errors.push('Event type must be a string');
    if (!(event.timestamp instanceof Date)) errors.push('Event timestamp must be a Date');

    // Optional fields validation
    if (event.correlationId && typeof event.correlationId !== 'string') {
      errors.push('Correlation ID must be a string');
    }
    if (event.causationId && typeof event.causationId !== 'string') {
      errors.push('Causation ID must be a string');
    }
    if (event.metadata && typeof event.metadata !== 'object') {
      errors.push('Event metadata must be an object');
    }

    if (errors.length > 0) {
      this.logger.error('Event validation failed', new ValidationError(errors.join(', ')), {
        component: 'EventMiddleware',
        middleware: this.name,
        eventType: event.type,
        eventId: event.id,
        errors
      });
      
      throw new ValidationError(`Event validation failed: ${errors.join(', ')}`);
    }
  }
}