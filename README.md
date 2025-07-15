# BootifyJS Framework

A Spring Boot inspired Node.js framework with TypeScript, Dependency Injection, and Validation.

## Features

- **Dependency Injection**: Automatic constructor injection with `@Injectable`, `@Service`, and `@Repository` decorators
- **REST API**: Easy route definition with `@Controller`, `@Get`, `@Post`, etc.
- **Validation**: Request validation with Zod schemas
- **Configuration**: Environment-based configuration with automatic mapping
- **Logging**: Structured logging with context tracking
- **Event System**: Publish-subscribe pattern for domain events
- **OpenAPI**: Automatic Swagger documentation generation
- **Middleware**: Flexible middleware system

## Quick Start

### Installation

```bash
npm install bootifyjs
```

### Create a Simple API

```typescript
import { createBootifyApp, Controller, Get, Post, Body, Service, Repository } from 'bootifyjs';

// Define a repository
@Repository()
class UserRepository {
  private users = [];

  findAll() {
    return this.users;
  }

  create(user) {
    const newUser = { id: Date.now().toString(), ...user };
    this.users.push(newUser);
    return newUser;
  }
}

// Define a service
@Service()
class UserService {
  constructor(private userRepository: UserRepository) {}

  getAllUsers() {
    return this.userRepository.findAll();
  }

  createUser(userData) {
    return this.userRepository.create(userData);
  }
}

// Define a controller
@Controller('/users')
class UserController {
  constructor(private userService: UserService) {}

  @Get('/')
  getAllUsers() {
    return this.userService.getAllUsers();
  }

  @Post('/')
  createUser(@Body() body) {
    return this.userService.createUser(body);
  }
}

// Bootstrap the application
async function main() {
  const { start } = await createBootifyApp({
    port: 3000,
    controllers: [UserController],
    enableSwagger: true
  });

  await start();
  console.log('API is running on http://localhost:3000');
  console.log('API docs available at http://localhost:3000/api-docs');
}

main().catch(console.error);
```

## Core Concepts

### Controllers

Controllers handle HTTP requests and define the API endpoints.

```typescript
@Controller('/api/users')
class UserController {
  constructor(private userService: UserService) {}

  @Get('/')
  getAllUsers(@Query('limit') limit?: string) {
    return this.userService.getAllUsers(limit);
  }

  @Get('/:id')
  getUserById(@Param('id') id: string) {
    return this.userService.getUserById(id);
  }

  @Post('/')
  @ValidateBody(createUserSchema)
  createUser(@Body() userData: CreateUserDto) {
    return this.userService.createUser(userData);
  }

  @Put('/:id')
  updateUser(@Param('id') id: string, @Body() userData: UpdateUserDto) {
    return this.userService.updateUser(id, userData);
  }

  @Delete('/:id')
  deleteUser(@Param('id') id: string) {
    return this.userService.deleteUser(id);
    return { message: 'User deleted successfully' };
  }
}
```

### Services

Services contain business logic and are automatically injected into controllers.

```typescript
@Service()
@Logger('UserService')
class UserService {
  private logger!: LoggerService; // Injected by @Logger decorator

  constructor(private userRepository: UserRepository) {}

  @Log({ logDuration: true })
  getAllUsers(limit?: string) {
    this.logger.info('Getting all users');
    const users = this.userRepository.findAll();
    
    if (limit) {
      const limitNum = parseInt(limit, 10);
      return users.slice(0, limitNum);
    }
    
    return users;
  }

  async createUser(userData: CreateUserDto) {
    this.logger.info('Creating new user', { email: userData.email });
    return this.userRepository.create(userData);
  }
}
```

### Repositories

Repositories handle data access and are automatically injected into services.

```typescript
@Repository()
class UserRepository {
  private users: User[] = [];

  findAll(): User[] {
    return this.users;
  }

  findById(id: string): User | undefined {
    return this.users.find(user => user.id === id);
  }

  create(userData: Omit<User, 'id'>): User {
    const newUser: User = {
      id: Date.now().toString(),
      ...userData
    };
    this.users.push(newUser);
    return newUser;
  }
}
```

