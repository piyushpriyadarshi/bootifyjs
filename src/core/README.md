# Core Module

The Core module provides the fundamental building blocks of the Bootify framework, including dependency injection, routing, and decorators for component registration.

## Features

- **Dependency Injection Container**: A powerful DI system for managing service lifecycles
- **Component Registration**: Decorators for registering services and controllers
- **Request Context**: Store and retrieve request-scoped data
- **Routing System**: Map HTTP endpoints to controller methods

## Usage

### Dependency Injection

```typescript
import { Service, Autowired } from 'bootify/core';

// Define a service
@Service()
class UserService {
  getUsers() {
    return [{ id: 1, name: 'John' }];
  }
}

// Inject the service
@Service()
class UserManager {
  constructor(@Autowired() private userService: UserService) {}
  
  getAllUsers() {
    return this.userService.getUsers();
  }
}
```

### Component Scopes

Components can be registered with different scopes:

```typescript
import { Service, Scope } from 'bootify/core';

// Singleton (default) - one instance for the entire application
@Service()
class ConfigService {}

// Transient - new instance created each time it's injected
@Service({ scope: Scope.TRANSIENT })
class RequestProcessor {}
```

### Controllers and Routing

```typescript
import { Controller, Get, Post, Body, Param } from 'bootify/core';
import { z } from 'zod';

const UserSchema = z.object({
  name: z.string(),
  email: z.string().email()
});

@Controller('/users')
export class UserController {
  @Get('/')
  getAllUsers() {
    return [{ id: 1, name: 'John' }];
  }
  
  @Get('/:id')
  getUserById(@Param('id') id: string) {
    return { id, name: 'John' };
  }
  
  @Post('/')
  createUser(@Body() user: z.infer<typeof UserSchema>) {
    // Create user logic
    return { id: 2, ...user };
  }
}
```

### Request Context

```typescript
import { requestContextStore } from 'bootify/core';

// In a middleware
app.addHook('onRequest', (request, reply, done) => {
  const store = requestContextStore.getStore();
  store.set('userId', 'user-123');
  done();
});

// In a service
@Service()
class AuditService {
  logAction(action: string) {
    const store = requestContextStore.getStore();
    const userId = store.get('userId');
    console.log(`User ${userId} performed ${action}`);
  }
}
```

## API Reference

### Decorators

- `@Service(options?)`: Register a class as a service in the DI container
- `@Controller(prefix?)`: Register a class as a controller with optional route prefix
- `@Get(path?)`, `@Post(path?)`, etc.: HTTP method decorators for controller methods
- `@Autowired(token?)`: Inject a dependency into a class property or constructor parameter
- `@Validate(schema)`: Apply Zod validation to request body, params, or query

### DI Container

- `container.register(token, provider)`: Register a component manually
- `container.resolve<T>(token)`: Resolve a component instance
- `container.getRegisteredComponents()`: Get all registered components