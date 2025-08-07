import { EventEmitter } from 'events'
import { Service, Autowired } from '../core/decorators'
import { IEvent, IEventHandler } from './event.types'
import { RequestContextService } from '../core/request-context.service'

interface EventBusOptions {
  maxRetries?: number
  retryDelayMs?: number
}

@Service()
export class EventBusService {
  private readonly emitter = new EventEmitter()
  private readonly deadLetterQueue: IEvent[] = []
  private readonly options: Required<EventBusOptions>

  constructor() {
    // Default options can be extended via a ConfigService
    this.options = {
      maxRetries: 3,
      retryDelayMs: 500,
    }
    // Increase max listeners to avoid warnings for many handlers
    this.emitter.setMaxListeners(50)
  }

  /**
   * Subscribes an event handler to a specific event type.
   * This is used internally by the framework during bootstrap.
   */
  subscribe<T extends IEvent>(eventType: string, handler: IEventHandler<T>): void {
    this.emitter.on(eventType, async (event: T) => {
      let attempt = 0
      while (attempt < this.options.maxRetries) {
        try {
          console.log(`[EventBus] Attempt ${attempt + 1}: Handling event '${event.type}'`)
          await handler.handle(event)
          return // Success, exit loop
        } catch (error) {
          attempt++
          console.error(
            `[EventBus] Error handling event '${event.type}' (Attempt ${attempt})`,
            error
          )
          if (attempt >= this.options.maxRetries) {
            console.error(
              `[EventBus] Event '${event.type}' failed after ${this.options.maxRetries} attempts. Moving to DLQ.`
            )
            this.deadLetterQueue.push(event)
          } else {
            // Wait before retrying
            await new Promise((res) => setTimeout(res, this.options.retryDelayMs * attempt))
          }
        }
      }
    })
  }

  /**
   * Emits an event to all registered listeners.
   */
  emit(event: IEvent): void {
    // Enrich event with correlationId from the current request context
    const contextService = new RequestContextService()
    event.correlationId = contextService.get<string>('requestId')

    console.log(`[EventBus] Emitting event '${event.type}'`, { correlationId: event.correlationId })
    this.emitter.emit(event.type, event)
  }

  /**
   * Retrieves all events that have failed all retry attempts.
   */
  getDeadLetterQueue(): IEvent[] {
    return [...this.deadLetterQueue]
  }
}
