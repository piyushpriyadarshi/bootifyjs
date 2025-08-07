import { container, Constructor } from '../core/di-container'
import { EventBusService } from './event-bus.service'
import { EVENTS_METADATA_KEYS } from './decorators'
import { IEventHandler } from './event.types'

/**
 * Scans all registered DI components for EventListeners and subscribes
 * their handlers to the EventBus. Should be called once at application startup.
 * @param components An array of all registered service/controller constructors.
 */
export function bootstrapEventSystem(components: Constructor[]) {
  console.log('🔄 Bootstrapping Event System...')
  const eventBus = container.resolve<EventBusService>(EventBusService) as any

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

      eventBus.subscribe(handlerInfo.eventType, handler)
      console.log(
        `    ✓ Registered handler for '${handlerInfo.eventType}' -> ${handlerInfo.methodName}()`
      )
    }
  }
  console.log('✅ Event System bootstrapped successfully!\n')
}
