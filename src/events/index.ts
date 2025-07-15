// Core exports
export { EventBus } from './core/event-bus';
export { EventRegistry } from './core/event-registry';

// Type exports
export * from './types/event.types';

// Decorator exports
export { 
  Event,
  EventEmitter,
  EventListener,
  EmitEvent,
  registerEventHandlers
} from './decorators/event.decorators';

// Middleware exports
export { LoggingMiddleware } from './middleware/logging.middleware';
export { ValidationMiddleware } from './middleware/validation.middleware';
export { MetricsMiddleware } from './middleware/metrics.middleware';

// Store exports
export { MemoryEventStore } from './store/memory-event-store';

// Example exports
export * from './examples/user.events';
export * from './examples/user.handlers';
export * from './examples/system.events';

// Configuration and setup
import { EventBus } from './core/event-bus';
import { LoggingMiddleware } from './middleware/logging.middleware';
import { ValidationMiddleware } from './middleware/validation.middleware';
import { MetricsMiddleware } from './middleware/metrics.middleware';
import { registerEventHandlers } from './decorators/event.decorators';
import { UserEventHandlers } from './examples/user.handlers';

// Auto-configure event system
export function configureEventSystem() {
  const eventBus = EventBus.getInstance({
    enableLogging: true,
    enableMetrics: true,
    maxRetries: 3,
    retryDelay: 1000,
    enableDeadLetterQueue: true
  });

  // Add middleware
  eventBus.use(new ValidationMiddleware());
  eventBus.use(new LoggingMiddleware());
  eventBus.use(new MetricsMiddleware());

  // Register event handlers
  registerEventHandlers([UserEventHandlers]);

  return eventBus;
}