---
id: quick-start
title: Quick Start
sidebar_label: Quick Start
sidebar_position: 2
description: Build your first BootifyJS API endpoint in under 5 minutes
keywords: [bootifyjs, quick start, tutorial, getting started, rest api]
---

# Quick Start

Build your first BootifyJS API endpoint in under 5 minutes. This guide assumes you've already [installed BootifyJS](./installation.md).

## Create Your First Controller

Controllers handle incoming HTTP requests and return responses. Let's create a simple controller:

```typescript title="src/controllers/hello.controller.ts"
import { Controller, Get } from "bootifyjs";

@Controller("/api")
export class HelloController {
  @Get("/hello")
  sayHello() {
    return { message: "Hello from BootifyJS!" };
  }

  @Get("/hello/:name")
  greetUser(@Param("name") name: string) {
    return { message: `Hello, ${name}!` };
  }
}
```

:::tip What's Happening Here?

- `@Controller('/api')` - Defines a controller with a base path of `/api`
- `@Get('/hello')` - Maps the method to handle GET requests at `/api/hello`
- `@Param('name')` - Extracts the `name` parameter from the URL
  :::

## Bootstrap Your Application

Create the main application file:

```typescript title="src/index.ts"
import "reflect-metadata";
import { createBootify } from "bootifyjs";
import { HelloController } from "./controllers/hello.controller";

async function main() {
  const { start } = await createBootify()
    .setPort(8080)
    .useControllers([HelloController])
    .build();

  await start();
}

main();
```

## Run Your Application

Start the development server:

```bash
npm run dev
```

You should see the BootifyJS startup banner:

```
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   BootifyJS Application Starting...                     ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝

✓ Registering Controllers
  → 1 controllers registered

✓ Server listening at http://localhost:8080
```

## Test Your Endpoints

Open your browser or use curl to test your endpoints:

```bash
# Test the hello endpoint
curl http://localhost:8080/api/hello

# Response:
# {"message":"Hello from BootifyJS!"}

# Test with a parameter
curl http://localhost:8080/api/hello/John

# Response:
# {"message":"Hello, John!"}
```

## Add More HTTP Methods

Let's expand our controller with POST, PUT, and DELETE methods:

```typescript title="src/controllers/hello.controller.ts"
import { Controller, Get, Post, Put, Delete, Body, Param } from "bootifyjs";

interface CreateUserDto {
  name: string;
  email: string;
}

@Controller("/api/users")
export class UserController {
  // GET /api/users
  @Get("/")
  getAllUsers() {
    return [
      { id: 1, name: "John Doe", email: "john@example.com" },
      { id: 2, name: "Jane Smith", email: "jane@example.com" },
    ];
  }

  // GET /api/users/:id
  @Get("/:id")
  getUserById(@Param("id") id: string) {
    return { id, name: "John Doe", email: "john@example.com" };
  }

  // POST /api/users
  @Post("/")
  createUser(@Body() body: CreateUserDto) {
    return {
      id: 3,
      ...body,
      createdAt: new Date().toISOString(),
    };
  }

  // PUT /api/users/:id
  @Put("/:id")
  updateUser(@Param("id") id: string, @Body() body: Partial<CreateUserDto>) {
    return {
      id,
      ...body,
      updatedAt: new Date().toISOString(),
    };
  }

  // DELETE /api/users/:id
  @Delete("/:id")
  deleteUser(@Param("id") id: string) {
    return { message: `User ${id} deleted successfully` };
  }
}
```

Don't forget to register the new controller:

```typescript title="src/index.ts"
import { UserController } from "./controllers/user.controller";

const { start } = await createBootify()
  .setPort(8080)
  .useControllers([HelloController, UserController])
  .build();
```

## Add Request Validation

Use Zod schemas to validate incoming requests:

```typescript title="src/controllers/user.controller.ts"
import { Controller, Post, Body, Schema } from "bootifyjs";
import { z } from "zod";

const createUserSchema = z.object({
  name: z.string().min(2).max(50),
  email: z.string().email(),
  age: z.number().min(18).optional(),
});

@Controller("/api/users")
export class UserController {
  @Post("/")
  @Schema({
    body: createUserSchema,
  })
  createUser(@Body() body: z.infer<typeof createUserSchema>) {
    // Body is automatically validated and typed!
    return {
      id: 3,
      ...body,
      createdAt: new Date().toISOString(),
    };
  }
}
```

