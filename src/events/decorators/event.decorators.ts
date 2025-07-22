import 'reflect-metadata'
import { BaseEvent, EventHandler } from '../types/event.types'
import { EventRegistry } from '../core/event-registry'
import { EventBus } from '../core/event-bus'
import { container } from '../../core/container'

// Event class decorator
export function Event(eventType: string): ClassDecorator {
  return function (target: any) {
    const registry = EventRegistry.getInstance()
    registry.registerEventType(eventType, target)

    // Store event type metadata
    Reflect.defineMetadata('event:type', eventType, target)

    return target
  }
}

// Event handler method decorator
export function EventHandler<T extends BaseEvent = BaseEvent>(
  eventType: string,
  options: {
    priority?: number
    metadata?: Record<string, any>
  } = {}
): MethodDecorator {
  return function (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value

    // Store handler metadata
    const handlers = Reflect.getMetadata('event:handlers', target.constructor) || []
    handlers.push({
      eventType,
      methodName: propertyKey,
      options,
    })
    Reflect.defineMetadata('event:handlers', handlers, target.constructor)

    return descriptor
  }
}

// Event emitter class decorator
export function EventEmitter(): ClassDecorator {
  return function (target: any) {
    // Add eventBus property to the class
    Object.defineProperty(target.prototype, 'eventBus', {
      get: function () {
        if (!this._eventBus) {
          this._eventBus = EventBus.getInstance()
        }
        return this._eventBus
      },
      enumerable: false,
      configurable: false,
    })

    // Store emitter metadata
    Reflect.defineMetadata('event:emitter', true, target)

    return target
  }
}

// Event listener class decorator (auto-registers handlers)
// export function EventListener(): ClassDecorator {
//   return function (target: any) {
//     // Register the class in the container
//     container.register(target);

//     // Store listener metadata
//     Reflect.defineMetadata('event:listener', true, target);

//     return target;
//   };
// }

export function EventListener(): ClassDecorator {
  return function (target: any) {
    // Register the class in the container
    container.register(target)

    // Store listener metadata
    Reflect.defineMetadata('event:listener', true, target)

    // Get all event handlers from the class
    const handlers = Reflect.getMetadata('event:handlers', target) || []
    if (handlers.length > 0) {
      const registry = EventRegistry.getInstance()
      const instance = container.resolve(target)

      // Register each handler
      handlers.forEach((handlerInfo: any) => {
        const handler: EventHandler = {
          handle: async (event: BaseEvent) => {
            const instanceMethod = (instance as any)[handlerInfo.methodName]
            if (typeof instanceMethod === 'function') {
              await instanceMethod.call(instance, event)
            } else {
              throw new Error(
                `Method ${String(handlerInfo.methodName)} not found on handler instance`
              )
            }
          },
        }

        registry.registerHandler(handlerInfo.eventType, handler, handlerInfo.options)
      })
    }

    return target
  }
}
// Helper function to register all event handlers from decorated classes
export function registerEventHandlers(classes: any[]): void {
  const registry = EventRegistry.getInstance()

  classes.forEach((ClassConstructor) => {
    const isListener = Reflect.getMetadata('event:listener', ClassConstructor)
    if (!isListener) return

    const handlers = Reflect.getMetadata('event:handlers', ClassConstructor) || []
    if (handlers.length === 0) return

    // Create instance
    const instance = container.resolve(ClassConstructor)

    // Register each handler
    handlers.forEach((handlerInfo: any) => {
      const handler: EventHandler = {
        handle: async (event: BaseEvent) => {
          const instanceMethod = (instance as any)[handlerInfo.methodName]
          if (typeof instanceMethod === 'function') {
            await instanceMethod.call(instance, event)
          } else {
            throw new Error(
              `Method ${String(handlerInfo.methodName)} not found on handler instance`
            )
          }
        },
      }

      registry.registerHandler(handlerInfo.eventType, handler, handlerInfo.options)
    })
  })
}

// Emit decorator for methods (automatically emits events after method execution)
export function EmitEvent<T extends BaseEvent = BaseEvent>(
  eventType: string,
  eventDataFactory?: (result: any, args: any[]) => Partial<T>
): MethodDecorator {
  return function (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value

    descriptor.value = async function (...args: any[]) {
      const result = await originalMethod.apply(this, args)

      // Get event bus
      const eventBus = EventBus.getInstance()

      // Create event data
      let eventData: Partial<T> = {}
      if (eventDataFactory) {
        eventData = eventDataFactory(result, args)
      } else {
        // Create a safe default payload
        eventData = {
          data: { result, args },
          timestamp: new Date(),
        } as unknown as Partial<T>
      }

      // Emit event
      await eventBus.emit(eventType, eventData)

      return result
    }

    return descriptor
  }
}
