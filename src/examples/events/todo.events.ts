import { IEvent } from '../../events/event.types';

// This is our strongly-typed event class.
// Note: TodoEventHandler is imported in the main index.ts to avoid circular dependency

export class TodoCreatedEvent implements IEvent {
  readonly type = 'todo.created' // Unique event identifier

  constructor(public payload: { id: string; text: string; createdAt: Date }) { }
}
