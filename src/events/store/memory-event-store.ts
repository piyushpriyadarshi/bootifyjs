import { BaseEvent, EventStore } from '../types/event.types';
import { LoggerService } from '../../logging';

export class MemoryEventStore implements EventStore {
  private events: BaseEvent[] = [];
  private eventsByAggregate = new Map<string, BaseEvent[]>();
  private logger: LoggerService;

  constructor() {
    this.logger = LoggerService.getInstance();
  }

  async save(event: BaseEvent): Promise<void> {
    // Store in main events array
    this.events.push(event);
    
    // Store by aggregate if it's a domain event
    if ('aggregateId' in event) {
      const aggregateId = (event as any).aggregateId;
      if (!this.eventsByAggregate.has(aggregateId)) {
        this.eventsByAggregate.set(aggregateId, []);
      }
      this.eventsByAggregate.get(aggregateId)!.push(event);
    }

    this.logger.debug('Event saved to store', {
      component: 'EventStore',
      eventType: event.type,
      eventId: event.id,
      totalEvents: this.events.length
    });
  }

  async getEvents(aggregateId: string, fromVersion?: number): Promise<BaseEvent[]> {
    const aggregateEvents = this.eventsByAggregate.get(aggregateId) || [];
    
    if (fromVersion !== undefined) {
      return aggregateEvents.filter(event => 
        'aggregateVersion' in event && (event as any).aggregateVersion >= fromVersion
      );
    }
    
    return [...aggregateEvents];
  }

  async getAllEvents(eventType?: string, fromTimestamp?: Date): Promise<BaseEvent[]> {
    let filteredEvents = [...this.events];
    
    if (eventType) {
      filteredEvents = filteredEvents.filter(event => event.type === eventType);
    }
    
    if (fromTimestamp) {
      filteredEvents = filteredEvents.filter(event => event.timestamp >= fromTimestamp);
    }
    
    return filteredEvents.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  // Additional utility methods
  async getEventCount(): Promise<number> {
    return this.events.length;
  }

  async getEventTypes(): Promise<string[]> {
    const types = new Set(this.events.map(event => event.type));
    return Array.from(types);
  }

  async getEventsByTimeRange(startTime: Date, endTime: Date): Promise<BaseEvent[]> {
    return this.events.filter(event => 
      event.timestamp >= startTime && event.timestamp <= endTime
    );
  }

  async clear(): Promise<void> {
    this.events = [];
    this.eventsByAggregate.clear();
    
    this.logger.info('Event store cleared', {
      component: 'EventStore'
    });
  }

  // Get statistics
  getStatistics(): {
    totalEvents: number;
    eventsByType: Record<string, number>;
    aggregateCount: number;
    oldestEvent?: Date;
    newestEvent?: Date;
  } {
    const eventsByType: Record<string, number> = {};
    
    this.events.forEach(event => {
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
    });

    const timestamps = this.events.map(e => e.timestamp).sort((a, b) => a.getTime() - b.getTime());

    return {
      totalEvents: this.events.length,
      eventsByType,
      aggregateCount: this.eventsByAggregate.size,
      oldestEvent: timestamps[0],
      newestEvent: timestamps[timestamps.length - 1]
    };
  }
}