### Configuration

Define configuration classes that automatically map from environment variables.

```typescript
@Config('APP')
export class AppConfig {
  SERVICE_NAME: string = 'my-service';
  
  server: {
    port: number;
    host: string;
  } = {
    port: 3000,
    host: 'localhost'
  };
  
  database: {
    url: string;
    poolSize: number;
  } = {
    url: 'postgres://localhost:5432/mydb',
    poolSize: 10
  };
}

// Usage in a service
@Service()
class DatabaseService {
  constructor(@InjectConfig(AppConfig) private config: AppConfig) {
    // Access config.database.url, etc.
  }
}
```

Environment variables are automatically mapped:
- `APP_SERVICE_NAME` → `appConfig.SERVICE_NAME`
- `APP_SERVER_PORT` → `appConfig.server.port`
- `APP_DATABASE_URL` → `appConfig.database.url`

### Event System

Implement event-driven architecture with the built-in event system.

```typescript
// Define an event
@Event('user.created')
class UserCreatedEvent {
  id!: string;
  email!: string;
  name!: string;
  
  constructor(data?: Partial<UserCreatedEvent>) {
    if (data) {
      Object.assign(this, data);
    }
  }
}

// Emit events from services
@Service()
@EventEmitter()
class UserService {
  private eventBus!: any; // Injected by @EventEmitter
  
  async createUser(userData) {
    const user = this.userRepository.create(userData);
    
    // Emit event
    await this.eventBus.emit('user.created', {
      id: user.id,
      email: user.email,
      name: user.name
    });
    
    return user;
  }
}

// Handle events
@EventListener()
class UserEventHandlers {
  @EventHandler('user.created')
  async onUserCreated(event: UserCreatedEvent) {
    console.log(`User created: ${event.email}`);
    // Send welcome email, update analytics, etc.
  }
}
```

### Validation

Use Zod schemas for request validation.

```typescript
import { z } from 'zod';

// Define validation schemas
const createUserSchema = z.object({
  email: z.string().email('Invalid email format'),
  name: z.string().min(2, 'Name must be at least 2 characters')
});

// Use in controllers
@Post('/')
@ValidateBody(createUserSchema)
createUser(@Body() userData) {
  return this.userService.createUser(userData);
}
```

### Middleware

Create custom middleware for cross-cutting concerns.

```typescript
const loggingMiddleware: Middleware = async (req, res, next) => {
  const start = Date.now();
  console.log(`Request started: ${req.method} ${req.url}`);
  
  await next();
  
  const duration = Date.now() - start;
  console.log(`Request completed in ${duration}ms: ${res.statusCode}`);
};

// Apply to specific routes
@Controller('/api')
@UseMiddleware(loggingMiddleware)
class ApiController {
  // All routes will use the middleware
}

// Or apply to specific methods
@Get('/:id')
@UseMiddleware(authMiddleware)
getResource(@Param('id') id: string) {
  // Protected route
}
```

## Advanced Usage

### OpenAPI Documentation

BootifyJS automatically generates OpenAPI documentation for your API.

```typescript
@Controller('/users')
@ApiTags('Users')
class UserController {
  @Get('/:id')
  @ApiOperation({
    summary: 'Get user by ID',
    description: 'Retrieve a specific user by their unique identifier'
  })
  @ApiResponse(200, {
    description: 'User found successfully',
    schema: userResponseSchema
  })
  @ApiResponse(404, {
    description: 'User not found',
    schema: errorResponseSchema
  })
  getUserById(@Param('id') id: string) {
    return this.userService.getUserById(id);
  }
}
```

### Logging

Use the built-in logging system for structured logs.

