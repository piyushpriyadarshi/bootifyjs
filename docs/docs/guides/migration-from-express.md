---
id: migration-from-express
title: Migrating from Express
sidebar_label: From Express
description: Step-by-step guide to migrate your Express application to BootifyJS
keywords: [bootifyjs, express, migration, nodejs, typescript]
---

# Migrating from Express to BootifyJS

This guide will help you migrate your Express application to BootifyJS with practical examples and step-by-step instructions.

## Why Migrate?

### Benefits of BootifyJS over Express

- **Better Performance**: Built on Fastify, significantly faster than Express
- **Type Safety**: First-class TypeScript support with decorators
- **Built-in Features**: DI, caching, events, validation without additional libraries
- **Less Boilerplate**: Decorators reduce repetitive code
- **Better Structure**: Encourages clean architecture patterns
- **Modern Patterns**: Decorator-based, declarative approach

## Migration Strategy

### Recommended Approach

1. **Incremental Migration**: Migrate route by route, not all at once
2. **Start with New Features**: Build new endpoints in BootifyJS
3. **Refactor Gradually**: Move existing routes over time
4. **Run Side-by-Side**: Both frameworks can coexist during migration

## Step-by-Step Migration

### 1. Installation

First, install BootifyJS alongside your existing Express app:

```bash
npm install bootifyjs fastify zod reflect-metadata
```

Update your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "target": "ES2020",
    "module": "commonjs",
    "strict": true
  }
}
```

### 2. Basic Server Setup

**Express:**

```javascript
const express = require("express");
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
```

**BootifyJS:**

```typescript
import { createBootify } from "bootifyjs";
import { UserController } from "./controllers";

const app = await createBootify()
  .setPort(3000)
  .useControllers([UserController])
  .build();

await app.start();
```

### 3. Route Handlers

#### Simple GET Route

**Express:**

```javascript
app.get("/users", (req, res) => {
  const users = [
    { id: 1, name: "John" },
    { id: 2, name: "Jane" },
  ];
  res.json(users);
});
```

**BootifyJS:**

```typescript
import { Controller, Get } from "bootifyjs";

@Controller("/users")
export class UserController {
  @Get("/")
  getAllUsers() {
    return [
      { id: 1, name: "John" },
      { id: 2, name: "Jane" },
    ];
  }
}
```

#### Route with Parameters

**Express:**

```javascript
app.get("/users/:id", (req, res) => {
  const userId = req.params.id;
  const user = getUserById(userId);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json(user);
});
```

**BootifyJS:**

```typescript
import { Controller, Get, Param } from "bootifyjs";

@Controller("/users")
export class UserController {
  @Get("/:id")
  getUserById(@Param("id") id: string) {
    const user = getUserById(id);

    if (!user) {
      const error: any = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }

    return user;
  }
}
```

#### POST with Body

**Express:**

```javascript
app.post("/users", (req, res) => {
  const { name, email } = req.body;

  // Manual validation
  if (!name || !email) {
    return res.status(400).json({ error: "Name and email required" });
  }

  const user = createUser({ name, email });
  res.status(201).json(user);
});
```

**BootifyJS:**

```typescript
import { Controller, Post, Body, Schema } from "bootifyjs";
import { z } from "zod";

const createUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
});

@Controller("/users")
export class UserController {
  @Post("/")
  @Schema({ body: createUserSchema })
  createUser(@Body() data: z.infer<typeof createUserSchema>) {
    const user = createUser(data);
    return user;
  }
}
```

### 4. Middleware

#### Global Middleware

**Express:**

```javascript
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  req.user = verifyToken(token);
  next();
};

app.use(authMiddleware);
```

**BootifyJS:**

```typescript
import { FastifyRequest, FastifyReply } from "fastify";

const authMiddleware = async (request: FastifyRequest, reply: FastifyReply) => {
  const token = request.headers.authorization;

  if (!token) {
    reply.code(401).send({ error: "Unauthorized" });
    return;
  }

  request.user = verifyToken(token);
};

const app = await createBootify()
  .useMiddleware(authMiddleware)
  .useControllers([UserController])
  .build();
```

#### Route-Specific Middleware

**Express:**

```javascript
const adminOnly = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
};

app.delete("/users/:id", adminOnly, (req, res) => {
  deleteUser(req.params.id);
  res.status(204).send();
});
```

**BootifyJS:**

```typescript
import { UseMiddleware } from "bootifyjs";

const adminOnly = async (request: FastifyRequest, reply: FastifyReply) => {
  if (request.user.role !== "admin") {
    reply.code(403).send({ error: "Forbidden" });
    return;
  }
};

