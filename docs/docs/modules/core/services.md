---
id: core-services
title: Services
sidebar_label: Services
description: Learn how to create and use services for business logic in BootifyJS
keywords:
  [bootifyjs, services, business logic, dependency injection, service layer]
---

# Services

Services are classes that contain your application's business logic. They sit between controllers and repositories, orchestrating operations, enforcing business rules, and coordinating between different parts of your application.

## Creating a Service

Use the `@Service()` decorator to register a class as a service:

```typescript
import { Service } from "bootifyjs";

@Service()
export class UserService {
  getAllUsers() {
    return [
      { id: 1, name: "John Doe" },
      { id: 2, name: "Jane Smith" },
    ];
  }

  getUserById(id: string) {
    return { id, name: "John Doe" };
  }
}
```

The `@Service()` decorator:

- Registers the class in the DI container
- Makes it available for injection into other components
- Creates a singleton instance by default

## Injecting Services

Services can be injected into controllers and other services using dependency injection.

### Constructor Injection (Recommended)

```typescript
import { Controller, Get, Param } from "bootifyjs";

@Controller("/api/users")
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get("/")
  getAllUsers() {
    return this.userService.getAllUsers();
  }

  @Get("/:id")
  getUser(@Param("id") id: string) {
    return this.userService.getUserById(id);
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

  @Get("/")
  getAllUsers() {
    return this.userService.getAllUsers();
  }
}
```

## Service Dependencies

Services can depend on other services, repositories, and components:

```typescript
import { Service, Autowired } from "bootifyjs";

@Service()
export class UserService {
  @Autowired()
  private readonly userRepository!: UserRepository;

  @Autowired()
  private readonly emailService!: EmailService;

  @Autowired()
  private readonly logger!: Logger;

  async createUser(userData: CreateUserDto) {
    this.logger.info("Creating user", { email: userData.email });

    // Validate business rules
    const existingUser = await this.userRepository.findByEmail(userData.email);
    if (existingUser) {
      throw new Error("User with this email already exists");
    }

    // Create user
    const user = await this.userRepository.create(userData);

    // Send welcome email
    await this.emailService.sendWelcomeEmail(user.email);

    this.logger.info("User created successfully", { userId: user.id });
    return user;
  }
}
```

## Service Patterns

### 1. Three-Layer Architecture

The most common pattern: Controller → Service → Repository

```typescript
// Repository Layer - Data Access
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

  update(id: string, updates: Partial<Todo>): Todo | undefined {
    const todo = this.todos.get(id);
    if (!todo) return undefined;

    const updated = { ...todo, ...updates };
    this.todos.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.todos.delete(id);
  }
}

// Service Layer - Business Logic
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
      const error: any = new Error("Todo not found");
      error.statusCode = 404;
      throw error;
    }
    return todo;
  }

  async createTodo(text: string) {
    // Business rule: text must not be empty
    if (!text.trim()) {
      throw new Error("Todo text cannot be empty");
    }

    const todo = this.repository.create(text);

    // Emit event for other parts of the system
    await this.eventBus.emit(new TodoCreatedEvent(todo));

    return todo;
  }

  updateTodo(id: string, updates: Partial<Todo>) {
    const todo = this.repository.update(id, updates);
    if (!todo) {
      const error: any = new Error("Todo not found");
      error.statusCode = 404;
      throw error;
    }
    return todo;
  }

  deleteTodo(id: string) {
    const deleted = this.repository.delete(id);
    if (!deleted) {
      const error: any = new Error("Todo not found");
      error.statusCode = 404;
      throw error;
    }
  }
}

// Controller Layer - HTTP Interface
@Controller("/api/todos")
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

  @Put("/:id")
  updateTodo(@Param("id") id: string, @Body() body: Partial<Todo>) {
    return this.todoService.updateTodo(id, body);
  }

  @Delete("/:id")
  deleteTodo(@Param("id") id: string) {
    this.todoService.deleteTodo(id);
    return { message: "Todo deleted successfully" };
  }
}
```

### 2. Service Composition

Services can compose other services to build complex functionality:

```typescript
@Service()
export class OrderService {
  @Autowired()
  private readonly orderRepository!: OrderRepository;

  @Autowired()
  private readonly paymentService!: PaymentService;

  @Autowired()
  private readonly inventoryService!: InventoryService;

  @Autowired()
  private readonly emailService!: EmailService;

  @Autowired()
  private readonly logger!: Logger;

  async createOrder(userId: string, items: OrderItem[]) {
    this.logger.info("Creating order", { userId, itemCount: items.length });

    // Check inventory
    const available = await this.inventoryService.checkAvailability(items);
    if (!available) {
      throw new Error("Some items are out of stock");
    }

    // Calculate total
    const total = items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    // Process payment
    const payment = await this.paymentService.charge(userId, total);
    if (!payment.success) {
      throw new Error("Payment failed");
    }

    // Create order
    const order = await this.orderRepository.create({
      userId,
      items,
      total,
      paymentId: payment.id,
      status: "confirmed",
    });

    // Update inventory
    await this.inventoryService.decrementStock(items);

    // Send confirmation email
    await this.emailService.sendOrderConfirmation(userId, order);

    this.logger.info("Order created successfully", { orderId: order.id });
    return order;
  }
}
```

### 3. Domain Services

Services that encapsulate domain-specific business logic:

```typescript
@Service()
export class PricingService {
  calculateDiscount(user: User, product: Product): number {
    let discount = 0;

    // Premium members get 10% off
    if (user.isPremium) {
      discount += 0.1;
    }

    // First-time buyers get 5% off
    if (user.orderCount === 0) {
      discount += 0.05;
    }

    // Products on sale
    if (product.onSale) {
      discount += product.saleDiscount;
    }

    // Cap discount at 50%
    return Math.min(discount, 0.5);
  }

  calculateFinalPrice(user: User, product: Product): number {
    const discount = this.calculateDiscount(user, product);
    return product.price * (1 - discount);
  }
}

@Service()
export class CartService {
  @Autowired()
  private readonly pricingService!: PricingService;

  @Autowired()
  private readonly cartRepository!: CartRepository;

  async getCartTotal(userId: string): Promise<number> {
    const cart = await this.cartRepository.findByUserId(userId);
    const user = await this.userRepository.findById(userId);

    let total = 0;
    for (const item of cart.items) {
      const finalPrice = this.pricingService.calculateFinalPrice(
        user,
        item.product
      );
      total += finalPrice * item.quantity;
    }

    return total;
  }
}
```

## Service Scopes

Services can have different lifecycles:

### Singleton (Default)

One instance shared across the entire application:

```typescript
@Service({ scope: Scope.SINGLETON })
export class ConfigService {
  private config: AppConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  get(key: string): any {
    return this.config[key];
  }
}
```

**Use Cases:**

- Configuration services
- Database connections
- Caches
- Stateless services

### Transient

A new instance created every time it's injected:

```typescript
@Service({ scope: Scope.TRANSIENT })
export class RequestProcessor {
  private requestId = Math.random();

  process(data: any) {
    console.log(`Processing with ID: ${this.requestId}`);
    return data;
  }
}
```

**Use Cases:**

- Stateful operations
- Request-specific processors
- Temporary workers

## Interface-Based Services

Use interfaces for better abstraction and testability:

```typescript
// Define the interface
export interface INotificationService {
  send(userId: string, message: string): Promise<void>;
}

// Implement the interface
@Service({
  bindTo: ["INotificationService"],
})
export class EmailNotificationService implements INotificationService {
  async send(userId: string, message: string) {
    console.log(`Sending email to ${userId}: ${message}`);
    // Email sending logic
  }
}

// Alternative implementation
@Service({
  bindTo: ["INotificationService"],
})
export class SmsNotificationService implements INotificationService {
  async send(userId: string, message: string) {
    console.log(`Sending SMS to ${userId}: ${message}`);
    // SMS sending logic
  }
}

// Inject by interface
@Service()
export class UserService {
  @Autowired("INotificationService")
  private notificationService!: INotificationService;

  async registerUser(email: string) {
    // Registration logic
    await this.notificationService.send(email, "Welcome!");
  }
}
```

## Async Operations

Services commonly perform asynchronous operations:

```typescript
@Service()
export class UserService {
  @Autowired()
  private readonly userRepository!: UserRepository;

  @Autowired()
  private readonly emailService!: EmailService;

  async createUser(userData: CreateUserDto): Promise<User> {
    // Async database operation
    const user = await this.userRepository.create(userData);

    // Async email operation
    await this.emailService.sendWelcomeEmail(user.email);

    return user;
  }

  async getUserWithPosts(userId: string): Promise<UserWithPosts> {
    // Parallel async operations
    const [user, posts] = await Promise.all([
      this.userRepository.findById(userId),
      this.postRepository.findByUserId(userId),
    ]);

    if (!user) {
      throw new Error("User not found");
    }

    return { ...user, posts };
  }
}
```

