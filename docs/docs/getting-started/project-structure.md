---
id: project-structure
title: Project Structure
sidebar_label: Project Structure
sidebar_position: 3
description: Learn how to organize your BootifyJS application for scalability and maintainability
keywords:
  [bootifyjs, project structure, architecture, organization, best practices]
---

# Project Structure

A well-organized project structure is crucial for building maintainable and scalable applications. This guide shows you the recommended way to structure your BootifyJS projects.

## Basic Structure

Here's the recommended structure for a BootifyJS application:

```
my-bootify-app/
├── src/
│   ├── controllers/          # HTTP request handlers
│   ├── services/             # Business logic
│   ├── repositories/         # Data access layer
│   ├── models/               # Data models and types
│   ├── middleware/           # Custom middleware
│   ├── events/               # Event definitions and handlers
│   ├── config/               # Configuration files
│   ├── utils/                # Utility functions
│   └── index.ts              # Application entry point
├── tests/                    # Test files
├── .env                      # Environment variables
├── .env.example              # Environment template
├── .gitignore               # Git ignore rules
├── package.json             # Dependencies and scripts
├── tsconfig.json            # TypeScript configuration
└── README.md                # Project documentation
```

## Directory Breakdown

### Controllers (`src/controllers/`)

Controllers handle HTTP requests and responses. They should be thin, delegating business logic to services.

```typescript title="src/controllers/user.controller.ts"
import { Controller, Get, Post, Body, Param, Autowired } from "bootifyjs";
import { UserService } from "../services/user.service";

@Controller("/api/users")
export class UserController {
  @Autowired()
  private userService!: UserService;

  @Get("/")
  async getAllUsers() {
    return this.userService.findAll();
  }

  @Get("/:id")
  async getUserById(@Param("id") id: string) {
    return this.userService.findById(id);
  }

  @Post("/")
  async createUser(@Body() body: any) {
    return this.userService.create(body);
  }
}
```

**Naming Convention**: `*.controller.ts`

### Services (`src/services/`)

Services contain business logic and orchestrate operations between repositories and other services.

```typescript title="src/services/user.service.ts"
import { Service, Autowired } from "bootifyjs";
import { UserRepository } from "../repositories/user.repository";
import { EmailService } from "./email.service";

@Service()
export class UserService {
  @Autowired()
  private userRepository!: UserRepository;

  @Autowired()
  private emailService!: EmailService;

  async findAll() {
    return this.userRepository.findAll();
  }

  async create(data: any) {
    const user = await this.userRepository.create(data);
    await this.emailService.sendWelcomeEmail(user.email);
    return user;
  }
}
```

**Naming Convention**: `*.service.ts`

### Repositories (`src/repositories/`)

Repositories handle data access and database operations. They abstract the data layer from business logic.

```typescript title="src/repositories/user.repository.ts"
import { Repository } from "bootifyjs";

@Repository()
export class UserRepository {
  private users: any[] = [];

  async findAll() {
    return this.users;
  }

  async findById(id: string) {
    return this.users.find((user) => user.id === id);
  }

  async create(data: any) {
    const user = { id: Date.now().toString(), ...data };
    this.users.push(user);
    return user;
  }

  async update(id: string, data: any) {
    const index = this.users.findIndex((user) => user.id === id);
    if (index !== -1) {
      this.users[index] = { ...this.users[index], ...data };
      return this.users[index];
    }
    return null;
  }

  async delete(id: string) {
    const index = this.users.findIndex((user) => user.id === id);
    if (index !== -1) {
      this.users.splice(index, 1);
      return true;
    }
    return false;
  }
}
```

**Naming Convention**: `*.repository.ts`

### Models (`src/models/`)

Models define data structures, types, and validation schemas.

