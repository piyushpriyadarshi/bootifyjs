---
id: best-practices
title: Best Practices
sidebar_label: Best Practices
description: Best practices and patterns for building BootifyJS applications
keywords: [bootifyjs, best practices, patterns, nodejs, typescript]
---

# BootifyJS Best Practices

This guide covers recommended patterns, conventions, and best practices for building maintainable, scalable BootifyJS applications.

## Project Structure

### Recommended Organization

```
src/
├── config/
│   ├── app.config.ts          # Application configuration
│   └── database.config.ts     # Database configuration
├── controllers/
│   ├── user.controller.ts
│   ├── product.controller.ts
│   └── order.controller.ts
├── services/
│   ├── user.service.ts
│   ├── product.service.ts
│   └── email.service.ts
├── repositories/
│   ├── user.repository.ts
│   └── product.repository.ts
├── events/
│   ├── user-created.event.ts
│   └── order-placed.event.ts
├── handlers/
│   ├── user-created.handler.ts
│   └── order-placed.handler.ts
├── middleware/
│   ├── auth.middleware.ts
│   └── logging.middleware.ts
├── schemas/
│   ├── user.schema.ts
│   └── product.schema.ts
├── types/
│   ├── user.types.ts
│   └── common.types.ts
├── utils/
│   ├── validation.utils.ts
│   └── date.utils.ts
└── main.ts                    # Application entry point
```

### Key Principles

1. **Separation of Concerns**: Keep controllers, services, and repositories separate
2. **Single Responsibility**: Each class should have one clear purpose
3. **Dependency Direction**: Controllers → Services → Repositories
4. **Shared Schemas**: Keep validation schemas in a dedicated folder
5. **Type Safety**: Use TypeScript types and interfaces extensively

## Controller Best Practices

### Keep Controllers Thin

Controllers should only handle HTTP concerns and delegate business logic to services.

**❌ Bad:**

```typescript
@Controller("/users")
export class UserController {
  @Post("/")
  async createUser(@Body() data: any) {
    // Business logic in controller - BAD!
    const existingUser = await db.query("SELECT * FROM users WHERE email = ?", [
      data.email,
    ]);
    if (existingUser) {
      throw new Error("User already exists");
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await db.query("INSERT INTO users...", [
      data.email,
      hashedPassword,
    ]);

    await sendWelcomeEmail(user.email);

    return user;
  }
}
```

**✅ Good:**

```typescript
@Controller("/users")
export class UserController {
  constructor(private userService: UserService) {}

  @Post("/")
  @Schema({ body: createUserSchema })
  async createUser(@Body() data: CreateUserDto) {
    return await this.userService.createUser(data);
  }
}
```

### Use Proper HTTP Status Codes

```typescript
@Controller("/users")
export class UserController {
  constructor(private userService: UserService) {}

  @Post("/")
  async createUser(@Body() data: CreateUserDto, @Res() reply: FastifyReply) {
    const user = await this.userService.createUser(data);
    return reply.code(201).send(user); // 201 for created
  }

  @Delete("/:id")
  async deleteUser(@Param("id") id: string, @Res() reply: FastifyReply) {
    await this.userService.deleteUser(id);
    return reply.code(204).send(); // 204 for no content
  }

  @Get("/:id")
  async getUser(@Param("id") id: string) {
    const user = await this.userService.getUser(id);

    if (!user) {
      const error: any = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }

    return user; // 200 by default
  }
}
```

### Validate All Inputs

Always use `@Schema` decorator for validation:

