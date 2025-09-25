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
  Schema
} from '../../core/decorators'
import { container } from '../../core/di-container'
import { RequestContextService } from '../../core/request-context.service'
import { Audit, Loggable } from '../../logging/core/decorators'
import { Logger } from '../../logging/core/logger'
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
export class TodoController {
  constructor(private readonly todoService: TodoService) { }

  @Autowired(TracingService)
  private tracingService!: TracingService

  @Autowired('AuthManager')
  private authManager!: AuthManager

  private logger!: Logger

  @Get('/')
  getAllTodos() {
    const context = container.resolve<RequestContextService>(RequestContextService)
    // const span = this.tracingService.spanStart('get.all.todos', {
    //   name: 'get all todos',
    // })
    console.log(context.store())

    const logger1 = container.resolve<Logger>(Logger)
    logger1.info('Hello from logger 1 get all todo')
    console.log(this.logger === logger1)

    this.logger.info('Hello from get all todo')
    // this.tracingService.spanEnd(span, 'ok')
    return this.todoService.getAllTodos()
  }

  @Get('/:id')
  @Cacheable({ key: 'todo', ttl: 60 })
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
