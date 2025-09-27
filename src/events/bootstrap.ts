import { container, Constructor } from '../core/di-container'
import { EventBusService } from './event-bus.service'
import { BufferedEventBusService } from './buffered-event-bus.service'
import { EVENTS_METADATA_KEYS } from './decorators'
import { IEventHandler } from './event.types'

/**
 * Bootstrap options for the event system
 */
export interface EventSystemBootstrapOptions {
  useBufferedProcessing?: boolean;
  bufferedEventConfig?: any;
}

/**
 * Scans all registered DI components for EventListeners and subscribes
 * their handlers to the EventBus. Should be called once at application startup.
 * @param components An array of all registered service/controller constructors.
 * @param options Bootstrap options for event system configuration
 */
export function bootstrapEventSystem(components: Constructor[], options: EventSystemBootstrapOptions = {}) {
  console.log('🔄 Bootstrapping Event System...')
  
  // Initialize both event bus services
  const eventBus = container.resolve<EventBusService>(EventBusService) as any
  let bufferedEventBus: BufferedEventBusService | null = null
  
  if (options.useBufferedProcessing) {
    console.log('  - Initializing Buffered Event Processing...')
    bufferedEventBus = new BufferedEventBusService(options.bufferedEventConfig || {})
    // Register the buffered event bus in the container for DI
    container.register(BufferedEventBusService, { useFactory: () => bufferedEventBus })
  }

  for (const component of components) {
    const isListener = Reflect.getMetadata(EVENTS_METADATA_KEYS.eventListener, component)
    if (!isListener) {
      continue
    }

    const handlers = Reflect.getMetadata(EVENTS_METADATA_KEYS.onEvent, component) || []
    if (handlers.length === 0) {
      continue
    }

    // Get the singleton instance of the listener class from the DI container
    const listenerInstance = container.resolve(component) as any

    console.log(`  - Found listener: ${component.name}`)

    for (const handlerInfo of handlers) {
      const handler: IEventHandler = {
        handle: listenerInstance[handlerInfo.methodName].bind(listenerInstance),
      } as IEventHandler

      // Register with regular event bus
      eventBus.subscribe(handlerInfo.eventType, handler)
      
      // Also register with buffered event bus if enabled
      if (bufferedEventBus) {
        bufferedEventBus.registerHandler(handlerInfo.eventType, handler)
      }
      
      console.log(
        `    ✓ Registered handler for '${handlerInfo.eventType}' -> ${handlerInfo.methodName}()${bufferedEventBus ? ' (buffered)' : ''}`
      )
    }
  }
  // Initialize buffered event bus if enabled
  if (bufferedEventBus) {
    bufferedEventBus.initialize().then(() => {
      console.log('✅ Buffered Event System initialized successfully!')
    }).catch((error) => {
      console.error('❌ Failed to initialize Buffered Event System:', error)
    })
  }
  
  console.log('✅ Event System bootstrapped successfully!\n')
  
  // Return the initialized event system components
  return {
    eventBus,
    bufferedEventBus
  }
}
