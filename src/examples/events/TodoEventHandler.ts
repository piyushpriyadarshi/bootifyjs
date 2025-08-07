import { Component } from '../../core/decorators'
import { EventListener, OnEvent } from '../../events/decorators'
import { TodoCreatedEvent } from './todo.events'

@Component()
@EventListener()
class TodoEventHandler {
  @OnEvent('todo.created')
  handle(event: TodoCreatedEvent) {
    console.log('TodoEventHandler', event)
    console.log('TodoCreatedEvent', event)
  }
}
