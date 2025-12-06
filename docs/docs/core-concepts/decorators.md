---
id: decorators
title: Decorators
sidebar_label: Decorators
description: Complete guide to all decorators available in BootifyJS
keywords: [bootifyjs, decorators, typescript decorators, metadata, annotations]
---

# Decorators

Decorators are the primary way you interact with BootifyJS. They provide a declarative syntax for defining routes, injecting dependencies, validating data, and more. This guide covers all available decorators with practical examples.

## Prerequisites

Ensure your `tsconfig.json` has decorator support enabled:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "target": "ES2020"
  }
}
```

## Class Decorators

Class decorators define the role and behavior of a class in your application.

### @Controller

Marks a class as a controller and defines the base route prefix.

```typescript
import { Controller } from "bootifyjs";

@Controller("/api/users")
export class UserController {
  // All routes in this controller will be prefixed with /api/users
}
```

**Parameters:**

- `prefix` (string): The base path for all routes in this controller

**Example with nested routes:**

```typescript
@Controller("/api/v1/products")
export class ProductController {
  @Get("/") // Resolves to: GET /api/v1/products/
  getAllProducts() {}

  @Get("/:id") // Resolves to: GET /api/v1/products/:id
  getProduct(@Param("id") id: string) {}
}
```

### @Service

Registers a class as a service in the DI container. Services contain business logic.

```typescript
import { Service } from "bootifyjs";

@Service()
export class UserService {
  createUser(data: any) {
    // Business logic
  }
}
```

**Options:**

- `scope`: `Scope.SINGLETON` (default) or `Scope.TRANSIENT`
- `bindTo`: Array of tokens to bind this class to (for interface injection)

```typescript
@Service({
  scope: Scope.SINGLETON,
  bindTo: ["IUserService"],
})
export class UserService implements IUserService {
  // Implementation
}
```

### @Repository

Registers a class as a repository. Repositories handle data access and persistence.

```typescript
import { Repository } from "bootifyjs";

@Repository()
export class UserRepository {
  private users: Map<string, User> = new Map();

  findById(id: string) {
    return this.users.get(id);
  }

  save(user: User) {
    this.users.set(user.id, user);
  }
}
```

**Options:** Same as `@Service`

### @Component

Generic decorator for any class that should be managed by the DI container.

```typescript
import { Component } from "bootifyjs";

@Component()
export class EmailHelper {
  sendEmail(to: string, subject: string, body: string) {
    // Email logic
  }
}

@Component({ bindTo: ["ILogger"] })
export class ConsoleLogger implements ILogger {
  log(message: string) {
    console.log(message);
  }
}
```

**Use Cases:**

- Utilities and helpers
- Third-party service wrappers
- Custom implementations of interfaces

## Method Decorators

Method decorators define HTTP routes and their behavior.

### HTTP Method Decorators

Define routes for different HTTP methods:

#### @Get

```typescript
@Controller("/users")
export class UserController {
  @Get("/")
  getAllUsers() {
    return [{ id: 1, name: "John" }];
  }

  @Get("/:id")
  getUser(@Param("id") id: string) {
    return { id, name: "John" };
  }
}
```

#### @Post

```typescript
@Controller("/users")
export class UserController {
  @Post("/")
  createUser(@Body() userData: CreateUserDto) {
    return { id: 1, ...userData };
  }
}
```

#### @Put

```typescript
@Controller("/users")
export class UserController {
  @Put("/:id")
  updateUser(@Param("id") id: string, @Body() userData: UpdateUserDto) {
    return { id, ...userData };
  }
}
```

#### @Delete

```typescript
@Controller("/users")
export class UserController {
  @Delete("/:id")
  deleteUser(@Param("id") id: string) {
    return { message: "User deleted" };
  }
}
```

#### @Patch

```typescript
@Controller("/users")
export class UserController {
  @Patch("/:id")
  partialUpdateUser(@Param("id") id: string, @Body() updates: Partial<User>) {
    return { id, ...updates };
  }
}
```

**All HTTP decorators accept:**

- `path` (string): The route path (default: '/')

### @Schema

Validates request data using Zod schemas and defines response schemas for OpenAPI documentation.

```typescript
import { z } from "zod";
import { Schema } from "bootifyjs";

const createUserSchema = {
  body: z.object({
    email: z.string().email(),
    name: z.string().min(2),
    age: z.number().min(18).optional(),
  }),
  query: z.object({
    sendEmail: z
      .string()
      .transform((val) => val === "true")
      .optional(),
  }),
  params: z.object({
    organizationId: z.string().uuid(),
  }),
  responses: {
    201: z.object({
      id: z.string(),
      email: z.string(),
      name: z.string(),
      createdAt: z.date(),
    }),
    400: z.object({
      error: z.string(),
      details: z.array(z.string()),
    }),
  },
};

