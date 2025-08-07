import 'reflect-metadata'
import { Component } from '../core/decorators'

export const EVENTS_METADATA_KEYS = {
  eventListener: 'bootify:event-listener',
  onEvent: 'bootify:on-event',
}

/**
 * A class decorator that marks a class as a container for event listeners.
 * The framework will automatically scan these classes for handlers.
 */
export const EventListener = (): ClassDecorator => {
  return (target: any) => {
    Reflect.defineMetadata(EVENTS_METADATA_KEYS.eventListener, true, target)
    // Call the base Component decorator's logic
    Component()(target)
  }
}

/**
 * A method decorator that registers the method as a handler for a specific event type.
 * @param eventType The unique string identifier for the event.
 */
export const OnEvent = (eventType: string): MethodDecorator => {
  return (target: any, propertyKey: string | symbol) => {
    const handlers = Reflect.getMetadata(EVENTS_METADATA_KEYS.onEvent, target.constructor) || []
    handlers.push({
      eventType,
      methodName: propertyKey,
    })
    Reflect.defineMetadata(EVENTS_METADATA_KEYS.onEvent, handlers, target.constructor)
  }
}
