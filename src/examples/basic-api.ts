import cluster, { Worker } from 'cluster'
import os from 'os'
import { createBootifyApp } from '../api'
import { Controller, Get, Post, Body, Service, Repository } from '../core/decorators'
import {
  EventEmitter,
  Event,
  EventBus,
  EventListener,
  BaseEvent,
  registerEventHandlers,
} from '../events'
import { EventHandler } from '../events/decorators/event.decorators'
// import { EventHandler } from '../events/types/event.types'
import { LogContextService, Logger, LoggerService } from '../logging'
// import logger from '../client/Logger'
import { requestContext } from '../middlewares/requestcontext.middleware'
import { FastifyAdapter } from '../core/fastify-adapter'
import { UserController } from '../controllers/user.controller'

// Define a simple repository
@Repository()
@Logger('TodoRepository')
class TodoRepository {
  private todos: { id: string; text: string; completed: boolean }[] = []

  findAll() {
    return this.todos
  }

  findById(id: string) {
    return this.todos.find((todo) => todo.id === id)
  }

  create(text: string) {
    const todo = {
      id: Date.now().toString(),
      text,
      completed: false,
    }
    this.todos.push(todo)
    return todo
  }

  update(id: string, updates: Partial<{ text: string; completed: boolean }>) {
    const todo = this.findById(id)
    if (!todo) return null

    Object.assign(todo, updates)
    return todo
  }

  delete(id: string) {
    const index = this.todos.findIndex((todo) => todo.id === id)
    if (index === -1) return false

    this.todos.splice(index, 1)
    return true
  }
}

// Define a service
@Service()
@Logger('TodoService')
@EventEmitter()
class TodoService {
  private logger!: any
  eventBus: any
  // private eventBus!: typeof EventBus

  constructor(private repository: TodoRepository) {}

  getAllTodos() {
    // logger.info('hello')
    this.logger.info('Getting all todos')
    return this.repository.findAll()
  }

  createTodo(text: string) {
    this.logger.info('Creating new todo', { text })
    this.eventBus.emit('todo.created', {
      id: Date.now().toString(),
      type: 'todo.created',
      timestamp: new Date(),
      version: 1,
      text,
      completed: false,
    })
    return this.repository.create(text)
  }
}

@Event('todo.created')
class TodoCreatedEvent {
  // id!: string
  type: string = 'todo.created'
  timestamp!: Date
  version: number = 1
  correlationId?: string
  causationId?: string
  metadata?: Record<string, any>
  id: string = ''
  text: string = ''
  completed: boolean = false
  constructor(data?: Partial<TodoCreatedEvent>) {
    if (data) {
      Object.assign(this, data)
    }
  }
}
@EventListener()
class TodoEventHandlers {
  @EventHandler('todo.created')
  async onTodoCreated(event: TodoCreatedEvent) {
    console.log(`Todo created: ${event.text}`)
    // Send welcome email, update analytics, etc.
  }
}

// Define a controller
@Controller('/todos')
@Logger('TodoController')
class TodoController {
  private logger?: LoggerService
  constructor(private todoService: TodoService) {}

  @Get('/')
  getAllTodos() {
    console.log('LogContextService.getContext()', LogContextService.getContext())
    this.logger?.info('Hello from controller')
    LoggerService.getInstance().info('hello from controller')
    // console.log(requestContext.getStore())
    // logger.info('hello from controller')

    return this.todoService.getAllTodos()
  }

  @Post('/')
  createTodo(@Body() body: { text: string }) {
    return this.todoService.createTodo(body.text)
  }
}

@Controller('/api')
class HealthController {
  constructor(private todoService: TodoService) {}

  @Get('/health')
  getAllTodos() {
    return { message: 'ok' }
  }
}
// Start the application
async function main() {
  // Register event handlers
  // registerEventHandlers([TodoEventHandlers])

  const { start, app } = await createBootifyApp({
    port: 3000,
    controllers: [TodoController, HealthController, UserController],
    enableSwagger: true,
    adapter: new FastifyAdapter(),
  })
  const server = app.getServer()
  server.timeout = 5000 // Set connection timeout
  server.keepAliveTimeout = 5000 // Adjust keep-alive

  await start()
  console.log('Todo API is running on http://localhost:3000')
  console.log('API docs available at http://localhost:3000/api-docs')
}

// async function startWorker() {
//   // Register event handlers
//   registerEventHandlers([TodoEventHandlers])

//   const { start, app } = await createBootifyApp({
//     port: 3000,
//     controllers: [TodoController, HealthController],
//     enableSwagger: true,
//   })

//   const server = app.getServer()
//   server.timeout = 5000
//   server.keepAliveTimeout = 5000

//   await start()
//   console.log(`Worker ${process.pid} started`)
// }

// async function main() {
//   const cpuCount = os.cpus().length

//   if (cluster.isPrimary) {
//     console.log(`Primary ${process.pid} is running`)
//     console.log(`Forking ${cpuCount} workers...`)

//     // Fork workers
//     for (let i = 0; i < cpuCount; i++) {
//       cluster.fork()
//     }

//     // Handle worker exit with proper type checking
//     cluster.on('exit', (worker: Worker, code: number, signal: string) => {
//       console.log(`Worker ${worker.process.pid} died`)
//       console.log('Forking a new worker...')
//       cluster.fork()
//     })

//     // Zero-downtime restarts with type safety
//     process.on('SIGUSR2', () => {
//       const workers = cluster.workers ? Object.values(cluster.workers) : []

//       function restartWorker(i: number) {
//         if (i >= workers.length) return

//         const worker = workers[i]
//         if (!worker) return

//         worker.once('exit', (code: number, signal: string) => {
//           if (!worker.exitedAfterDisconnect) return
//           const newWorker = cluster.fork()
//           newWorker.once('listening', () => restartWorker(i + 1))
//         })

//         worker.disconnect()
//       }

//       restartWorker(0)
//     })
//   } else {
//     await startWorker()
//   }
// }

// Run if this file is executed directly
if (require.main === module) {
  main().catch(console.error)
}
