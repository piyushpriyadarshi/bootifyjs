import { z } from 'zod'
import {
  Controller,
  Get,
  Post,
  Body,
  Schema,
  Param,
  UseMiddleware,
  Autowired,
} from '../../core/decorators'
import { TodoService } from '../services/todo.service'
import { authMiddleware } from '../../middleware/auth.middleware'
import { container } from '../../core/di-container'
import { RequestContextService } from '../../core/request-context.service'
import { Cacheable } from '../../cache/decorators'
import { Audit, Loggable } from '../../logging/core/decorators'
import { Logger } from '../../logging/core/logger'
import { TracingService } from '../../logging/core/tracing.service'

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
export class TodoController {
  constructor(private readonly todoService: TodoService) {}

  @Autowired(TracingService)
  private tracingService!: TracingService

  private logger!: Logger

  @Get('/')
  // @UseMiddleware(authMiddleware)
  getAllTodos() {
    const context = container.resolve<RequestContextService>(RequestContextService)
    const span = this.tracingService.spanStart('get.all.todos', {
      name: 'get all todos',
    })
    console.log(context.store())

    const logger1 = container.resolve<Logger>(Logger)
    logger1.info('Hello from logger 1 get all todo')
    console.log(this.logger === logger1)

    this.logger.info('Hello from get all todo')
    this.tracingService.spanEnd(span, 'ok')
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
  createTodo(@Body() body: z.infer<typeof todoSchema>) {
    const span = this.tracingService.spanStart('create.todo.controller', {
      name: 'create todo controller',
      hello: 'world',
      company: 'Jiocinema',
    })
    this.tracingService.addTags({
      text: body.text,
    })
    this.logger.info('Hello from create todo', body)
    const data = this.todoService.createTodo(body.text)
    this.tracingService.spanEnd(span, 'ok')
    return data
  }
}
