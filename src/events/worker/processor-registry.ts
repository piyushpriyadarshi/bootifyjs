import type { IEventHandler } from '../event.types'

/**
 * Worker-side registry of event processors.
 *
 * Handlers live in a user-provided "processors module" — a plain module whose
 * import has the side effect of calling `defineProcessor()` for each event
 * type. The worker imports that module directly: no `new Function` evaluation,
 * no stringified handlers, real stack traces.
 *
 * @example
 * // processors.ts (user code)
 * import { defineProcessor } from 'bootifyjs/events'
 *
 * defineProcessor('todo.created', () => new TodoCreatedHandler())
 */
const processors = new Map<string, () => IEventHandler>()

export function defineProcessor(eventType: string, factory: () => IEventHandler): void {
  processors.set(eventType, factory)
}

export function hasProcessor(eventType: string): boolean {
  return processors.has(eventType)
}

export function getProcessor(eventType: string): IEventHandler | undefined {
  const factory = processors.get(eventType)
  return factory ? factory() : undefined
}

export function getRegisteredEventTypes(): string[] {
  return Array.from(processors.keys())
}

/** Test/debug helper — removes a single registration. */
export function removeProcessor(eventType: string): void {
  processors.delete(eventType)
}
