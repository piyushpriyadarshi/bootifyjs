/**
 * The base interface for all events.
 * It ensures that every event has a unique type identifier.
 */
export interface IEvent {
  readonly type: string
  payload: any
  correlationId?: string // Optional: To trace a chain of events
}

/**
 * Defines the shape of an event handler. It's a class with
 * a 'handle' method for a specific event type.
 */
export interface IEventHandler<T extends IEvent = IEvent> {
  handle(event: T): Promise<void> | void
}
