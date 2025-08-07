import { Autowired, Component, Service } from '../../core/decorators'
import { EventBusService } from '../../events/event-bus.service'
import { TodoCreatedEvent } from '../events/todo.events'
import { TodoRepository } from '../repositories/todo.repository'

@Service()
export class TodoService {
  // constructor(private readonly repository: TodoRepository) { }

  @Autowired()
  private readonly eventBus!: EventBusService

  @Autowired()
  private readonly repository!: TodoRepository

  getAllTodos() {
    return this.repository.findAll()
  }

  getTodoById(id: string) {
    const todo = this.repository.findById(id)
    if (!todo) {
      const error: any = new Error('Todo not found')
      error.statusCode = 404
      throw error
    }
    return todo
  }

  createTodo(text: string) {
    const newTodo = this.repository.create(text)
    this.eventBus.emit(new TodoCreatedEvent({ ...newTodo, createdAt: new Date() }))
    return newTodo
  }
}

export interface Animal {
  name: string
  sound(): void
}

@Component({
  bindTo: ['Animal'],
})
export class Dog implements Animal {
  name: string = 'Good Dog'
  sound(): void {
    throw new Error('Method not implemented.')
  }
}

@Component()
export class AnimalService {
  @Autowired('Animal')
  public animal1!: Animal
  constructor(@Autowired('Animal') public readonly animal: Animal) {}
}
