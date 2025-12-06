---
id: core-controllers
title: Controllers
sidebar_label: Controllers
description: Complete guide to creating controllers and handling HTTP requests in BootifyJS
keywords: [bootifyjs, controllers, routes, http, api endpoints, rest api]
---

# Controllers

Controllers are classes that handle HTTP requests and define your API endpoints. They act as the entry point for client requests, coordinate with services to execute business logic, and return responses.

## Creating a Controller

Use the `@Controller` decorator to mark a class as a controller:

```typescript
import { Controller, Get } from "bootifyjs";

@Controller("/api/users")
export class UserController {
  @Get("/")
  getAllUsers() {
    return [
      { id: 1, name: "John Doe" },
      { id: 2, name: "Jane Smith" },
    ];
  }
}
```

The `@Controller` decorator accepts a route prefix that applies to all routes in the controller.

## Route Prefixes

The prefix parameter defines the base path for all routes in the controller:

```typescript
@Controller("/api/v1/products")
export class ProductController {
  @Get("/") // Resolves to: GET /api/v1/products/
  getAllProducts() {}

  @Get("/:id") // Resolves to: GET /api/v1/products/:id
  getProduct() {}

  @Post("/") // Resolves to: POST /api/v1/products/
  createProduct() {}
}
```

**Empty prefix:**

```typescript
@Controller() // or @Controller('')
export class HealthController {
  @Get("/health") // Resolves to: GET /health
  checkHealth() {
    return { status: "ok" };
  }
}
```

## Defining Routes

Use HTTP method decorators to define routes:

```typescript
import { Controller, Get, Post, Put, Delete, Patch } from "bootifyjs";

@Controller("/api/todos")
export class TodoController {
  @Get("/")
  getAllTodos() {
    return [];
  }

  @Get("/:id")
  getTodo() {}

  @Post("/")
  createTodo() {}

  @Put("/:id")
  updateTodo() {}

  @Patch("/:id")
  partialUpdateTodo() {}

  @Delete("/:id")
  deleteTodo() {}
}
```

## Extracting Request Data

Use parameter decorators to extract data from requests:

### @Body - Request Body

Extract the entire request body:

```typescript
import { Controller, Post, Body } from "bootifyjs";

@Controller("/api/users")
export class UserController {
  @Post("/")
  createUser(@Body() userData: CreateUserDto) {
    console.log(userData);
    // { name: 'John', email: 'john@example.com' }
    return userData;
  }
}
```

### @Param - Route Parameters

Extract route parameters by name:

```typescript
import { Controller, Get, Delete, Param } from "bootifyjs";

@Controller("/api/users")
export class UserController {
  @Get("/:userId")
  getUser(@Param("userId") userId: string) {
    return { id: userId, name: "John" };
  }

  @Get("/:userId/posts/:postId")
  getUserPost(
    @Param("userId") userId: string,
    @Param("postId") postId: string
  ) {
    return { userId, postId };
  }

  @Delete("/:id")
  deleteUser(@Param("id") id: string) {
    return { message: `User ${id} deleted` };
  }
}
```

### @Query - Query Parameters

Extract query parameters:

```typescript
import { Controller, Get, Query } from "bootifyjs";

@Controller("/api/products")
export class ProductController {
  @Get("/")
  getProducts(
    @Query("page") page: string,
    @Query("limit") limit: string,
    @Query("sort") sort: string,
    @Query("category") category: string
  ) {
    return {
      page: parseInt(page || "1"),
      limit: parseInt(limit || "10"),
      sort: sort || "createdAt",
      category: category || "all",
    };
  }
}

// GET /api/products?page=2&limit=20&sort=price&category=electronics
// Returns: { page: 2, limit: 20, sort: 'price', category: 'electronics' }
```

### @Req - Full Request Object

Access the Fastify request object:

```typescript
import { Controller, Get, Req } from "bootifyjs";
import { FastifyRequest } from "fastify";

@Controller("/api")
export class ApiController {
  @Get("/request-info")
  getRequestInfo(@Req() request: FastifyRequest) {
    return {
      method: request.method,
      url: request.url,
      headers: request.headers,
      ip: request.ip,
      hostname: request.hostname,
      protocol: request.protocol,
    };
  }
}
```

### @Res - Reply Object

Access the Fastify reply object for manual response handling:

```typescript
import { Controller, Get, Res, Param } from "bootifyjs";
import { FastifyReply } from "fastify";

@Controller("/api/files")
export class FileController {
  @Get("/download/:filename")
  downloadFile(
    @Param("filename") filename: string,
    @Res() reply: FastifyReply
  ) {
    const fileBuffer = Buffer.from("file content");

    reply
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .type("application/octet-stream")
      .send(fileBuffer);
  }

  @Get("/redirect")
  redirect(@Res() reply: FastifyReply) {
    reply.redirect(302, "/api/home");
  }
}
```

