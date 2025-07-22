import 'reflect-metadata'
import { BaseEvent, EventHandler, EventSubscription } from '../types/event.types'
import { LoggerService } from '../../logging'

export class EventRegistry {
  private static instance: EventRegistry
  private subscriptions = new Map<string, EventSubscription[]>()
  private eventTypes = new Map<string, new () => BaseEvent>()
  private logger?: LoggerService

  private constructor() {
    try {
      this.logger = LoggerService.getInstance()
    } catch (error) {
      // Logger not initialized yet
    }
  }

  static getInstance(): EventRegistry {
    if (!EventRegistry.instance) {
      EventRegistry.instance = new EventRegistry()
    }
    return EventRegistry.instance
  }

  // Register event type for type safety
  registerEventType<T extends BaseEvent>(eventType: string, eventClass: new () => T): void {
    this.eventTypes.set(eventType, eventClass as new () => BaseEvent)

    if (this.logger) {
      this.logger.debug('Event type registered', {
        component: 'EventRegistry',
        eventType,
        eventClass: eventClass.name,
      })
    }
  }

  // Register event handler
  registerHandler<T extends BaseEvent>(
    eventType: string,
    handler: EventHandler<T>,
    options: {
      priority?: number
      metadata?: Record<string, any>
    } = {}
  ): string {
    const subscription: EventSubscription = {
      id: this.generateSubscriptionId(),
      eventType,
      handler: handler as EventHandler,
      priority: options.priority || 0,
      active: true,
      metadata: options.metadata,
    }

    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, [])
    }

    const handlers = this.subscriptions.get(eventType)!
    handlers.push(subscription)

    // Sort by priority (higher priority first)
    handlers.sort((a, b) => b.priority - a.priority)

    if (this.logger) {
      this.logger.debug('Event handler registered', {
        component: 'EventRegistry',
        eventType,
        subscriptionId: subscription.id,
        priority: subscription.priority,
        totalHandlers: handlers.length,
      })
    }

    return subscription.id
  }

  // Get handlers for event type
  getHandlers(eventType: string): EventSubscription[] {
    return this.subscriptions.get(eventType)?.filter((sub) => sub.active) || []
  }

  // Get all registered event types
  getRegisteredEventTypes(): string[] {
    return Array.from(this.eventTypes.keys())
  }

  // Get all subscriptions
  getAllSubscriptions(): Map<string, EventSubscription[]> {
    return new Map(this.subscriptions)
  }

  // Unregister handler
  unregisterHandler(subscriptionId: string): boolean {
    for (const [eventType, handlers] of this.subscriptions.entries()) {
      const index = handlers.findIndex((sub) => sub.id === subscriptionId)
      if (index !== -1) {
        handlers.splice(index, 1)

        if (this.logger) {
          this.logger.debug('Event handler unregistered', {
            component: 'EventRegistry',
            eventType,
            subscriptionId,
          })
        }

        return true
      }
    }
    return false
  }

  // Deactivate handler
  deactivateHandler(subscriptionId: string): boolean {
    for (const handlers of this.subscriptions.values()) {
      const subscription = handlers.find((sub) => sub.id === subscriptionId)
      if (subscription) {
        subscription.active = false

        if (this.logger) {
          this.logger.debug('Event handler deactivated', {
            component: 'EventRegistry',
            subscriptionId,
          })
        }

        return true
      }
    }
    return false
  }

  // Activate handler
  activateHandler(subscriptionId: string): boolean {
    for (const handlers of this.subscriptions.values()) {
      const subscription = handlers.find((sub) => sub.id === subscriptionId)
      if (subscription) {
        subscription.active = true

        if (this.logger) {
          this.logger.debug('Event handler activated', {
            component: 'EventRegistry',
            subscriptionId,
          })
        }

        return true
      }
    }
    return false
  }

  // Validate event type
  isValidEventType(eventType: string): boolean {
    return this.eventTypes.has(eventType)
  }

  // Create event instance
  createEventInstance<T extends BaseEvent>(eventType: string): T | null {
    const EventClass = this.eventTypes.get(eventType)
    if (!EventClass) {
      return null
    }
    return new EventClass() as T
  }

  // Get registry statistics
  getStatistics(): {
    totalEventTypes: number
    totalSubscriptions: number
    subscriptionsByType: Record<string, number>
    activeSubscriptions: number
  } {
    let totalSubscriptions = 0
    let activeSubscriptions = 0
    const subscriptionsByType: Record<string, number> = {}

    for (const [eventType, handlers] of this.subscriptions.entries()) {
      subscriptionsByType[eventType] = handlers.length
      totalSubscriptions += handlers.length
      activeSubscriptions += handlers.filter((sub) => sub.active).length
    }

    return {
      totalEventTypes: this.eventTypes.size,
      totalSubscriptions,
      subscriptionsByType,
      activeSubscriptions,
    }
  }

  private generateSubscriptionId(): string {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  // Clear all registrations (for testing)
  clear(): void {
    this.subscriptions.clear()
    this.eventTypes.clear()

    if (this.logger) {
      this.logger.debug('Event registry cleared', {
        component: 'EventRegistry',
      })
    }
  }
  logRegisteredEvents(): void {
    // if (!this.logger) return

    const allSubscriptions: {
      eventType: string
      handler: string
      priority: number
      active: boolean
    }[] = []
    this.subscriptions.forEach((subs, eventType) => {
      subs.forEach((sub) => {
        allSubscriptions.push({
          eventType,
          handler:
            sub.handler.constructor.name === 'Object' ? 'Anonymous' : sub.handler.constructor.name,
          priority: sub.priority,
          active: sub.active,
        })
      })
    })

    console.log('\n📋 Registered Event Handlers:')
    console.log('─'.repeat(100))
    console.log(
      'Event Type'.padEnd(30) + 'Handler'.padEnd(30) + 'Priority'.padEnd(10) + 'Status'.padEnd(10)
    )
    console.log('─'.repeat(100))

    const sortedSubscriptions = [...allSubscriptions].sort((a, b) =>
      a.eventType.localeCompare(b.eventType)
    )

    sortedSubscriptions.forEach((sub) => {
      const eventType = sub.eventType.padEnd(30)
      const handler = sub.handler.padEnd(30)
      const priority = sub.priority.toString().padEnd(10)
      const status = (sub.active ? '🟢 Active' : '🔴 Inactive').padEnd(10)
      console.log(`${eventType}${handler}${priority}${status}`)
    })

    console.log('─'.repeat(100))
    console.log(`Total: ${allSubscriptions.length} handlers registered\n`)
  }
}
