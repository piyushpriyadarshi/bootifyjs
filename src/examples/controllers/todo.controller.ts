import { z } from 'zod'
import { AuthManager } from '../../auth'
import { Cacheable } from '../../cache/decorators'
import {
  Autowired,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Schema,
  Swagger
} from '../../core/decorators'
import { container } from '../../core/di-container'
import { RequestContextService } from '../../core/request-context.service'
import { Audit, Loggable } from '../../logging/core/decorators'
import { ILogger } from '../../logging/core/interfaces'
import { TracingService } from '../../logging/core/tracing.service'
import { TodoService } from '../services/todo.service'

const createTodoSchema = {
  body: z
    .object({
      text: z.string().min(1, 'Text cannot be empty'),
    })
    .required(),
}

const todoSchema = z
  .object({
    text: z.string().min(2, 'Text cannot be empty'),
  })
  .required()

const getTodoByIdSchema = {
  params: z.object({
    id: z.string().regex(/^\d+$/, 'ID must be a numeric string'),
  }),
}



@Loggable()
@Controller('/todos')
// @UseMiddleware(authenticate(process.env.JWT_SECRET || 'your-secret-key'))
@Swagger({
  tags: ['Todos'],
  description: 'Todo management endpoints'
  // security: [{ bearerAuth: [] }]  // Temporarily commented out
})
export class TodoController {
  constructor(private readonly todoService: TodoService) { }

  @Autowired(TracingService)
  private tracingService!: TracingService

  @Autowired('AuthManager')
  private authManager!: AuthManager

  private logger!: ILogger

  @Get('/')
  @Swagger({
    summary: 'Get all todos',
    description: 'Retrieves a list of all todo items'
    // tags inherited from controller: ['Todos']
    // security inherited from controller: [{ bearerAuth: [] }]
  })
  getAllTodos() {
    const context = container.resolve<RequestContextService>(RequestContextService)
    // const span = this.tracingService.spanStart('get.all.todos', {
    //   name: 'get all todos',
    // })
    console.log(context.store())

    // Using the injected logger from @Loggable decorator

    this.logger.info('Hello from get all todo')
    // this.tracingService.spanEnd(span, 'ok')
    return this.todoService.getAllTodos()
  }

  @Get('/:id')
  @Cacheable({ key: 'todo', ttl: 60 })
  @Swagger({
    summary: 'Get todo by ID',
    description: 'Retrieves a single todo item by its unique identifier',
    tags: ['Todos', 'Public']  // Merges with controller tags: ['Todos', 'Public']
  })
  getTodoById(@Param('id') id: string) {
    this.logger.info('Hello from get todo by id')
    return this.todoService.getTodoById(id)
  }

  @Post('/')
  @Audit({
    action: 'create',
    resource: 'todo',
  })
  @Schema({
    body: todoSchema,
    responses: {
      201: z.object({
        id: z.string(),
        text: z.string(),
        completed: z.boolean(),
      }),
    },
  })
  @Swagger({
    summary: 'Create a new todo',
    description: 'Creates a new todo item with the provided text',
    operationId: 'createTodo'
    // security: []  // Temporarily commented out
  })
  // @UseMiddleware(authorize(['manager']))
  async createTodo(@Body() body: z.infer<typeof todoSchema>) {
    // const span = this.tracingService.spanStart('create.todo.controller', {
    //   name: 'create todo controller',
    //   hello: 'world',
    //   company: 'Jiocinema',
    // })
    // this.tracingService.addTags({
    //   text: body.text,
    // })
    this.logger.info('Hello from create todo', body)
    const data = await this.todoService.createTodo(body.text)
    // this.tracingService.spanEnd(span, 'ok')
    return data
  }
}
