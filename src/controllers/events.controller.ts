import { Controller, Get, Post, Body, Param, Query } from '../core/decorators';
import { EventBus, EventRegistry, MemoryEventStore } from '../events';
import { BaseEvent } from '../events/types/event.types';

@Controller('/events')
export class EventsController {
  private eventBus: EventBus;
  private registry: EventRegistry;
  private eventStore: MemoryEventStore;

  constructor() {
    this.eventBus = EventBus.getInstance();
    this.registry = EventRegistry.getInstance();
    this.eventStore = new MemoryEventStore();
  }

  @Get('/metrics')
  getEventMetrics() {
    return {
      busMetrics: this.eventBus.getMetrics(),
      registryStats: this.registry.getStatistics(),
      storeStats: this.eventStore.getStatistics()
    };
  }

  @Get('/types')
  getEventTypes() {
    return {
      registeredTypes: this.registry.getRegisteredEventTypes(),
      totalTypes: this.registry.getRegisteredEventTypes().length
    };
  }

  @Get('/subscriptions')
  getSubscriptions() {
    const subscriptions = this.registry.getAllSubscriptions();
    const result: Record<string, any[]> = {};
    
    for (const [eventType, subs] of subscriptions.entries()) {
      result[eventType] = subs.map(sub => ({
        id: sub.id,
        priority: sub.priority,
        active: sub.active,
        metadata: sub.metadata
      }));
    }
    
    return result;
  }

  @Get('/health')
  getEventSystemHealth() {
    return {
      healthy: this.eventBus.isHealthy(),
      metrics: this.eventBus.getMetrics(),
      timestamp: new Date().toISOString()
    };
  }

  @Post('/emit')
  async emitEvent(@Body() eventData: { type: string; data: any }) {
    try {
      await this.eventBus.emit(eventData.type, eventData.data);
      return {
        success: true,
        message: `Event ${eventData.type} emitted successfully`,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to emit event: ${(error as Error).message}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  @Get('/history')
  async getEventHistory(
    @Query('type') eventType?: string,
    @Query('limit') limit?: string
  ) {
    const events = await this.eventStore.getAllEvents(eventType);
    const limitNum = limit ? parseInt(limit, 10) : 50;
    
    return {
      events: events.slice(-limitNum).reverse(), // Most recent first
      total: events.length,
      filtered: !!eventType
    };
  }

  @Get('/stats')
  getEventStats() {
    return {
      system: {
        healthy: this.eventBus.isHealthy(),
        uptime: process.uptime()
      },
      registry: this.registry.getStatistics(),
      bus: this.eventBus.getMetrics(),
      store: this.eventStore.getStatistics()
    };
  }
}