## Combining Parameters

You can use multiple parameter decorators in a single route:

```typescript
@Controller("/api/organizations")
export class OrganizationController {
  @Post("/:orgId/users")
  @Schema({
    params: z.object({
      orgId: z.string().uuid(),
    }),
    body: z.object({
      name: z.string(),
      email: z.string().email(),
    }),
    query: z.object({
      sendEmail: z
        .string()
        .transform((val) => val === "true")
        .optional(),
    }),
  })
  addUserToOrganization(
    @Param("orgId") orgId: string,
    @Body() userData: { name: string; email: string },
    @Query("sendEmail") sendEmail: boolean
  ) {
    console.log({ orgId, userData, sendEmail });
    return { success: true };
  }
}

// POST /api/organizations/123e4567-e89b-12d3-a456-426614174000/users?sendEmail=true
// Body: { "name": "John", "email": "john@example.com" }
```

## Dependency Injection in Controllers

Controllers can inject services and other dependencies:

### Constructor Injection

```typescript
import { Controller, Get, Post, Body } from "bootifyjs";

@Controller("/api/todos")
export class TodoController {
  constructor(
    private readonly todoService: TodoService,
    private readonly logger: Logger
  ) {}

  @Get("/")
  getAllTodos() {
    this.logger.info("Fetching all todos");
    return this.todoService.getAllTodos();
  }

  @Post("/")
  createTodo(@Body() body: { text: string }) {
    this.logger.info("Creating todo", { text: body.text });
    return this.todoService.createTodo(body.text);
  }
}
```

### Property Injection

```typescript
import { Controller, Get, Autowired } from "bootifyjs";

@Controller("/api/users")
export class UserController {
  @Autowired()
  private readonly userService!: UserService;

  @Autowired()
  private readonly logger!: Logger;

  @Get("/")
  getAllUsers() {
    this.logger.info("Fetching all users");
    return this.userService.getAllUsers();
  }
}
```

## Async Routes

Controllers support async/await for asynchronous operations:

```typescript
@Controller("/api/users")
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get("/:id")
  async getUser(@Param("id") id: string) {
    const user = await this.userService.findById(id);
    if (!user) {
      throw new Error("User not found");
    }
    return user;
  }

  @Post("/")
  async createUser(@Body() userData: CreateUserDto) {
    const user = await this.userService.create(userData);
    await this.emailService.sendWelcomeEmail(user.email);
    return user;
  }
}
```

## Error Handling

Throw errors in controllers to return error responses:

```typescript
@Controller("/api/products")
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get("/:id")
  getProduct(@Param("id") id: string) {
    const product = this.productService.findById(id);

    if (!product) {
      const error: any = new Error("Product not found");
      error.statusCode = 404;
      throw error;
    }

    return product;
  }

  @Delete("/:id")
  deleteProduct(@Param("id") id: string) {
    const hasPermission = this.checkPermission();

    if (!hasPermission) {
      const error: any = new Error("Forbidden");
      error.statusCode = 403;
      throw error;
    }

    this.productService.delete(id);
    return { message: "Product deleted" };
  }
}
```

## Response Status Codes

By default, routes return:

- `200 OK` for GET, PUT, PATCH, DELETE
- `201 Created` for POST

To customize status codes, use the `@Res()` decorator:

```typescript
@Controller("/api/users")
export class UserController {
  @Post("/")
  createUser(@Body() userData: any, @Res() reply: FastifyReply) {
    const user = this.userService.create(userData);
    reply.code(201).send(user);
  }

  @Delete("/:id")
  deleteUser(@Param("id") id: string, @Res() reply: FastifyReply) {
    this.userService.delete(id);
    reply.code(204).send();
  }
}
```

## Controller Middleware

Apply middleware to all routes in a controller:

```typescript
import { Controller, Get, UseMiddleware } from "bootifyjs";

const authenticate = async (request, reply) => {
  const token = request.headers.authorization;
  if (!token) {
    reply.code(401).send({ error: "Unauthorized" });
  }
};

const logRequest = async (request, reply) => {
  console.log(`${request.method} ${request.url}`);
};

@Controller("/api/admin")
@UseMiddleware(authenticate, logRequest)
export class AdminController {
  @Get("/dashboard")
  getDashboard() {
    return { data: "Admin dashboard" };
  }

  @Get("/users")
  getUsers() {
    return { users: [] };
  }
}
```