```typescript
import { z } from "zod";

const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  age: z.number().int().min(18).max(120),
  role: z.enum(["user", "admin"]).default("user"),
});

const updateUserSchema = z
  .object({
    name: z.string().min(2).max(100).optional(),
    email: z.string().email().optional(),
    age: z.number().int().min(18).max(120).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

@Controller("/users")
export class UserController {
  @Post("/")
  @Schema({ body: createUserSchema })
  createUser(@Body() data: z.infer<typeof createUserSchema>) {
    return this.userService.createUser(data);
  }

  @Patch("/:id")
  @Schema({
    params: z.object({ id: z.string().uuid() }),
    body: updateUserSchema,
  })
  updateUser(
    @Param("id") id: string,
    @Body() data: z.infer<typeof updateUserSchema>
  ) {
    return this.userService.updateUser(id, data);
  }
}
```

## Service Best Practices

### Single Responsibility

Each service should handle one domain area:

**❌ Bad:**

```typescript
@Service()
export class AppService {
  createUser() {
    /* ... */
  }
  createProduct() {
    /* ... */
  }
  sendEmail() {
    /* ... */
  }
  processPayment() {
    /* ... */
  }
}
```

**✅ Good:**

```typescript
@Service()
export class UserService {
  createUser() {
    /* ... */
  }
  updateUser() {
    /* ... */
  }
  deleteUser() {
    /* ... */
  }
}

@Service()
export class ProductService {
  createProduct() {
    /* ... */
  }
  updateProduct() {
    /* ... */
  }
}

@Service()
export class EmailService {
  sendWelcomeEmail() {
    /* ... */
  }
  sendPasswordReset() {
    /* ... */
  }
}
```

### Use Dependency Injection

**❌ Bad:**

```typescript
@Service()
export class UserService {
  async createUser(data: CreateUserDto) {
    // Creating dependencies manually - BAD!
    const repository = new UserRepository();
    const emailService = new EmailService();

    const user = await repository.save(data);
    await emailService.sendWelcome(user.email);

    return user;
  }
}
```

**✅ Good:**

```typescript
@Service()
export class UserService {
  @Autowired()
  private userRepository!: UserRepository;

  @Autowired()
  private emailService!: EmailService;

  @Autowired()
  private eventBus!: EventBusService;

  async createUser(data: CreateUserDto) {
    const user = await this.userRepository.save(data);
    await this.eventBus.emit(new UserCreatedEvent(user));
    return user;
  }
}
```

### Handle Errors Properly

```typescript
@Service()
export class UserService {
  @Autowired()
  private userRepository!: UserRepository;

  async getUser(id: string) {
    const user = await this.userRepository.findById(id);

    if (!user) {
      const error: any = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }

    return user;
  }

  async createUser(data: CreateUserDto) {
    try {
      // Check if user exists
      const existing = await this.userRepository.findByEmail(data.email);

      if (existing) {
        const error: any = new Error("User with this email already exists");
        error.statusCode = 409; // Conflict
        throw error;
      }

      return await this.userRepository.save(data);
    } catch (error) {
      // Log error
      console.error("Error creating user:", error);

      // Re-throw if it's a known error
      if ((error as any).statusCode) {
        throw error;
      }

      // Wrap unknown errors
      const wrappedError: any = new Error("Failed to create user");
      wrappedError.statusCode = 500;
      throw wrappedError;
    }
  }
}
```

## Repository Best Practices

### Abstract Data Access

Repositories should be the only layer that knows about data storage:

```typescript
@Repository()
export class UserRepository {
  private users: User[] = []; // In-memory for example

  async findAll(): Promise<User[]> {
    return this.users;
  }

  async findById(id: string): Promise<User | null> {
    return this.users.find((u) => u.id === id) || null;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.users.find((u) => u.email === email) || null;
  }

  async save(user: Partial<User>): Promise<User> {
    const newUser = {
      id: generateId(),
      ...user,
      createdAt: new Date(),
    } as User;

    this.users.push(newUser);
    return newUser;
  }

  async update(id: string, data: Partial<User>): Promise<User | null> {
    const index = this.users.findIndex((u) => u.id === id);

    if (index === -1) {
      return null;
    }

    this.users[index] = { ...this.users[index], ...data };
    return this.users[index];
  }

  async delete(id: string): Promise<boolean> {
    const index = this.users.findIndex((u) => u.id === id);

    if (index === -1) {
      return false;
    }

    this.users.splice(index, 1);
    return true;
  }
}
```

