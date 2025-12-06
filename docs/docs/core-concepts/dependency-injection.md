---
id: dependency-injection
title: Dependency Injection
sidebar_label: Dependency Injection
description: Master dependency injection in BootifyJS with practical examples
keywords:
  [
    bootifyjs,
    dependency injection,
    DI container,
    autowired,
    inversion of control,
  ]
---

# Dependency Injection

Dependency Injection (DI) is a core feature of BootifyJS that promotes loose coupling, testability, and clean architecture. The framework provides a powerful DI container that automatically manages the lifecycle of your components and resolves their dependencies.

## What is Dependency Injection?

Dependency Injection is a design pattern where objects receive their dependencies from an external source rather than creating them internally. This inverts the control of dependency creation, making your code more modular and testable.

### Without DI

```typescript
class UserService {
  private repository = new UserRepository(); // Tightly coupled

  getUser(id: string) {
    return this.repository.findById(id);
  }
}
```

### With DI

```typescript
@Service()
class UserService {
  @Autowired()
  private repository!: UserRepository; // Injected by framework

  getUser(id: string) {
    return this.repository.findById(id);
  }
}
```

## Registering Components

To make a class available for injection, decorate it with one of the component decorators:

```typescript
import { Service, Repository, Component } from "bootifyjs";

@Service()
export class UserService {
  // Service logic
}

@Repository()
export class UserRepository {
  // Data access logic
}

@Component()
export class EmailHelper {
  // Utility logic
}
```

All these decorators register the class in the DI container. Controllers are automatically registered when you use `@Controller`.

## Injection Methods

BootifyJS supports two types of dependency injection:

### 1. Property Injection

Inject dependencies directly into class properties using `@Autowired()`:

```typescript
@Service()
export class TodoService {
  @Autowired()
  private readonly repository!: TodoRepository;

  @Autowired()
  private readonly eventBus!: EventBusService;

  getAllTodos() {
    return this.repository.findAll();
  }

  async createTodo(text: string) {
    const todo = this.repository.create(text);
    await this.eventBus.emit(new TodoCreatedEvent(todo));
    return todo;
  }
}
```

**Key Points:**

- Use the `!` (definite assignment assertion) since the property is injected after construction
- Mark properties as `private` or `readonly` for encapsulation
- The framework automatically resolves the dependency type using TypeScript metadata

### 2. Constructor Injection

Inject dependencies through the constructor:

```typescript
@Controller("/todos")
export class TodoController {
  constructor(private readonly todoService: TodoService) {}

  @Get("/")
  getAllTodos() {
    return this.todoService.getAllTodos();
  }
}
```

**Key Points:**

- Constructor injection is preferred for required dependencies
- TypeScript automatically creates and assigns the property when using `private` or `public` in the constructor
- The framework resolves dependencies based on parameter types

## Practical Examples

### Example 1: Three-Layer Architecture

A typical application structure with controllers, services, and repositories:

```typescript
// Repository Layer
@Repository()
export class TodoRepository {
  private todos: Map<string, Todo> = new Map();

  findAll(): Todo[] {
    return Array.from(this.todos.values());
  }

  findById(id: string): Todo | undefined {
    return this.todos.get(id);
  }

  create(text: string): Todo {
    const id = Date.now().toString();
    const todo = { id, text, completed: false };
    this.todos.set(id, todo);
    return todo;
  }
}

// Service Layer
@Service()
export class TodoService {
  @Autowired()
  private readonly repository!: TodoRepository;

  @Autowired()
  private readonly eventBus!: EventBusService;

  getAllTodos() {
    return this.repository.findAll();
  }

  getTodoById(id: string) {
    const todo = this.repository.findById(id);
    if (!todo) {
      throw new Error("Todo not found");
    }
    return todo;
  }

  async createTodo(text: string) {
    const todo = this.repository.create(text);
    await this.eventBus.emit(new TodoCreatedEvent(todo));
    return todo;
  }
}

// Controller Layer
@Controller("/todos")
export class TodoController {
  constructor(private readonly todoService: TodoService) {}

  @Get("/")
  getAllTodos() {
    return this.todoService.getAllTodos();
  }

  @Get("/:id")
  getTodoById(@Param("id") id: string) {
    return this.todoService.getTodoById(id);
  }

  @Post("/")
  createTodo(@Body() body: { text: string }) {
    return this.todoService.createTodo(body.text);
  }
}
```

### Example 2: Injecting Multiple Dependencies

Services often depend on multiple other services:

```typescript
@Service()
export class OrderService {
  @Autowired()
  private readonly orderRepository!: OrderRepository;

  @Autowired()
  private readonly paymentService!: PaymentService;

  @Autowired()
  private readonly emailService!: EmailService;

  @Autowired()
  private readonly logger!: Logger;

  async createOrder(userId: string, items: OrderItem[]) {
    this.logger.info("Creating order", { userId, itemCount: items.length });

    // Create order
    const order = await this.orderRepository.create(userId, items);

    // Process payment
    const payment = await this.paymentService.charge(order.total);

    // Send confirmation email
    await this.emailService.sendOrderConfirmation(userId, order);

    this.logger.info("Order created successfully", { orderId: order.id });
    return order;
  }
}
```

### Example 3: Interface-Based Injection

Inject dependencies by interface for better abstraction:

```typescript
// Define an interface
export interface INotificationService {
  send(userId: string, message: string): Promise<void>;
}

// Implement the interface
@Component({
  bindTo: ["INotificationService"],
})
export class EmailNotificationService implements INotificationService {
  async send(userId: string, message: string) {
    console.log(`Sending email to ${userId}: ${message}`);
    // Email sending logic
  }
}

// Inject by interface token
@Service()
export class UserService {
  @Autowired("INotificationService")
  private notificationService!: INotificationService;

  async registerUser(email: string) {
    // Registration logic
    await this.notificationService.send(email, "Welcome!");
  }
}

// Or use constructor injection with explicit token
@Service()
export class AnotherService {
  constructor(
    @Autowired("INotificationService")
    private readonly notificationService: INotificationService
  ) {}
}
```

## Dependency Scopes

BootifyJS supports two dependency scopes:

### Singleton (Default)

A single instance is created and shared across the entire application:

```typescript
@Service({ scope: Scope.SINGLETON })
export class ConfigService {
  private config: any;

  constructor() {
    this.config = this.loadConfig();
  }
}
```

**Use Cases:**

- Configuration services
- Database connections
- Caches
- Stateless services

### Transient

A new instance is created every time the dependency is requested:

```typescript
@Service({ scope: Scope.TRANSIENT })
export class RequestProcessor {
  private requestId = Math.random();

  process() {
    console.log(`Processing with ID: ${this.requestId}`);
  }
}
```

**Use Cases:**

- Stateful operations
- Request-specific processors
- Temporary workers

## Manual Resolution

Sometimes you need to manually resolve dependencies from the container:

```typescript
import { container } from "bootifyjs";

// Resolve a dependency manually
const userService = container.resolve<UserService>(UserService);

// Check if a dependency is registered
if (container.isRegistered(UserService)) {
  console.log("UserService is registered");
}
```

## Factory Providers

For complex initialization logic, use factory providers:

```typescript
import { container } from "bootifyjs";

// Register a factory provider
container.register("DatabaseConnection", {
  useFactory: () => {
    const connection = createDatabaseConnection({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || "5432"),
    });
    return connection;
  },
  scope: "singleton",
});

// Inject the factory-created dependency
@Service()
export class UserRepository {
  @Autowired("DatabaseConnection")
  private db!: DatabaseConnection;
}
```

## Best Practices

### 1. Prefer Constructor Injection for Required Dependencies

```typescript
// Good: Required dependency in constructor
@Controller("/users")
export class UserController {
  constructor(private readonly userService: UserService) {}
}

// Acceptable: Optional or many dependencies
@Service()
export class ComplexService {
  @Autowired()
  private dep1!: Service1;

  @Autowired()
  private dep2!: Service2;

  @Autowired()
  private dep3!: Service3;
}
```

### 2. Use Interfaces for Abstraction

```typescript
// Define contracts with interfaces
export interface IPaymentGateway {
  charge(amount: number): Promise<PaymentResult>;
}

// Implement multiple versions
@Component({ bindTo: ["IPaymentGateway"] })
export class StripeGateway implements IPaymentGateway {
  async charge(amount: number) {
    // Stripe implementation
  }
}

// Easy to swap implementations
@Service()
export class PaymentService {
  @Autowired("IPaymentGateway")
  private gateway!: IPaymentGateway;
}
```

### 3. Avoid Circular Dependencies

```typescript
// Bad: Circular dependency
@Service()
export class ServiceA {
  @Autowired()
  private serviceB!: ServiceB; // ServiceB depends on ServiceA
}

@Service()
export class ServiceB {
  @Autowired()
  private serviceA!: ServiceA; // Circular!
}

// Good: Extract shared logic
@Service()
export class SharedService {
  sharedLogic() {}
}

@Service()
export class ServiceA {
  @Autowired()
  private shared!: SharedService;
}

@Service()
export class ServiceB {
  @Autowired()
  private shared!: SharedService;
}
```

### 4. Keep Services Focused

Each service should have a single, well-defined responsibility:

```typescript
// Good: Focused services
@Service()
export class UserAuthenticationService {
  login(email: string, password: string) {}
  logout(userId: string) {}
}

@Service()
export class UserProfileService {
  getProfile(userId: string) {}
  updateProfile(userId: string, data: any) {}
}

// Bad: God service
@Service()
export class UserService {
  login() {}
  logout() {}
  getProfile() {}
  updateProfile() {}
  sendEmail() {}
  processPayment() {}
  // Too many responsibilities!
}
```

## Troubleshooting

### "Service with token 'X' is not registered"

Make sure the class is decorated with `@Service`, `@Repository`, `@Component`, or `@Controller`:

```typescript
// Missing decorator
class MyService {} // ❌ Not registered

// Correct
@Service()
class MyService {} // ✅ Registered
```

### "Circular dependency detected"

Refactor your code to remove circular dependencies. Consider:

- Extracting shared logic into a separate service
- Using events instead of direct dependencies
- Restructuring your architecture

### TypeScript Configuration

Ensure your `tsconfig.json` has these settings for DI to work:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "target": "ES2020",
    "module": "commonjs"
  }
}
```

## Next Steps

- Learn about [Decorators](./decorators.md) to understand all available decorators
- Explore [Request Context](./request-context.md) for request-scoped data
- Check out [Application Lifecycle](./lifecycle.md) to understand when dependencies are resolved
