# Examples Module

The Examples module provides sample implementations and reference code for the Bootify framework, demonstrating best practices and common patterns.

## Features

- **Sample Controllers**: REST API endpoint implementations
- **Service Examples**: Business logic and data access patterns
- **Event Handling**: Event-driven architecture examples
- **Todo Application**: Complete mini-application example
- **JWT Authentication**: Complete JWT authentication implementation

# JWT Authentication Example

This directory contains a complete JWT authentication implementation for BootifyJS with the following components:

## Files Overview

### Core Authentication Files
- **`controllers/auth.controller.ts`** - Authentication controller with login, logout, and refresh token endpoints
- **`auth/auth.middleware.ts`** - Global JWT authentication middleware and authorization helpers
- **`services/user.service.ts`** - User service and repository for user management
- **`jwt-auth-example.ts`** - Complete example showing how to set up JWT auth with Fastify
- **`test-auth-flow.ts`** - Test script for validating the authentication flow

## Features

✅ **JWT Authentication Routes**
- `POST /auth/login` - User login with username/password
- `POST /auth/refresh` - Refresh access token using refresh token
- `POST /auth/logout` - Logout and revoke tokens
- `GET /auth/info` - Get current user information (requires auth)

✅ **Global Authentication Middleware**
- `jwtAuthMiddleware` - Validates JWT tokens from Authorization header
- `optionalJwtAuthMiddleware` - Optional authentication for public endpoints
- `requireRoles()` - Role-based authorization middleware factory
- `requirePermissions()` - Permission-based authorization middleware factory

✅ **User Management**
- Mock user repository with CRUD operations
- User service with business logic
- Support for roles and permissions
- Password validation (mock implementation)

✅ **Route Protection Examples**
- Public routes (no authentication required)
- Protected routes (authentication required)
- Admin routes (specific roles required)
- Permission-based routes (specific permissions required)

## Quick Start

### 1. Run the Example Server

```bash
# Route-specific authentication (recommended)
npx ts-node src/examples/jwt-auth-example.ts

# OR Global authentication (applies to all routes)
npx ts-node src/examples/jwt-auth-example.ts --global
```

The server will start on `http://localhost:3000`

### 2. Test Credentials

```javascript
// Admin user (full access)
{ username: 'admin', password: 'admin123' }

// Regular user (limited access)
{ username: 'user', password: 'user123' }

// Guest user (read-only access)
{ username: 'guest', password: 'guest123' }
```

### 3. API Endpoints

#### Authentication Endpoints
```bash
# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}'

# Refresh token
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "your-refresh-token"}'

# Logout
curl -X POST http://localhost:3000/auth/logout \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "your-refresh-token"}'
```

#### Protected Endpoints
```bash
# Get user profile (requires authentication)
curl -X GET http://localhost:3000/user/profile \
  -H "Authorization: Bearer your-access-token"

# Update user profile (requires authentication)
curl -X PUT http://localhost:3000/user/profile \
  -H "Authorization: Bearer your-access-token" \
  -H "Content-Type: application/json" \
  -d '{"email": "new@example.com", "firstName": "New", "lastName": "Name"}'

# Get all users (requires admin role)
curl -X GET http://localhost:3000/admin/users \
  -H "Authorization: Bearer admin-access-token"

# Delete user (requires delete permission)
curl -X DELETE http://localhost:3000/admin/users/2 \
  -H "Authorization: Bearer admin-access-token"
```

#### Public Endpoints
```bash
# Public info (works with or without token)
curl -X GET http://localhost:3000/public/info

# Health check
curl -X GET http://localhost:3000/health
```

## Usage

### Running the Example Application

```typescript
import { createBootifyApp } from 'bootify'
import { HealthController, TodoController } from 'bootify/examples/controllers'
import { z } from 'zod'

async function main() {
  // Initialize the application with example controllers
  const { app, start } = await createBootifyApp({
    controllers: [HealthController, TodoController],
    enableSwagger: true,
    port: 3000,
    configSchema: z.object({
      NODE_ENV: z.string().min(1),
    }),
  })

  // Start the server
  await start()
}

main()
```