@Controller("/users")
export class UserController {
  @Post("/")
  @Schema(createUserSchema)
  createUser(@Body() body: z.infer<typeof createUserSchema.body>) {
    return {
      id: "123",
      ...body,
      createdAt: new Date(),
    };
  }
}
```

**Schema Options:**

- `body`: Zod schema for request body
- `query`: Zod schema for query parameters
- `params`: Zod schema for route parameters
- `responses`: Object mapping status codes to response schemas

**Validation Behavior:**

- Invalid requests automatically return 400 Bad Request
- Validation errors include detailed error messages
- Validated data is transformed according to the schema

### @Swagger

Adds OpenAPI/Swagger documentation metadata to routes.

```typescript
import { Swagger } from "bootifyjs";

@Controller("/users")
export class UserController {
  @Get("/:id")
  @Swagger({
    summary: "Get user by ID",
    description: "Retrieves a single user by their unique identifier",
    tags: ["Users"],
    deprecated: false,
    operationId: "getUserById",
  })
  getUser(@Param("id") id: string) {
    return { id, name: "John" };
  }

  @Post("/")
  @Swagger({
    summary: "Create a new user",
    description: "Creates a new user account with the provided information",
    tags: ["Users", "Authentication"],
    security: [{ bearerAuth: [] }],
  })
  createUser(@Body() userData: any) {
    return userData;
  }
}
```

**Options:**

- `summary`: Short description of the endpoint
- `description`: Detailed description
- `tags`: Array of tags for grouping endpoints
- `deprecated`: Mark endpoint as deprecated
- `operationId`: Unique identifier for the operation
- `security`: Security requirements for the endpoint

### @UseMiddleware

Applies middleware to a route or entire controller.

```typescript
import { UseMiddleware } from "bootifyjs";

// Middleware function
const authenticate = async (request, reply) => {
  const token = request.headers.authorization;
  if (!token) {
    reply.code(401).send({ error: "Unauthorized" });
  }
};

const rateLimit = async (request, reply) => {
  // Rate limiting logic
};

// Apply to entire controller
@Controller("/admin")
@UseMiddleware(authenticate)
export class AdminController {
  @Get("/dashboard")
  getDashboard() {
    return { data: "Admin dashboard" };
  }
}

// Apply to specific route
@Controller("/api")
export class ApiController {
  @Post("/sensitive")
  @UseMiddleware(authenticate, rateLimit)
  sensitiveOperation(@Body() data: any) {
    return { success: true };
  }
}
```

**Parameters:**

- `...middlewares`: One or more middleware functions

**Middleware Signature:**

```typescript
type FastifyMiddleware = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<void> | void;
```

## Parameter Decorators

Parameter decorators extract data from the request and inject it into route handler parameters.

### @Body

Extracts the request body.

```typescript
@Controller("/users")
export class UserController {
  @Post("/")
  createUser(@Body() userData: CreateUserDto) {
    console.log(userData); // Full request body
    return userData;
  }
}
```

### @Param

Extracts a route parameter by name.

```typescript
@Controller("/users")
export class UserController {
  @Get("/:userId/posts/:postId")
  getPost(@Param("userId") userId: string, @Param("postId") postId: string) {
    return { userId, postId };
  }
}
```

### @Query

Extracts query parameters.

```typescript
@Controller("/users")
export class UserController {
  @Get("/")
  getUsers(
    @Query("page") page: string,
    @Query("limit") limit: string,
    @Query("sort") sort: string
  ) {
    return {
      page: parseInt(page || "1"),
      limit: parseInt(limit || "10"),
      sort: sort || "createdAt",
    };
  }
}
```

**Note:** Query parameters are always strings. Use Zod schemas with `@Schema` for automatic type conversion:

```typescript
const getUsersSchema = {
  query: z.object({
    page: z.string().transform(val => parseInt(val)).default('1'),
    limit: z.string().transform(val => parseInt(val)).default('10')
  })
};

@Get('/')
@Schema(getUsersSchema)
getUsers(@Query('page') page: number, @Query('limit') limit: number) {
  // page and limit are now numbers
}
```

### @Req

Injects the full Fastify request object.

```typescript
import { FastifyRequest } from "fastify";

@Controller("/api")
export class ApiController {
  @Get("/info")
  getRequestInfo(@Req() request: FastifyRequest) {
    return {
      method: request.method,
      url: request.url,
      headers: request.headers,
      ip: request.ip,
      hostname: request.hostname,
    };
  }
}
```

### @Res

Injects the Fastify reply object for manual response handling.

```typescript
import { FastifyReply } from "fastify";

