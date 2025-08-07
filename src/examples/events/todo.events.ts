import { IEvent } from '../../events/event.types'

// This is our strongly-typed event class.
import './TodoEventHandler'

export class TodoCreatedEvent implements IEvent {
  readonly type = 'todo.created' // Unique event identifier

  constructor(public payload: { id: string; text: string; createdAt: Date }) {}
}