### Use Interfaces for Flexibility

```typescript
// Define interface
export interface IUserRepository {
  findAll(): Promise<User[]>;
  findById(id: string): Promise<User | null>;
  save(user: Partial<User>): Promise<User>;
}

// Implement with different storage backends
@Repository({ bindTo: ["IUserRepository"] })
export class InMemoryUserRepository implements IUserRepository {
  private users: User[] = [];

  async findAll() {
    return this.users;
  }
  async findById(id: string) {
    /* ... */
  }
  async save(user: Partial<User>) {
    /* ... */
  }
}

@Repository({ bindTo: ["IUserRepository"] })
export class PostgresUserRepository implements IUserRepository {
  @Autowired()
  private db!: Database;

  async findAll() {
    return this.db.query("SELECT * FROM users");
  }
  async findById(id: string) {
    /* ... */
  }
  async save(user: Partial<User>) {
    /* ... */
  }
}

// Service uses interface
@Service()
export class UserService {
  @Autowired("IUserRepository")
  private userRepository!: IUserRepository;
}
```

## Validation Best Practices

### Reusable Schemas

Create reusable schema components:

```typescript
// schemas/common.schema.ts
export const emailSchema = z.string().email("Invalid email address");
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain uppercase letter")
  .regex(/[a-z]/, "Password must contain lowercase letter")
  .regex(/[0-9]/, "Password must contain number");

export const idSchema = z.string().uuid("Invalid ID format");

// schemas/user.schema.ts
export const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: emailSchema,
  password: passwordSchema,
  age: z.number().int().min(18),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string(), // Don't validate on login
});
```

### Custom Validation

```typescript
const createOrderSchema = z
  .object({
    items: z
      .array(
        z.object({
          productId: z.string().uuid(),
          quantity: z.number().int().min(1),
        })
      )
      .min(1, "Order must have at least one item"),

    shippingAddress: z.object({
      street: z.string(),
      city: z.string(),
      zipCode: z.string().regex(/^\d{5}$/, "Invalid ZIP code"),
    }),

    paymentMethod: z.enum(["credit_card", "paypal", "bank_transfer"]),
  })
  .refine(
    (data) => {
      // Custom validation: total quantity limit
      const totalQuantity = data.items.reduce(
        (sum, item) => sum + item.quantity,
        0
      );
      return totalQuantity <= 100;
    },
    { message: "Total quantity cannot exceed 100 items" }
  );
```

## Event-Driven Best Practices

### Use Typed Events

```typescript
// events/user-created.event.ts
export class UserCreatedEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly createdAt: Date
  ) {}
}

// handlers/user-created.handler.ts
@EventHandler(UserCreatedEvent)
export class UserCreatedHandler {
  @Autowired()
  private emailService!: EmailService;

  async handle(event: UserCreatedEvent) {
    await this.emailService.sendWelcomeEmail(event.email);
  }
}

// service
@Service()
export class UserService {
  @Autowired()
  private eventBus!: EventBusService;

  async createUser(data: CreateUserDto) {
    const user = await this.userRepository.save(data);

    await this.eventBus.emit(
      new UserCreatedEvent(user.id, user.email, user.createdAt)
    );

    return user;
  }
}
```

### Event Handler Error Handling

```typescript
@EventHandler(OrderPlacedEvent)
export class OrderPlacedHandler {
  @Autowired()
  private inventoryService!: InventoryService;

  @Autowired()
  private logger!: Logger;

  async handle(event: OrderPlacedEvent) {
    try {
      await this.inventoryService.reserveItems(event.items);
    } catch (error) {
      // Log error but don't crash
      this.logger.error("Failed to reserve inventory", {
        orderId: event.orderId,
        error: error.message,
      });

      // Optionally emit a failure event
      await this.eventBus.emit(
        new InventoryReservationFailedEvent(event.orderId)
      );
    }
  }
}
```

