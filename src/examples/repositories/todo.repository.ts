import { Repository } from '../../core/decorators'

@Repository()
export class TodoRepository {
  private todos: Map<string, { id: string; text: string; completed: boolean }> = new Map()
  private nextId = 1

  findAll() {
    return Array.from(this.todos.values())
  }

  findById(id: string) {
    return this.todos.get(id)
  }

  create(text: string) {
    const id = (this.nextId++).toString()
    const todo = { id, text, completed: false }
    this.todos.set(id, todo)
    return todo
  }
}
