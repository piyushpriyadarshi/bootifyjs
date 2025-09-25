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
import { Audit, Loggable } from '../../logging/core/decorators'
import { Logger } from '../../logging/core/logger'
import { TracingService } from '../../logging/core/tracing.service'
import { TodoService } from '../services/todo.service'
import { AuthManager } from '../../auth'
import { AuthMiddleware } from '../../auth/middleware/AuthMiddleware'

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
 * Enhanced TodoController using JWT Middleware Authorization
 * 
 * This controller demonstrates different authorization patterns
 * using the built-in JWT middleware methods instead of the
 * separate authorize() middleware.
 */
@Loggable()
@Controller('/api/todos-jwt')
export class TodoWithJwtAuthController {
  constructor(private readonly todoService: TodoService) {}

  @Autowired(TracingService)
  private tracingService!: TracingService

  @Autowired('AuthManager')
  private authManager!: AuthManager

  @Autowired(Logger)
  private logger!: Logger

  // We need to inject the JWT middleware to use its authorization methods
  private jwtAuthMiddleware!: AuthMiddleware

  // Method to set the JWT middleware (called during setup)
  setJwtMiddleware(middleware: AuthMiddleware) {
    this.jwtAuthMiddleware = middleware
  }

  /**
   * Public endpoint - no authentication required
   */
  @Get('/public')
  async getPublicTodos() {
    this.logger.info('Fetching public todos')
    return await this.todoService.getAllTodos()
  }

  /**
   * Optional authentication - user info available if authenticated
   */
  @Get('/optional-auth')
  // Note: In practice, you'd need to pass the middleware function here
  // @UseMiddleware(this.jwtAuthMiddleware.optionalAuth(['jwt', 'api-key']))
  async getTodosWithOptionalAuth() {
    // Access user info if available: (request as any).user
    this.logger.info('Fetching todos with optional auth')
    return await this.todoService.getAllTodos()
  }

  /**
   * Basic authentication required - any authenticated user
   */
  @Get('/authenticated')
  // @UseMiddleware(this.jwtAuthMiddleware.requireAuth(['jwt', 'api-key']))
  async getAuthenticatedTodos() {
    this.logger.info('Fetching todos for authenticated user')
    return await this.todoService.getAllTodos()
  }

  /**
   * Role-based authorization - equivalent to authorize(['manager'])
   */
  @Post('/create-role-based')
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
  // @UseMiddleware(this.jwtAuthMiddleware.requireRoles(['manager', 'admin']))
  async createTodoRoleBased(@Body() body: z.infer<typeof todoSchema>) {
    this.logger.info('Creating todo with role-based auth', body)
    return await this.todoService.createTodo(body.text)
  }

  /**
   * Permission-based authorization - more granular control
   */
  @Post('/create-permission-based')
  @Schema({
    body: todoSchema,
  })
  // @UseMiddleware(this.jwtAuthMiddleware.requirePermissions(['todo:create', 'todo:write']))
  async createTodoPermissionBased(@Body() body: z.infer<typeof todoSchema>) {
    this.logger.info('Creating todo with permission-based auth', body)
    return await this.todoService.createTodo(body.text)
  }

  /**
   * Combined role and permission authorization
   */
  @Post('/create-combined')
  @Audit({
    action: 'create',
    resource: 'todo',
  })
  @Schema({
    body: todoSchema,
  })
  // @UseMiddleware(this.jwtAuthMiddleware.requireAuth(['jwt'], ['manager', 'admin'], ['todo:create']))
  async createTodoCombined(@Body() body: z.infer<typeof todoSchema>) {
    this.logger.info('Creating todo with combined auth', body)
    return await this.todoService.createTodo(body.text)
  }

  /**
   * Strategy-specific authorization - JWT only with admin role
   */
  @Post('/admin-only')
  // @UseMiddleware(this.jwtAuthMiddleware.requireStrategy('jwt', ['admin']))
  async adminOnlyEndpoint(@Body() body: any) {
    this.logger.info('Admin-only endpoint accessed')
    return { message: 'Admin-only content', data: body }
  }

  /**
   * Get todo by ID with caching and role-based auth
   */
  @Get('/:id')
  @Cacheable({ key: 'todo', ttl: 60 })
  @Schema(getTodoByIdSchema)
  // @UseMiddleware(this.jwtAuthMiddleware.requireRoles(['user', 'manager', 'admin']))
  async getTodoById(@Param('id') id: string) {
    this.logger.info(`Fetching todo with ID: ${id}`)
    return await this.todoService.getTodoById(id)
  }

  /**
   * Update todo - requires specific permissions
   */
  @Post('/:id/update')
  @Schema({
    params: z.object({ id: z.string() }),
    body: todoSchema,
  })
  // @UseMiddleware(this.jwtAuthMiddleware.requirePermissions(['todo:update']))
  async updateTodo(
    @Param('id') id: string,
    @Body() body: z.infer<typeof todoSchema>
  ) {
    this.logger.info(`Updating todo ${id}`, body)
    // Implementation would go here
    return { id, ...body, updated: true }
  }

  /**
   * Delete todo - admin or owner only
   */
  @Post('/:id/delete')
  @Schema({
    params: z.object({ id: z.string() }),
  })
  // @UseMiddleware(this.jwtAuthMiddleware.requireAuth(['jwt'], ['admin'], ['todo:delete']))
  async deleteTodo(@Param('id') id: string) {
    this.logger.info(`Deleting todo ${id}`)
    // Implementation would go here
    return { message: `Todo ${id} deleted` }
  }
}

/**
 * Helper function to setup the controller with JWT middleware
 */
export function setupTodoWithJwtAuth(
  controller: TodoWithJwtAuthController,
  jwtAuthMiddleware: AuthMiddleware
) {
  controller.setJwtMiddleware(jwtAuthMiddleware)
}

/**
 * Example of how to register routes manually with Fastify
 * (Alternative to using decorators)
 */
export function registerTodoJwtAuthRoutes(
  app: any,
  todoService: TodoService,
  jwtAuthMiddleware: AuthMiddleware
) {
  // Role-based authorization
  app.post('/api/todos/create-role', {
    preHandler: jwtAuthMiddleware.requireRoles(['manager', 'admin'])
  }, async (request: any, reply: any) => {
    const { text } = request.body
    const result = await todoService.createTodo(text)
    return result
  })

  // Permission-based authorization
  app.post('/api/todos/create-permission', {
    preHandler: jwtAuthMiddleware.requirePermissions(['todo:create'])
  }, async (request: any, reply: any) => {
    const { text } = request.body
    const result = await todoService.createTodo(text)
    return result
  })

  // Combined authorization
  app.post('/api/todos/create-combined', {
    preHandler: jwtAuthMiddleware.requireAuth(
      ['jwt'], // strategies
      ['manager'], // roles
      ['todo:create'] // permissions
    )
  }, async (request: any, reply: any) => {
    const { text } = request.body
    const result = await todoService.createTodo(text)
    return result
  })

  // Optional authentication
  app.get('/api/todos/optional', {
    preHandler: jwtAuthMiddleware.optionalAuth(['jwt', 'api-key'])
  }, async (request: any, reply: any) => {
    const user = request.user
    const todos = await todoService.getAllTodos()
    
    if (user) {
      return {
        message: `Hello ${user.email || user.username}`,
        todos,
        authenticated: true
      }
    }
    
    return {
      message: 'Public access',
      todos: todos.slice(0, 5), // Limited for non-authenticated users
      authenticated: false
    }
  })
}