## Caching Best Practices

### Strategic Caching

Cache expensive operations:

```typescript
@Service()
export class ProductService {
  @Autowired()
  private productRepository!: ProductRepository;

  // Cache frequently accessed data
  @Cacheable({ key: "product", ttl: 300 }) // 5 minutes
  async getProduct(id: string) {
    return await this.productRepository.findById(id);
  }

  // Cache expensive computations
  @Cacheable({ key: "product-stats", ttl: 3600 }) // 1 hour
  async getProductStatistics() {
    return await this.productRepository.calculateStatistics();
  }

  // Invalidate cache on updates
  @CacheEvict({ key: "product" })
  async updateProduct(id: string, data: UpdateProductDto) {
    return await this.productRepository.update(id, data);
  }
}
```

### Cache Key Strategies

```typescript
@Service()
export class UserService {
  // Simple key
  @Cacheable({ key: "user", ttl: 60 })
  async getUser(id: string) {
    return await this.userRepository.findById(id);
  }

  // Composite key with multiple parameters
  @Cacheable({ key: "user-orders", ttl: 300 })
  async getUserOrders(userId: string, status: string) {
    // Cache key will be: user-orders:userId:status
    return await this.orderRepository.findByUserAndStatus(userId, status);
  }
}
```

## Configuration Best Practices

### Environment-Specific Config

```typescript
// config/app.config.ts
import { z } from "zod";

export const appConfigSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.string().transform(Number).default("3000"),

  // Database
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_SIZE: z.string().transform(Number).default("10"),

  // Redis
  REDIS_URL: z.string().url().optional(),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRY: z.string().default("7d"),

  // External APIs
  STRIPE_API_KEY: z.string().optional(),
  SENDGRID_API_KEY: z.string().optional(),

  // Feature flags
  ENABLE_CACHING: z
    .string()
    .transform((v) => v === "true")
    .default("true"),
  ENABLE_EVENTS: z
    .string()
    .transform((v) => v === "true")
    .default("true"),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

// main.ts
const app = await createBootify()
  .useConfig(appConfigSchema)
  .useControllers([UserController])
  .build();

// Usage in services
@Service()
export class DatabaseService {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: AppConfig.get("DATABASE_URL"),
      max: AppConfig.get("DATABASE_POOL_SIZE"),
    });
  }
}
```

### Secrets Management

```typescript
// .env (never commit this!)
DATABASE_URL=postgresql://user:pass@localhost:5432/db
JWT_SECRET=your-super-secret-key-min-32-chars
STRIPE_API_KEY=sk_test_...

// .env.example (commit this)
DATABASE_URL=postgresql://user:pass@localhost:5432/db
JWT_SECRET=change-me-in-production
STRIPE_API_KEY=sk_test_your_key_here
```

## Error Handling Best Practices

### Global Error Handler

```typescript
import { FastifyError, FastifyRequest, FastifyReply } from "fastify";

const errorHandler = async (
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) => {
  // Log error
  console.error({
    error: error.message,
    stack: error.stack,
    url: request.url,
    method: request.method,
  });

  // Handle known errors
  if (error.statusCode) {
    return reply.code(error.statusCode).send({
      error: error.message,
      statusCode: error.statusCode,
    });
  }

  // Handle validation errors
  if (error.validation) {
    return reply.code(400).send({
      error: "Validation failed",
      details: error.validation,
    });
  }

  // Handle unknown errors
  return reply.code(500).send({
    error: "Internal server error",
    statusCode: 500,
  });
};

const app = await createBootify()
  .useErrorHandler(errorHandler)
  .useControllers([UserController])
  .build();
```

### Custom Error Classes

