export interface BaseEvent {
  id: string;
  type: string;
  timestamp: Date;
  version: number;
  correlationId?: string;
  causationId?: string;
  metadata?: Record<string, any>;
}

export interface DomainEvent extends BaseEvent {
  aggregateId: string;
  aggregateType: string;
  aggregateVersion: number;
}

export interface SystemEvent extends BaseEvent {
  source: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface DeadLetterEvent extends BaseEvent {
  failedEventData: string;
  error: string;
  subscriptionId: string;
}

export interface EventHandler<T extends BaseEvent = BaseEvent> {
  handle(event: T): Promise<void> | void;
}

export interface EventSubscription {
  id: string;
  eventType: string;
  handler: EventHandler;
  priority: number;
  active: boolean;
  metadata?: Record<string, any>;
}

export interface EventBusOptions {
  enableLogging?: boolean;
  enableMetrics?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  enableDeadLetterQueue?: boolean;
}

export interface EventMiddleware {
  name: string;
  execute(event: BaseEvent, next: () => Promise<void>): Promise<void>;
}

export interface EventStore {
  save(event: BaseEvent): Promise<void>;
  getEvents(aggregateId: string, fromVersion?: number): Promise<BaseEvent[]>;
  getAllEvents(eventType?: string, fromTimestamp?: Date): Promise<BaseEvent[]>;
}

export interface EventMetrics {
  totalEvents: number;
  eventsByType: Record<string, number>;
  failedEvents: number;
  averageProcessingTime: number;
  lastEventTimestamp?: Date;
}