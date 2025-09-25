# How to Implement Authorization with JWT Middleware

This guide shows you how to implement authorization for your TodoController using the JWT middleware's built-in authorization methods, similar to how `jwtMiddleware.authenticate` works for authentication.

## Current Implementation Analysis

Your current `createTodo` method in `src/examples/controllers/todo.controller.ts` uses:

```typescript
@UseMiddleware(authorize(['manager']))
async createTodo(@Body() body: z.infer<typeof todoSchema>) {
  // ...
}
```

## JWT Middleware Authorization Methods

The JWT middleware (`AuthMiddleware`) provides several built-in authorization methods:

### 1. `requireAuth(strategies, roles?, permissions?)`
- **Purpose**: Requires authentication and optionally checks roles/permissions
- **Usage**: Basic authentication with optional role/permission checks

### 2. `requireRoles(roles)`
- **Purpose**: Requires specific roles (equivalent to your current `authorize(['manager'])`)
- **Usage**: Role-based access control

### 3. `requirePermissions(permissions)`
- **Purpose**: Requires specific permissions
- **Usage**: Fine-grained permission-based access control

### 4. `requireStrategy(strategy, roles?, permissions?)`
- **Purpose**: Requires a specific authentication strategy
- **Usage**: When you need JWT-only or API-key-only access

### 5. `optionalAuth(strategies)`
- **Purpose**: Optional authentication (user info available if authenticated)
- **Usage**: Public endpoints that can show different content for authenticated users

## Implementation Options

### Option 1: Replace `authorize` with `requireRoles` (Direct Replacement)

**Current:**
```typescript
@UseMiddleware(authorize(['manager']))
async createTodo(@Body() body: z.infer<typeof todoSchema>) {
  // ...
}
```

**New:**
```typescript
@UseMiddleware(jwtAuthMiddleware.requireRoles(['manager']))
async createTodo(@Body() body: z.infer<typeof todoSchema>) {
  // ...
}
```

### Option 2: Use `requireAuth` with Roles

```typescript
@UseMiddleware(jwtAuthMiddleware.requireAuth(['jwt'], ['manager']))
async createTodo(@Body() body: z.infer<typeof todoSchema>) {
  // ...
}
```

### Option 3: Permission-Based Authorization

```typescript
@UseMiddleware(jwtAuthMiddleware.requirePermissions(['todo:create']))
async createTodo(@Body() body: z.infer<typeof todoSchema>) {
  // ...
}
```

### Option 4: Combined Role and Permission Check

```typescript
@UseMiddleware(jwtAuthMiddleware.requireAuth(['jwt'], ['manager'], ['todo:create']))
async createTodo(@Body() body: z.infer<typeof todoSchema>) {
  // ...
}
```

## Step-by-Step Implementation

### Step 1: Access JWT Middleware in Controller

You need to make the JWT middleware available in your controller. Update your `src/examples/index.ts`:

```typescript
// In your setupJwtAuth or main setup
const { authManager, middleware: jwtAuthMiddleware } = setupJwtAuth(container)

// Register the middleware in DI container
container.register('JwtAuthMiddleware', {
  useFactory: () => jwtAuthMiddleware
})
```

### Step 2: Inject JWT Middleware in TodoController

Update your `TodoController`:

```typescript
import { AuthMiddleware } from '../../auth/middleware/AuthMiddleware'

@Controller('/api/todos')
export class TodoController {
  constructor(private readonly todoService: TodoService) {}

  @Autowired('AuthManager')
  private authManager!: AuthManager

  @Autowired('JwtAuthMiddleware')
  private jwtAuthMiddleware!: AuthMiddleware

  // Your existing methods...
}
```

### Step 3: Update Authorization Methods

**Replace your current `createTodo` method:**

```typescript
// OLD:
@UseMiddleware(authorize(['manager']))
async createTodo(@Body() body: z.infer<typeof todoSchema>) {
  this.logger.info('Creating todo', body)
  return await this.todoService.createTodo(body.text)
}

// NEW - Option 1 (Direct replacement):
@UseMiddleware(this.jwtAuthMiddleware.requireRoles(['manager']))
async createTodo(@Body() body: z.infer<typeof todoSchema>) {
  this.logger.info('Creating todo', body)
  return await this.todoService.createTodo(body.text)
}

// NEW - Option 2 (More explicit):
@UseMiddleware(this.jwtAuthMiddleware.requireAuth(['jwt'], ['manager']))
async createTodo(@Body() body: z.infer<typeof todoSchema>) {
  this.logger.info('Creating todo', body)
  return await this.todoService.createTodo(body.text)
}
```

## Alternative: Manual Route Registration

If decorators don't work well with instance methods, you can register routes manually:

```typescript
// In your main setup file
export function registerTodoRoutes(
  app: FastifyInstance,
  todoController: TodoController,
  jwtAuthMiddleware: AuthMiddleware
) {
  app.post('/api/todos', {
    preHandler: jwtAuthMiddleware.requireRoles(['manager'])
  }, async (request, reply) => {
    return await todoController.createTodo(request.body)
  })

  app.get('/api/todos/:id', {
    preHandler: jwtAuthMiddleware.requireAuth(['jwt'], ['user', 'manager'])
  }, async (request, reply) => {
    return await todoController.getTodoById(request.params.id)
  })
}
```

## Benefits of JWT Middleware Authorization

1. **Consistency**: Same middleware for authentication and authorization
2. **Flexibility**: Multiple authorization strategies (roles, permissions, combined)
3. **Performance**: Single middleware handles both auth and authz
4. **Maintainability**: Centralized authorization logic
5. **Type Safety**: Better TypeScript support

## Migration Strategy

1. **Phase 1**: Keep existing `authorize` middleware alongside new JWT authorization
2. **Phase 2**: Gradually migrate endpoints to use JWT middleware methods
3. **Phase 3**: Remove old `authorize` middleware once all endpoints are migrated

## Example: Complete TodoController with JWT Authorization

See `src/examples/controllers/todo-with-jwt-auth.controller.ts` for a complete example showing all authorization patterns.

## Troubleshooting

### Issue: "Cannot access instance method in decorator"
**Solution**: Use manual route registration or create a factory function

### Issue: "Middleware not found in DI container"
**Solution**: Ensure JWT middleware is properly registered in the DI container

### Issue: "Authorization not working"
**Solution**: Check that user object has the required roles/permissions structure

## Next Steps

1. Choose your preferred authorization method (roles vs permissions)
2. Update your user model to include roles/permissions
3. Migrate existing endpoints one by one
4. Test authorization with different user roles
5. Remove old authorization middleware when migration is complete