## Error Handling

Services should throw meaningful errors:

```typescript
@Service()
export class ProductService {
  @Autowired()
  private readonly productRepository!: ProductRepository;

  getProductById(id: string): Product {
    const product = this.productRepository.findById(id);

    if (!product) {
      const error: any = new Error("Product not found");
      error.statusCode = 404;
      throw error;
    }

    return product;
  }

  updateProduct(id: string, updates: Partial<Product>): Product {
    const product = this.productRepository.findById(id);

    if (!product) {
      const error: any = new Error("Product not found");
      error.statusCode = 404;
      throw error;
    }

    // Business rule validation
    if (updates.price && updates.price < 0) {
      const error: any = new Error("Price cannot be negative");
      error.statusCode = 400;
      throw error;
    }

    return this.productRepository.update(id, updates);
  }
}
```

## Testing Services

Services are easy to test because of dependency injection:

```typescript
// Mock dependencies
const mockRepository = {
  findAll: jest
    .fn()
    .mockReturnValue([{ id: "1", text: "Test todo", completed: false }]),
  create: jest.fn().mockReturnValue({
    id: "2",
    text: "New todo",
    completed: false,
  }),
};

const mockEventBus = {
  emit: jest.fn().mockResolvedValue(undefined),
};

// Create service with mocked dependencies
const service = new TodoService();
(service as any).repository = mockRepository;
(service as any).eventBus = mockEventBus;

// Test the service
describe("TodoService", () => {
  it("should get all todos", () => {
    const todos = service.getAllTodos();
    expect(todos).toHaveLength(1);
    expect(mockRepository.findAll).toHaveBeenCalled();
  });

  it("should create a todo", async () => {
    const todo = await service.createTodo("New todo");
    expect(todo.text).toBe("New todo");
    expect(mockRepository.create).toHaveBeenCalledWith("New todo");
    expect(mockEventBus.emit).toHaveBeenCalled();
  });
});
```

## Best Practices

### 1. Single Responsibility

Each service should have one clear purpose:

```typescript
// Good: Focused services
@Service()
export class UserAuthenticationService {
  login(email: string, password: string) {}
  logout(userId: string) {}
  refreshToken(token: string) {}
}

@Service()
export class UserProfileService {
  getProfile(userId: string) {}
  updateProfile(userId: string, data: any) {}
  uploadAvatar(userId: string, file: Buffer) {}
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
  generateReport() {}
  // Too many responsibilities!
}
```

### 2. Dependency Injection Over Direct Instantiation

```typescript
// Good: Use DI
@Service()
export class OrderService {
  @Autowired()
  private readonly paymentService!: PaymentService;
}

// Bad: Direct instantiation
@Service()
export class OrderService {
  private paymentService = new PaymentService(); // Tightly coupled
}
```

### 3. Return Domain Objects, Not DTOs

```typescript
// Good: Return domain objects
@Service()
export class UserService {
  getUserById(id: string): User {
    return this.repository.findById(id);
  }
}

// Bad: Return DTOs from service
@Service()
export class UserService {
  getUserById(id: string): UserResponseDto {
    const user = this.repository.findById(id);
    return { id: user.id, name: user.name }; // DTO transformation
  }
}
```

DTO transformation should happen in controllers, not services.

### 4. Use Interfaces for Abstraction

```typescript
// Good: Program to interfaces
@Service()
export class NotificationService {
  @Autowired("IEmailProvider")
  private emailProvider!: IEmailProvider;
}

// Bad: Depend on concrete implementations
@Service()
export class NotificationService {
  @Autowired()
  private sendgridService!: SendgridService; // Tightly coupled
}
```

### 5. Keep Services Stateless

```typescript
// Good: Stateless service
@Service()
export class CalculationService {
  calculate(a: number, b: number): number {
    return a + b;
  }
}

// Bad: Stateful service
@Service()
export class CalculationService {
  private lastResult: number = 0; // State!

  calculate(a: number, b: number): number {
    this.lastResult = a + b;
    return this.lastResult;
  }
}
```

## Next Steps

- Learn about [Controllers](./controllers.md) to expose services via HTTP
- Explore [Routing](./routing.md) for advanced routing patterns
- Read about [Validation](./validation.md) to validate data
- Check out [Dependency Injection](../../core-concepts/dependency-injection.md) for DI details