```typescript
// errors/app-error.ts
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} with id ${id} not found`, 404, "NOT_FOUND");
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, "VALIDATION_ERROR");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
  }
}

// Usage
@Service()
export class UserService {
  async getUser(id: string) {
    const user = await this.userRepository.findById(id);

    if (!user) {
      throw new NotFoundError("User", id);
    }

    return user;
  }
}
```

## Testing Best Practices

### Unit Testing Services

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { UserService } from "./user.service";
import { UserRepository } from "./user.repository";

describe("UserService", () => {
  let userService: UserService;
  let userRepository: UserRepository;

  beforeEach(() => {
    userRepository = new UserRepository();
    userService = new UserService();
    (userService as any).userRepository = userRepository;
  });

  it("should create a user", async () => {
    const userData = {
      name: "John Doe",
      email: "john@example.com",
    };

    const user = await userService.createUser(userData);

    expect(user).toBeDefined();
    expect(user.name).toBe(userData.name);
    expect(user.email).toBe(userData.email);
  });

  it("should throw error when user not found", async () => {
    await expect(userService.getUser("non-existent-id")).rejects.toThrow(
      "User not found"
    );
  });
});
```

## Security Best Practices

### Input Sanitization

```typescript
import { z } from "zod";

// Sanitize HTML input
const sanitizeHtml = (html: string) => {
  // Use a library like DOMPurify or sanitize-html
  return sanitize(html);
};

const createPostSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().transform(sanitizeHtml),
  tags: z.array(z.string()).max(10),
});
```

### Rate Limiting

```typescript
import rateLimit from "@fastify/rate-limit";

const app = await createBootify()
  .usePlugin(async (fastify) => {
    await fastify.register(rateLimit, {
      max: 100,
      timeWindow: "15 minutes",
    });
  })
  .useControllers([UserController])
  .build();
```

### Authentication

```typescript
import jwt from "jsonwebtoken";

const authMiddleware = async (request: FastifyRequest, reply: FastifyReply) => {
  const token = request.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    return reply.code(401).send({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, AppConfig.get("JWT_SECRET"));
    request.user = decoded;
  } catch (error) {
    return reply.code(401).send({ error: "Invalid token" });
  }
};
```

## Performance Best Practices

### Use Async/Await Properly

**❌ Bad:**

```typescript
async getUsers() {
  const users = await this.userRepository.findAll();
  const enrichedUsers = [];

  for (const user of users) {
    const orders = await this.orderRepository.findByUser(user.id);
    enrichedUsers.push({ ...user, orders });
  }

  return enrichedUsers;
}
```

**✅ Good:**

```typescript
async getUsers() {
  const users = await this.userRepository.findAll();

  const enrichedUsers = await Promise.all(
    users.map(async (user) => {
      const orders = await this.orderRepository.findByUser(user.id);
      return { ...user, orders };
    })
  );

  return enrichedUsers;
}
```

### Database Query Optimization

```typescript
@Repository()
export class UserRepository {
  // Bad: N+1 query problem
  async getUsersWithOrders() {
    const users = await db.query("SELECT * FROM users");

    for (const user of users) {
      user.orders = await db.query("SELECT * FROM orders WHERE user_id = ?", [
        user.id,
      ]);
    }

    return users;
  }

  // Good: Single query with JOIN
  async getUsersWithOrders() {
    return await db.query(`
      SELECT u.*, o.*
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
    `);
  }
}
```

## Conclusion

Following these best practices will help you build maintainable, scalable, and performant BootifyJS applications. Remember:

- Keep your code organized and follow separation of concerns
- Use TypeScript's type system to catch errors early
- Validate all inputs with Zod schemas
- Handle errors gracefully
- Use dependency injection for flexibility
- Cache strategically
- Write tests for critical functionality
- Prioritize security

For more specific patterns, check out our [Code Templates](../templates/rest-api.md) section.