```typescript title="src/models/user.model.ts"
import { z } from "zod";

// Zod schema for validation
export const UserSchema = z.object({
  id: z.string(),
  name: z.string().min(2).max(50),
  email: z.string().email(),
  age: z.number().min(18).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// TypeScript type derived from schema
export type User = z.infer<typeof UserSchema>;

// DTO schemas
export const CreateUserSchema = UserSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const UpdateUserSchema = CreateUserSchema.partial();

export type CreateUserDto = z.infer<typeof CreateUserSchema>;
export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;
```

**Naming Convention**: `*.model.ts` or `*.schema.ts`

### Middleware (`src/middleware/`)

Custom middleware for request processing, authentication, logging, etc.

```typescript title="src/middleware/auth.middleware.ts"
import { FastifyRequest, FastifyReply } from "fastify";

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const token = request.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    reply.code(401).send({ error: "Unauthorized" });
    return;
  }

  // Verify token logic here
  // Attach user to request
  (request as any).user = { id: "1", name: "John" };
}
```

**Naming Convention**: `*.middleware.ts`

### Events (`src/events/`)

Event definitions and event handlers for event-driven architecture.

```typescript title="src/events/user.events.ts"
export class UserCreatedEvent {
  constructor(public readonly userId: string, public readonly email: string) {}
}

export class UserUpdatedEvent {
  constructor(
    public readonly userId: string,
    public readonly changes: Record<string, any>
  ) {}
}
```

```typescript title="src/events/user-created.handler.ts"
import { EventHandler } from "bootifyjs";
import { UserCreatedEvent } from "./user.events";

@EventHandler(UserCreatedEvent)
export class UserCreatedHandler {
  async handle(event: UserCreatedEvent) {
    console.log(`User created: ${event.userId}`);
    // Send welcome email, create audit log, etc.
  }
}
```

**Naming Convention**: `*.events.ts` for events, `*.handler.ts` for handlers

### Config (`src/config/`)

Configuration files and environment variable schemas.

```typescript title="src/config/database.config.ts"
import { z } from "zod";

export const databaseConfigSchema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_SIZE: z.string().transform(Number).default("10"),
  DATABASE_TIMEOUT: z.string().transform(Number).default("30000"),
});

export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;
```

**Naming Convention**: `*.config.ts`

### Utils (`src/utils/`)

Utility functions and helper methods.

```typescript title="src/utils/string.utils.ts"
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```

**Naming Convention**: `*.utils.ts` or `*.helper.ts`

## Entry Point (`src/index.ts`)

The main application file that bootstraps your BootifyJS application:

```typescript title="src/index.ts"
import "reflect-metadata";
import dotenv from "dotenv";
import { createBootify } from "bootifyjs";
import { z } from "zod";

// Import controllers
import { UserController } from "./controllers/user.controller";
import { ProductController } from "./controllers/product.controller";

// Import middleware
import { authMiddleware } from "./middleware/auth.middleware";
import { loggingMiddleware } from "./middleware/logging.middleware";

// Load environment variables
dotenv.config();

// Environment schema
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]),
  PORT: z.string().transform(Number),
  DATABASE_URL: z.string().url(),
});

async function bootstrap() {
  const { start, app } = await createBootify()
    // Configuration
    .useConfig(envSchema)
    .setPort(process.env.PORT ? parseInt(process.env.PORT) : 8080)
    .setHostname("0.0.0.0")

    // Middleware
    .useMiddlewares([loggingMiddleware, authMiddleware])

    // Controllers
    .useControllers([UserController, ProductController])

    // Lifecycle hooks
    .beforeStart(async () => {
      console.log("Initializing database connection...");
      // Initialize database, cache, etc.
    })

    .afterStart(async () => {
      console.log("Application started successfully!");
    })

    .build();

  await start();
}

bootstrap().catch(console.error);
```

## Feature-Based Structure (Alternative)

For larger applications, consider organizing by feature instead of by type:

```
src/
├── features/
│   ├── users/
│   │   ├── user.controller.ts
│   │   ├── user.service.ts
│   │   ├── user.repository.ts
│   │   ├── user.model.ts
│   │   ├── user.events.ts
│   │   └── index.ts
│   ├── products/
│   │   ├── product.controller.ts
│   │   ├── product.service.ts
│   │   ├── product.repository.ts
│   │   ├── product.model.ts
│   │   └── index.ts
│   └── orders/
│       ├── order.controller.ts
│       ├── order.service.ts
│       ├── order.repository.ts
│       ├── order.model.ts
│       └── index.ts
├── shared/
│   ├── middleware/
│   ├── utils/
│   └── config/
└── index.ts
```

Each feature exports its components:

```typescript title="src/features/users/index.ts"
export * from "./user.controller";
export * from "./user.service";
export * from "./user.repository";
export * from "./user.model";
export * from "./user.events";
```

## Environment Files

### `.env` (Git-ignored)

Contains actual environment variables:

```bash title=".env"
NODE_ENV=development
PORT=8080
HOST=localhost

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/mydb
DATABASE_POOL_SIZE=10

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=7d

# External APIs
STRIPE_API_KEY=sk_test_...
SENDGRID_API_KEY=SG...
```

### `.env.example` (Committed to Git)

Template showing required variables:

```bash title=".env.example"
NODE_ENV=development
PORT=8080
HOST=localhost

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
DATABASE_POOL_SIZE=10

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=change-me-in-production
JWT_EXPIRES_IN=7d

# External APIs
STRIPE_API_KEY=
SENDGRID_API_KEY=
```

## Testing Structure

Organize tests to mirror your source structure:

```
tests/
├── unit/
│   ├── services/
│   │   └── user.service.test.ts
│   └── utils/
│       └── string.utils.test.ts
├── integration/
│   ├── controllers/
│   │   └── user.controller.test.ts
│   └── repositories/
│       └── user.repository.test.ts
└── e2e/
    └── user-flow.test.ts
```

## Best Practices

### 1. Single Responsibility

Each file should have a single, clear purpose:

```typescript
// ✅ Good - Single responsibility
@Service()
export class UserService {
  async findAll() {
    /* ... */
  }
  async findById(id: string) {
    /* ... */
  }
  async create(data: any) {
    /* ... */
  }
}

// ❌ Bad - Multiple responsibilities
@Service()
export class UserService {
  async findAll() {
    /* ... */
  }
  async sendEmail() {
    /* ... */
  } // Should be in EmailService
  async generatePDF() {
    /* ... */
  } // Should be in PDFService
}
```

### 2. Dependency Direction

Dependencies should flow inward:

- Controllers depend on Services
- Services depend on Repositories
- Repositories depend on Models
- Never the reverse

### 3. Barrel Exports

Use `index.ts` files to simplify imports:

```typescript title="src/controllers/index.ts"
export * from "./user.controller";
export * from "./product.controller";
export * from "./order.controller";
```

Then import like this:

```typescript
import { UserController, ProductController } from "./controllers";
```

### 4. Naming Conventions

- **Files**: Use kebab-case: `user-service.ts` or `user.service.ts`
- **Classes**: Use PascalCase: `UserService`, `UserController`
- **Functions**: Use camelCase: `findUserById`, `createUser`
- **Constants**: Use UPPER_SNAKE_CASE: `MAX_RETRY_COUNT`

### 5. Type Safety

Always define types for your data:

```typescript
// ✅ Good
interface CreateUserDto {
  name: string;
  email: string;
}

@Post('/')
createUser(@Body() body: CreateUserDto) {
  return this.userService.create(body);
}

// ❌ Bad
@Post('/')
createUser(@Body() body: any) {
  return this.userService.create(body);
}
```

## Next Steps

Now that you understand project structure, you're ready to:

- Build your [First Application](./first-application.md) with a complete example
- Learn about Core Concepts (coming soon)
- Explore Dependency Injection patterns (coming soon)
- Check out Code Templates for common patterns (coming soon)