### Health Check Controller Example

```typescript
import { Controller, Get } from 'bootify/core'

@Controller('/health')
export class HealthController {
  @Get('/')
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    }
  }
}
```

### Todo Controller Example

```typescript
import { Controller, Get, Post, Put, Delete, Body, Param } from 'bootify/core'
import { TodoService } from '../services/todo.service'
import { z } from 'zod'

const TodoSchema = z.object({
  title: z.string().min(1),
  completed: z.boolean().default(false),
})

@Controller('/todos')
export class TodoController {
  constructor(private todoService: TodoService) {}

  @Get('/')
  getAllTodos() {
    return this.todoService.findAll()
  }

  @Get('/:id')
  getTodoById(@Param('id') id: string) {
    return this.todoService.findById(id)
  }

  @Post('/')
  createTodo(@Body() todo: z.infer<typeof TodoSchema>) {
    return this.todoService.create(todo)
  }

  @Put('/:id')
  updateTodo(@Param('id') id: string, @Body() todo: z.infer<typeof TodoSchema>) {
    return this.todoService.update(id, todo)
  }

  @Delete('/:id')
  deleteTodo(@Param('id') id: string) {
    return this.todoService.delete(id)
  }
}
```

### Todo Service Example

```typescript
import { Service } from 'bootify/core'
import { EventBusService } from 'bootify/events'

interface Todo {
  id: string
  title: string
  completed: boolean
}

@Service()
export class TodoService {
  private todos: Todo[] = []

  constructor(private eventBus: EventBusService) {}

  findAll(): Todo[] {
    return this.todos
  }

  findById(id: string): Todo | undefined {
    return this.todos.find((todo) => todo.id === id)
  }

  create(todo: Omit<Todo, 'id'>): Todo {
    const newTodo = {
      id: Date.now().toString(),
      ...todo,
    }

    this.todos.push(newTodo)

    // Publish an event
    this.eventBus.publish({
      type: 'todo.created',
      payload: newTodo,
    })

    return newTodo
  }

  update(id: string, todo: Omit<Todo, 'id'>): Todo | undefined {
    const index = this.todos.findIndex((t) => t.id === id)
    if (index === -1) return undefined

    const updatedTodo = {
      id,
      ...todo,
    }

    this.todos[index] = updatedTodo

    // Publish an event
    this.eventBus.publish({
      type: 'todo.updated',
      payload: updatedTodo,
    })

    return updatedTodo
  }

  delete(id: string): boolean {
    const index = this.todos.findIndex((t) => t.id === id)
    if (index === -1) return false

    const deletedTodo = this.todos[index]
    this.todos.splice(index, 1)

    // Publish an event
    this.eventBus.publish({
      type: 'todo.deleted',
      payload: { id, title: deletedTodo.title },
    })

    return true
  }
}
```

### Event Handler Example

```typescript
import { EventHandler, HandleEvent } from 'bootify/events'
import { Logger } from 'bootify/logging'

@EventHandler()
export class TodoEventHandler {
  constructor(private logger: Logger) {}

  @HandleEvent('todo.created')
  onTodoCreated(event: any) {
    this.logger.info(`Todo created: ${event.payload.title}`)
  }

  @HandleEvent('todo.updated')
  onTodoUpdated(event: any) {
    this.logger.info(`Todo updated: ${event.payload.title}`)
  }

  @HandleEvent('todo.deleted')
  onTodoDeleted(event: any) {
    this.logger.info(`Todo deleted: ${event.payload.title}`)
  }
}
```

## Learning from Examples

The examples module is designed to demonstrate:

1. **Clean Architecture**: Separation of concerns between controllers, services, and data access
2. **Dependency Injection**: How to use the DI container effectively
3. **Validation**: Request validation using Zod schemas
4. **Event-Driven Design**: Using events for loose coupling between components
5. **RESTful API Design**: Best practices for designing REST endpoints

Examine the code to understand how these patterns are implemented in a real-world application.
