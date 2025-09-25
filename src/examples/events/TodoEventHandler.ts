import { Component } from '../../core/decorators'
import { EventListener, OnEvent } from '../../events/decorators'
import { TodoCreatedEvent } from './todo.events'

@Component({ eager: true })
@EventListener()
export class TodoEventHandler {
  @OnEvent('todo.created')
  handle(event: TodoCreatedEvent) {
    console.log('🎯 TodoEventHandler.handle() called!')
    console.log('📧 Event received:', event)
    console.log('📧 Event type:', event?.type)
    console.log('📧 Event payload:', event?.payload)
  }
}