```typescript
@Service()
@Logger('PaymentService')
class PaymentService {
  private logger!: LoggerService; // Injected by @Logger decorator

  @Log({ logArgs: true, logDuration: true })
  async processPayment(paymentData) {
    this.logger.info('Processing payment', { amount: paymentData.amount });
    
    try {
      // Process payment logic
      this.logger.info('Payment processed successfully', { 
        transactionId: 'tx_123',
        amount: paymentData.amount 
      });
    } catch (error) {
      this.logger.error('Payment processing failed', error, { 
        amount: paymentData.amount 
      });
      throw error;
    }
  }
}
```

## Audit Logging

BootifyJS provides a comprehensive audit logging system that tracks security-sensitive operations in your application.

### Using the @Audit Decorator

```typescript
import { Audit } from '../logging';

@Service()
class UserService {
  @Audit({
    action: 'USER_CREATE',
    resource: 'user',
    resourceIdPath: 'result.id',
    newValuesPath: 'args.0'
  })
  async createUser(userData: CreateUserDto): Promise<User> {
    // Implementation...
  }
}
```

### Audit Log Schema

Audit logs capture the following information:

- **action**: The action performed (e.g., USER_CREATE, USER_UPDATE)
- **resource**: The resource being acted upon (e.g., user, post)
- **resourceId**: The ID of the specific resource
- **oldValues**: Previous state (for updates/deletes)
- **newValues**: New state (for creates/updates)
- **username**: The user who performed the action
- **timestamp**: When the action occurred
- **ip**: The IP address of the request
- **userAgent**: The user agent of the request

### ClickHouse Integration

BootifyJS supports storing logs in ClickHouse for advanced analytics:

1. Enable ClickHouse in your .env file:

```
LOG_CLICKHOUSE_ENABLED=true
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_USERNAME=default
CLICKHOUSE_PASSWORD=
CLICKHOUSE_DATABASE=bootifyjs_logs
```

2. Access metrics through the metrics controller:

```
GET /metrics - Overall metrics
GET /metrics/http - HTTP request metrics
GET /metrics/events - Event metrics
GET /metrics/audits - Audit metrics
GET /metrics/latency - Latency metrics
GET /metrics/controllers - Controller method latency metrics
```

## Bootstrapping a Server

To start a BootifyJS application:

```typescript
import { createBootifyApp } from 'bootifyjs';
import { UserController } from './controllers/user.controller';
import { ProductController } from './controllers/product.controller';

async function bootstrap() {
  const { start } = await createBootifyApp({
    port: 3000,
    hostname: 'localhost',
    controllers: [UserController, ProductController],
    enableSwagger: true,
    enableCors: true,
    enableRequestLogging: true,
    requestLoggingOptions: {
      logHeaders: true,
      slowThreshold: 1000
    }
  });

  await start();
  console.log('Server is running on http://localhost:3000');
}

bootstrap().catch(console.error);
```

## Testing

BootifyJS is designed to be easily testable. Here's an example of testing a controller:

```typescript
import { container } from 'bootifyjs';
import { UserController } from './user.controller';
import { UserService } from './user.service';

describe('UserController', () => {
  let controller: UserController;
  let userService: UserService;

  beforeEach(() => {
    // Mock the UserService
    userService = {
      getAllUsers: jest.fn().mockReturnValue([{ id: '1', name: 'Test User' }]),
      getUserById: jest.fn().mockReturnValue({ id: '1', name: 'Test User' })
    };

    // Register the mock in the container
    container.register(UserService);
    jest.spyOn(container, 'resolve').mockReturnValue(userService);

    // Create controller instance
    controller = container.resolve(UserController);
  });

  it('should get all users', () => {
    const result = controller.getAllUsers();
    expect(result).toHaveLength(1);
    expect(userService.getAllUsers).toHaveBeenCalled();
  });

  it('should get user by id', () => {
    const result = controller.getUserById('1');
    expect(result.id).toBe('1');
    expect(userService.getUserById).toHaveBeenCalledWith('1');
  });
});
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.