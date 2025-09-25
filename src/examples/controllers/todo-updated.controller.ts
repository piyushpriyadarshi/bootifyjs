import { z } from 'zod'
import { Cacheable } from '../../cache/decorators'
import {
  Autowired,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Schema,
  UseMiddleware
} from '../../core/decorators'
import { container } from '../../core/di-container'
import { RequestContextService } from '../../core/request-context.service'
import { Audit, Loggable } from '../../logging/core/decorators'
import { Logger } from '../../logging/core/logger'
import { TracingService } from '../../logging/core/tracing.service'
import { authenticate } from '../../middleware/auth.middleware'
// Remove the old authorize import
// import { authorize } from '../../middleware/authorization.middleware'
import { TodoService } from '../services/todo.service'
import { AuthManager } from '../../auth'
import { AuthMiddleware } from '../../auth/middleware/AuthMiddleware'

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

/**
 * Updated TodoController using JWT Middleware Authorization
 * 
 * This shows how to replace authorize(['manager']) with JWT middleware methods
 */
@Loggable()
@Controller('/todos')
@UseMiddleware(authenticate(process.env.JWT_SECRET || 'your-secret-key'))
export class TodoController {
  constructor(private readonly todoService: TodoService) {}

  @Autowired(TracingService)
  private tracingService!: TracingService

  @Autowired('AuthManager')
  private authManager!: AuthManager

  // Add JWT middleware injection
  @Autowired('JwtAuthMiddleware')
  private jwtAuthMiddleware!: AuthMiddleware

  private logger!: Logger

  @Get('/')
  getAllTodos() {
    const requestContext = container.resolve(RequestContextService) as RequestContextService
    const requestId = requestContext.get('requestId')
    this.logger.info(`Request ID: ${requestId}`)
    this.logger.info('Hello from get all todos')
    return this.todoService.getAllTodos()
  }

  @Get('/:id')
  @Cacheable({ key: 'todo', ttl: 60 })
  getTodoById(@Param('id') id: string) {
    this.logger.info(`Hello from get todo by id: ${id}`)
    return this.todoService.getTodoById(id)
  }

  /**
   * OPTION 1: Direct replacement using requireRoles
   * This is the most direct replacement for authorize(['manager'])
   */
  @Post('/option1')
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
  // Replace: @UseMiddleware(authorize(['manager']))
  // With: @UseMiddleware(this.jwtAuthMiddleware.requireRoles(['manager']))
  async createTodoOption1(@Body() body: z.infer<typeof todoSchema>) {
    this.logger.info('Creating todo with requireRoles', body)
    const data = await this.todoService.createTodo(body.text)
    return data
  }

  /**
   * OPTION 2: Using requireAuth with explicit strategy and roles
   * More explicit about authentication strategy
   */
  @Post('/option2')
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
  // @UseMiddleware(this.jwtAuthMiddleware.requireAuth(['jwt'], ['manager']))
  async createTodoOption2(@Body() body: z.infer<typeof todoSchema>) {
    this.logger.info('Creating todo with requireAuth', body)
    const data = await this.todoService.createTodo(body.text)
    return data
  }

  /**
   * OPTION 3: Permission-based authorization
   * More granular control using permissions instead of roles
   */
  @Post('/option3')
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
  // @UseMiddleware(this.jwtAuthMiddleware.requirePermissions(['todo:create']))
  async createTodoOption3(@Body() body: z.infer<typeof todoSchema>) {
    this.logger.info('Creating todo with requirePermissions', body)
    const data = await this.todoService.createTodo(body.text)
    return data
  }

  /**
   * OPTION 4: Combined role and permission check
   * Most secure - requires both role AND permission
   */
  @Post('/option4')
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
  // @UseMiddleware(this.jwtAuthMiddleware.requireAuth(['jwt'], ['manager'], ['todo:create']))
  async createTodoOption4(@Body() body: z.infer<typeof todoSchema>) {
    this.logger.info('Creating todo with combined auth', body)
    const data = await this.todoService.createTodo(body.text)
    return data
  }

  /**
   * YOUR ORIGINAL METHOD - Updated to use JWT middleware
   * This is how you would update your existing createTodo method
   */
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
  // OLD: @UseMiddleware(authorize(['manager']))
  // NEW: Choose one of these options:
  // @UseMiddleware(this.jwtAuthMiddleware.requireRoles(['manager']))
  // @UseMiddleware(this.jwtAuthMiddleware.requireAuth(['jwt'], ['manager']))
  // @UseMiddleware(this.jwtAuthMiddleware.requirePermissions(['todo:create']))
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

/**
 * IMPORTANT: To make this work, you need to:
 * 
 * 1. Register JWT middleware in your DI container (in src/examples/index.ts):
 * 
 * container.register('JwtAuthMiddleware', {
 *   useFactory: () => jwtAuthMiddleware
 * })
 * 
 * 2. The middleware methods are commented out because decorators can't access
 *    instance properties. You have two solutions:
 * 
 *    Solution A: Use manual route registration (see registerTodoRoutes function below)
 *    Solution B: Create a factory function that returns the middleware
 * 
 * 3. Update your user model to include roles/permissions that match what
 *    you're checking for (e.g., 'manager' role, 'todo:create' permission)
 */

/**
 * Solution A: Manual Route Registration
 * Use this approach if decorators don't work with instance methods
 */
export function registerTodoRoutes(
  app: any,
  todoController: TodoController,
  jwtAuthMiddleware: AuthMiddleware
) {
  // Replace authorize(['manager']) with JWT middleware
  app.post('/todos', {
    preHandler: jwtAuthMiddleware.requireRoles(['manager'])
  }, async (request: any, reply: any) => {
    return await todoController.createTodo(request.body)
  })

  // Other authorization examples
  app.post('/todos/permission-based', {
    preHandler: jwtAuthMiddleware.requirePermissions(['todo:create'])
  }, async (request: any, reply: any) => {
    return await todoController.createTodo(request.body)
  })

  app.post('/todos/combined', {
    preHandler: jwtAuthMiddleware.requireAuth(['jwt'], ['manager'], ['todo:create'])
  }, async (request: any, reply: any) => {
    return await todoController.createTodo(request.body)
  })
}