Now if you send invalid data:

```bash
curl -X POST http://localhost:8080/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"A","email":"invalid"}'

# Response (400 Bad Request):
# {
#   "statusCode": 400,
#   "error": "Bad Request",
#   "message": "Validation failed"
# }
```

## Add Dependency Injection

Create a service to handle business logic:

```typescript title="src/services/user.service.ts"
import { Service } from "bootifyjs";

@Service()
export class UserService {
  private users = [
    { id: 1, name: "John Doe", email: "john@example.com" },
    { id: 2, name: "Jane Smith", email: "jane@example.com" },
  ];

  getAllUsers() {
    return this.users;
  }

  getUserById(id: number) {
    return this.users.find((user) => user.id === id);
  }

  createUser(data: { name: string; email: string }) {
    const newUser = {
      id: this.users.length + 1,
      ...data,
    };
    this.users.push(newUser);
    return newUser;
  }
}
```

Inject the service into your controller:

```typescript title="src/controllers/user.controller.ts"
import { Controller, Get, Post, Body, Autowired } from "bootifyjs";
import { UserService } from "../services/user.service";

@Controller("/api/users")
export class UserController {
  @Autowired()
  private userService!: UserService;

  @Get("/")
  getAllUsers() {
    return this.userService.getAllUsers();
  }

  @Post("/")
  createUser(@Body() body: { name: string; email: string }) {
    return this.userService.createUser(body);
  }
}
```

:::tip Dependency Injection
The `@Autowired()` decorator automatically injects the `UserService` instance into your controller. BootifyJS manages the lifecycle and ensures you get the same instance everywhere (singleton by default).
:::

## Add Environment Configuration

Use Zod to validate environment variables:

```typescript title="src/index.ts"
import "reflect-metadata";
import { createBootify } from "bootifyjs";
import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]),
  PORT: z.string().transform(Number),
  DATABASE_URL: z.string().url().optional(),
});

async function main() {
  const { start } = await createBootify()
    .useConfig(envSchema)
    .setPort(process.env.PORT ? parseInt(process.env.PORT) : 8080)
    .useControllers([UserController])
    .build();

  await start();
}

main();
```

## What's Next?

You've just built a working REST API with BootifyJS! Here's what to explore next:

- **[Project Structure](./project-structure.md)** - Learn how to organize your code
- **[First Application](./first-application.md)** - Build a complete CRUD application
- **Core Concepts** - Understand the framework architecture (coming soon)
- **Modules** - Explore caching, events, logging, and more (coming soon)

## Complete Example

Here's the complete code for a working API:

```typescript title="src/index.ts"
import "reflect-metadata";
import {
  createBootify,
  Controller,
  Get,
  Post,
  Body,
  Service,
  Autowired,
  Schema,
} from "bootifyjs";
import { z } from "zod";

// Service
@Service()
class UserService {
  private users = [{ id: 1, name: "John Doe", email: "john@example.com" }];

  getAll() {
    return this.users;
  }

  create(data: { name: string; email: string }) {
    const user = { id: this.users.length + 1, ...data };
    this.users.push(user);
    return user;
  }
}

// Validation Schema
const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
});

// Controller
@Controller("/api/users")
class UserController {
  @Autowired()
  private userService!: UserService;

  @Get("/")
  getAll() {
    return this.userService.getAll();
  }

  @Post("/")
  @Schema({ body: createUserSchema })
  create(@Body() body: z.infer<typeof createUserSchema>) {
    return this.userService.create(body);
  }
}

// Bootstrap
async function main() {
  const { start } = await createBootify()
    .setPort(8080)
    .useControllers([UserController])
    .build();

  await start();
}

main();
```

Run it and test:

```bash
# Get all users
curl http://localhost:8080/api/users

# Create a user
curl -X POST http://localhost:8080/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com"}'
```

Congratulations! You've built your first BootifyJS application. 🎉