@Controller("/files")
export class FileController {
  @Get("/download/:filename")
  downloadFile(
    @Param("filename") filename: string,
    @Res() reply: FastifyReply
  ) {
    reply
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .type("application/octet-stream")
      .send(fileBuffer);
  }
}
```

## Property Decorators

### @Autowired

Injects dependencies into class properties or constructor parameters.

#### Property Injection

```typescript
@Service()
export class UserService {
  @Autowired()
  private repository!: UserRepository;

  @Autowired()
  private logger!: Logger;

  getUser(id: string) {
    this.logger.info("Fetching user", { id });
    return this.repository.findById(id);
  }
}
```

#### Constructor Injection

```typescript
@Controller("/users")
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get("/:id")
  getUser(@Param("id") id: string) {
    return this.userService.getUser(id);
  }
}
```

#### Interface Injection

```typescript
// Inject by interface token
@Service()
export class NotificationService {
  @Autowired("IEmailService")
  private emailService!: IEmailService;

  // Or in constructor
  constructor(
    @Autowired("IEmailService")
    private readonly emailService: IEmailService
  ) {}
}
```

**Parameters:**

- `token` (optional): The token to resolve (required for interface injection)

## Combining Decorators

Decorators can be combined to create powerful, declarative route handlers:

```typescript
import { z } from "zod";

const createTodoSchema = {
  body: z.object({
    text: z.string().min(1).max(500),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
  }),
  responses: {
    201: z.object({
      id: z.string(),
      text: z.string(),
      priority: z.string(),
      completed: z.boolean(),
      createdAt: z.date(),
    }),
  },
};

@Controller("/todos")
@UseMiddleware(authenticate)
export class TodoController {
  constructor(private readonly todoService: TodoService) {}

  @Post("/")
  @Schema(createTodoSchema)
  @Swagger({
    summary: "Create a new todo",
    description: "Creates a new todo item with the provided text and priority",
    tags: ["Todos"],
    operationId: "createTodo",
  })
  @UseMiddleware(rateLimit)
  async createTodo(@Body() body: z.infer<typeof createTodoSchema.body>) {
    return await this.todoService.createTodo(body);
  }
}
```

**Execution Order:**

1. Controller-level middleware (`authenticate`)
2. Route-level middleware (`rateLimit`)
3. Schema validation
4. Route handler execution

## Custom Decorators

You can create custom decorators for your specific needs:

```typescript
// Custom decorator to extract user from request
export const CurrentUser = () => {
  return (
    target: any,
    propertyKey: string | symbol,
    parameterIndex: number
  ) => {
    // Store metadata about this parameter
    const params =
      Reflect.getMetadata("custom:params", target, propertyKey) || [];
    params[parameterIndex] = { type: "currentUser" };
    Reflect.defineMetadata("custom:params", params, target, propertyKey);
  };
};

// Usage
@Controller("/profile")
export class ProfileController {
  @Get("/")
  getProfile(@CurrentUser() user: User) {
    return user;
  }
}
```

## Best Practices

### 1. Keep Decorators Readable

```typescript
// Good: Clear and organized
@Controller("/users")
export class UserController {
  @Get("/:id")
  @Schema(getUserSchema)
  @Swagger({ summary: "Get user by ID", tags: ["Users"] })
  getUser(@Param("id") id: string) {}
}

// Avoid: Too many decorators makes it hard to read
@Controller("/users")
@UseMiddleware(auth, logging, metrics, validation, sanitization)
@RateLimit(100)
@Cache(60)
export class UserController {}
```

### 2. Use Schema Validation

Always validate input data with `@Schema`:

```typescript
// Good: Validated input
@Post('/')
@Schema({
  body: z.object({
    email: z.string().email(),
    age: z.number().min(0)
  })
})
createUser(@Body() body: ValidatedUser) {}

// Bad: No validation
@Post('/')
createUser(@Body() body: any) {} // Unsafe!
```

### 3. Combine with TypeScript Types

```typescript
// Define types from schemas
const userSchema = z.object({
  email: z.string().email(),
  name: z.string()
});

type CreateUserDto = z.infer<typeof userSchema>;

// Use in route handlers
@Post('/')
@Schema({ body: userSchema })
createUser(@Body() body: CreateUserDto) {
  // body is fully typed
}
```

### 4. Document with Swagger

Add Swagger documentation to all public APIs:

```typescript
@Get('/:id')
@Swagger({
  summary: 'Get user by ID',
  description: 'Retrieves detailed information about a user',
  tags: ['Users']
})
getUser(@Param('id') id: string) {}
```

## Next Steps

- Learn about [Dependency Injection](./dependency-injection.md) to understand how `@Autowired` works
- Explore [Request Context](./request-context.md) for request-scoped data
- Read about [Application Lifecycle](./lifecycle.md) to understand when decorators are processed