@Controller("/users")
export class UserController {
  @Delete("/:id")
  @UseMiddleware(adminOnly)
  deleteUser(@Param("id") id: string) {
    deleteUser(id);
    return { success: true };
  }
}
```

### 5. Error Handling

**Express:**

```javascript
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.statusCode || 500).json({
    error: err.message || "Internal Server Error",
  });
});
```

**BootifyJS:**

```typescript
import { FastifyError } from "fastify";

const app = await createBootify()
  .useErrorHandler(async (error: FastifyError, request, reply) => {
    console.error(error.stack);
    reply.code(error.statusCode || 500).send({
      error: error.message || "Internal Server Error",
    });
  })
  .useControllers([UserController])
  .build();
```

### 6. Dependency Management

#### Express Pattern

**Express:**

```javascript
// services/userService.js
class UserService {
  constructor(database) {
    this.database = database;
  }

  getUsers() {
    return this.database.query("SELECT * FROM users");
  }
}

// controllers/userController.js
class UserController {
  constructor(userService) {
    this.userService = userService;
  }

  async getUsers(req, res) {
    const users = await this.userService.getUsers();
    res.json(users);
  }
}

// Manual wiring
const database = new Database();
const userService = new UserService(database);
const userController = new UserController(userService);

app.get("/users", (req, res) => userController.getUsers(req, res));
```

**BootifyJS:**

```typescript
// services/user.service.ts
import { Service, Autowired } from "bootifyjs";

@Service()
export class UserService {
  @Autowired()
  private database!: Database;

  getUsers() {
    return this.database.query("SELECT * FROM users");
  }
}

// controllers/user.controller.ts
import { Controller, Get } from "bootifyjs";

@Controller("/users")
export class UserController {
  constructor(private userService: UserService) {}

  @Get("/")
  async getUsers() {
    return await this.userService.getUsers();
  }
}

// Automatic wiring - just register the controller
const app = await createBootify().useControllers([UserController]).build();
```

### 7. Query Parameters

**Express:**

```javascript
app.get("/users", (req, res) => {
  const { page = 1, limit = 10, sort = "name" } = req.query;

  const users = getUsers({
    page: parseInt(page),
    limit: parseInt(limit),
    sort,
  });

  res.json(users);
});
```

**BootifyJS:**

```typescript
import { Controller, Get, Query, Schema } from "bootifyjs";
import { z } from "zod";

@Controller("/users")
export class UserController {
  @Get("/")
  @Schema({
    query: z.object({
      page: z.string().transform(Number).default("1"),
      limit: z.string().transform(Number).default("10"),
      sort: z.string().default("name"),
    }),
  })
  getUsers(@Query() query: any) {
    return getUsers({
      page: query.page,
      limit: query.limit,
      sort: query.sort,
    });
  }
}
```

### 8. Static Files

**Express:**

```javascript
app.use(express.static("public"));
```

**BootifyJS:**

```typescript
import fastifyStatic from "@fastify/static";
import path from "path";

const app = await createBootify()
  .usePlugin(async (fastify) => {
    await fastify.register(fastifyStatic, {
      root: path.join(__dirname, "public"),
    });
  })
  .useControllers([UserController])
  .build();
```

### 9. CORS

**Express:**

```javascript
const cors = require("cors");
app.use(cors());
```

**BootifyJS:**

```typescript
import fastifyCors from "@fastify/cors";

const app = await createBootify()
  .usePlugin(async (fastify) => {
    await fastify.register(fastifyCors);
  })
  .useControllers([UserController])
  .build();
```

### 10. Request/Response Access

**Express:**

```javascript
app.get("/users/:id", (req, res) => {
  const userId = req.params.id;
  const userAgent = req.headers["user-agent"];

  res.setHeader("X-Custom-Header", "value");
  res.json({ id: userId, userAgent });
});
```

**BootifyJS:**

```typescript
import { Controller, Get, Param, Req, Res } from "bootifyjs";
import { FastifyRequest, FastifyReply } from "fastify";

@Controller("/users")
export class UserController {
  @Get("/:id")
  getUser(
    @Param("id") id: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply
  ) {
    const userAgent = request.headers["user-agent"];
    reply.header("X-Custom-Header", "value");

    return { id, userAgent };
  }
}
```

## Complete Migration Example

### Before (Express)

```javascript
// app.js
const express = require("express");
const app = express();

app.use(express.json());

// Services
class UserService {
  getUsers() {
    return [
      { id: 1, name: "John", email: "john@example.com" },
      { id: 2, name: "Jane", email: "jane@example.com" },
    ];
  }

  getUserById(id) {
    const users = this.getUsers();
    return users.find((u) => u.id === parseInt(id));
  }