Both routes will execute `authenticate` and `logRequest` middleware.

## Complete Example

Here's a complete controller with all features:

```typescript
import { z } from "zod";
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Schema,
  Swagger,
  UseMiddleware,
} from "bootifyjs";

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

const updateTodoSchema = {
  params: z.object({
    id: z.string().regex(/^\d+$/),
  }),
  body: z.object({
    text: z.string().min(1).max(500).optional(),
    completed: z.boolean().optional(),
  }),
};

@Controller("/api/todos")
@UseMiddleware(authenticate)
export class TodoController {
  constructor(
    private readonly todoService: TodoService,
    private readonly logger: Logger
  ) {}

  @Get("/")
  @Swagger({
    summary: "Get all todos",
    description: "Retrieves a list of all todo items",
    tags: ["Todos"],
  })
  getAllTodos(
    @Query("completed") completed: string,
    @Query("priority") priority: string
  ) {
    this.logger.info("Fetching todos", { completed, priority });
    return this.todoService.getAllTodos({ completed, priority });
  }

  @Get("/:id")
  @Swagger({
    summary: "Get todo by ID",
    description: "Retrieves a single todo item by its unique identifier",
    tags: ["Todos"],
  })
  getTodoById(@Param("id") id: string) {
    const todo = this.todoService.getTodoById(id);
    if (!todo) {
      const error: any = new Error("Todo not found");
      error.statusCode = 404;
      throw error;
    }
    return todo;
  }

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
    this.logger.info("Creating todo", body);
    return await this.todoService.createTodo(body);
  }

  @Put("/:id")
  @Schema(updateTodoSchema)
  @Swagger({
    summary: "Update todo",
    description: "Updates an existing todo item",
    tags: ["Todos"],
  })
  updateTodo(
    @Param("id") id: string,
    @Body() body: z.infer<typeof updateTodoSchema.body>
  ) {
    return this.todoService.updateTodo(id, body);
  }

  @Delete("/:id")
  @Swagger({
    summary: "Delete todo",
    description: "Deletes a todo item by ID",
    tags: ["Todos"],
  })
  deleteTodo(@Param("id") id: string) {
    this.todoService.deleteTodo(id);
    return { message: "Todo deleted successfully" };
  }
}
```

## Best Practices

### 1. Keep Controllers Thin

Controllers should delegate business logic to services:

```typescript
// Good: Thin controller
@Controller("/api/orders")
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post("/")
  createOrder(@Body() orderData: CreateOrderDto) {
    return this.orderService.createOrder(orderData);
  }
}

// Bad: Fat controller with business logic
@Controller("/api/orders")
export class OrderController {
  @Post("/")
  createOrder(@Body() orderData: CreateOrderDto) {
    // Validation logic
    if (!orderData.items || orderData.items.length === 0) {
      throw new Error("Order must have items");
    }

    // Calculation logic
    const total = orderData.items.reduce((sum, item) => sum + item.price, 0);

    // Database logic
    const order = db.orders.create({ ...orderData, total });

    // Email logic
    sendEmail(orderData.email, "Order confirmation");

    return order;
  }
}
```

### 2. Use Descriptive Route Names

```typescript
// Good: Clear and descriptive
@Get('/users/:userId/orders/:orderId')
getUserOrder(@Param('userId') userId: string, @Param('orderId') orderId: string) {}

// Bad: Unclear
@Get('/u/:id1/o/:id2')
get(@Param('id1') id1: string, @Param('id2') id2: string) {}
```

### 3. Group Related Routes

```typescript
// Good: Organized by resource
@Controller("/api/users")
export class UserController {
  @Get("/") getAllUsers() {}
  @Get("/:id") getUser() {}
  @Post("/") createUser() {}
}

@Controller("/api/products")
export class ProductController {
  @Get("/") getAllProducts() {}
  @Get("/:id") getProduct() {}
}

// Bad: Mixed resources
@Controller("/api")
export class ApiController {
  @Get("/users") getAllUsers() {}
  @Get("/products") getAllProducts() {}
  @Get("/orders") getAllOrders() {}
}
```

### 4. Always Validate Input

Use `@Schema` to validate all input data:

```typescript
@Post('/')
@Schema({
  body: z.object({
    email: z.string().email(),
    age: z.number().min(0).max(150)
  })
})
createUser(@Body() body: ValidatedUser) {
  // body is validated and typed
}
```

## Next Steps

- Learn about [Services](./services.md) to organize business logic
- Explore [Routing](./routing.md) for advanced routing patterns
- Read about [Validation](./validation.md) to validate requests with Zod