  createUser(data) {
    return { id: 3, ...data };
  }
}

const userService = new UserService();

// Routes
app.get("/users", (req, res) => {
  const users = userService.getUsers();
  res.json(users);
});

app.get("/users/:id", (req, res) => {
  const user = userService.getUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json(user);
});

app.post("/users", (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: "Name and email required" });
  }

  const user = userService.createUser({ name, email });
  res.status(201).json(user);
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
```

### After (BootifyJS)

```typescript
// services/user.service.ts
import { Service } from "bootifyjs";

@Service()
export class UserService {
  getUsers() {
    return [
      { id: 1, name: "John", email: "john@example.com" },
      { id: 2, name: "Jane", email: "jane@example.com" },
    ];
  }

  getUserById(id: string) {
    const users = this.getUsers();
    return users.find((u) => u.id === parseInt(id));
  }

  createUser(data: { name: string; email: string }) {
    return { id: 3, ...data };
  }
}

// controllers/user.controller.ts
import { Controller, Get, Post, Param, Body, Schema } from "bootifyjs";
import { z } from "zod";
import { UserService } from "../services/user.service";

const createUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
});

@Controller("/users")
export class UserController {
  constructor(private userService: UserService) {}

  @Get("/")
  getAllUsers() {
    return this.userService.getUsers();
  }

  @Get("/:id")
  getUserById(@Param("id") id: string) {
    const user = this.userService.getUserById(id);

    if (!user) {
      const error: any = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }

    return user;
  }

  @Post("/")
  @Schema({ body: createUserSchema })
  createUser(@Body() data: z.infer<typeof createUserSchema>) {
    return this.userService.createUser(data);
  }
}

// app.ts
import "reflect-metadata";
import { createBootify } from "bootifyjs";
import { UserController } from "./controllers/user.controller";

async function bootstrap() {
  const app = await createBootify()
    .setPort(3000)
    .useControllers([UserController])
    .build();

  await app.start();
}

bootstrap();
```

## Migration Checklist

### Phase 1: Setup

- [ ] Install BootifyJS and dependencies
- [ ] Update tsconfig.json with decorator support
- [ ] Add reflect-metadata import
- [ ] Set up project structure (controllers, services, repositories)

### Phase 2: Core Migration

- [ ] Convert route handlers to controllers
- [ ] Implement dependency injection for services
- [ ] Add validation schemas with Zod
- [ ] Migrate middleware to BootifyJS format
- [ ] Update error handling

### Phase 3: Features

- [ ] Add caching where needed
- [ ] Implement event-driven patterns
- [ ] Set up logging
- [ ] Configure environment variables

### Phase 4: Testing & Deployment

- [ ] Update tests for new structure
- [ ] Performance testing
- [ ] Deploy and monitor

## Common Pitfalls

### 1. Forgetting reflect-metadata

**Error:**

```
TypeError: Reflect.getMetadata is not a function
```

**Solution:**

```typescript
// Add at the top of your entry file
import "reflect-metadata";
```

### 2. Missing Decorator Configuration

**Error:**

```
Experimental support for decorators is a feature that is subject to change
```

**Solution:**
Update `tsconfig.json`:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

### 3. Async/Await in Middleware

Express middleware uses callbacks, BootifyJS uses async/await:

**Express:**

```javascript
app.use((req, res, next) => {
  doSomething();
  next();
});
```

**BootifyJS:**

```typescript
const middleware = async (request: FastifyRequest, reply: FastifyReply) => {
  await doSomething();
  // No next() needed
};
```

## Performance Improvements

After migration, you should see:

- **2-3x faster response times** due to Fastify
- **Lower memory usage** with better resource management
- **Better throughput** under load
- **Improved type safety** catching errors at compile time

## Next Steps

After completing the migration:

1. Review the [Best Practices Guide](./best-practices.md)
2. Explore [Advanced Topics](../advanced/custom-middleware.md)
3. Check out [Code Templates](../templates/rest-api.md)
4. Set up [Caching](../modules/cache/overview.md) and [Events](../modules/events/overview.md)

## Getting Help

If you encounter issues during migration:

- Check the [API Reference](../api-reference/decorators.md)
- Review [Core Concepts](../core-concepts/overview.md)
- Open an issue on [GitHub](https://github.com/piyushpriyadarshi/bootifyjs/issues)

## Conclusion

Migrating from Express to BootifyJS provides significant benefits in terms of performance, type safety, and code organization. The decorator-based approach reduces boilerplate while maintaining clarity and maintainability.

Start with a small module or new feature, get comfortable with the patterns, then gradually migrate your existing codebase.
