---
id: core-api
title: Core API Reference
sidebar_label: Core API
description: Complete reference for BootifyJS core classes and methods
keywords: [bootifyjs, core, api, reference, di, container]
---

# Core API Reference

This page documents the core classes and methods that power BootifyJS's dependency injection, routing, and request context management.

## Dependency Injection

### Container

The global dependency injection container that manages service registration and resolution.

#### Methods

##### register()

Registers a service in the DI container.

**Signature:**

```typescript
register(token: DiToken, options: RegistrationOptions): void
```

**Parameters:**

- `token`: The token to register (typically a class constructor or Symbol)
- `options`: Registration configuration
  - `useClass`: Class constructor to instantiate
  - `useFactory`: Factory function to create the instance
  - `scope`: `'singleton'` | `'transient'` - Lifecycle scope

**Example:**

```typescript
import { container } from "bootifyjs";

// Register a class
container.register(UserService, {
  useClass: UserService,
  scope: "singleton",
});

// Register with a factory
container.register(DatabaseConnection, {
  useFactory: () => createDatabaseConnection(),
  scope: "singleton",
});

// Register with a token
const IUserService = Symbol.for("IUserService");
container.register(IUserService, {
  useClass: UserService,
  scope: "singleton",
});
```

---

##### resolve()

Resolves and returns an instance of a registered service.

**Signature:**

```typescript
resolve<T>(token: DiToken): T
```

**Parameters:**

- `token`: The token to resolve

**Returns:**

- Instance of the requested service

**Throws:**

- Error if service is not registered
- Error if circular dependency is detected

**Example:**

```typescript
import { container } from "bootifyjs";

const userService = container.resolve<UserService>(UserService);
const users = await userService.findAll();

// Resolve by token
const IUserService = Symbol.for("IUserService");
const userService = container.resolve<IUserService>(IUserService);
```

---

##### isRegistered()

Checks if a token is registered in the container.

**Signature:**

```typescript
isRegistered(token: DiToken): boolean
```

**Parameters:**

- `token`: The token to check

**Returns:**

- `true` if registered, `false` otherwise

**Example:**

```typescript
import { container } from "bootifyjs";

if (container.isRegistered(UserService)) {
  const userService = container.resolve(UserService);
}
```

---

##### getRegisteredComponents()

Returns all registered class constructors.

**Signature:**

```typescript
getRegisteredComponents(): Constructor[]
```

**Returns:**

- Array of registered class constructors

**Example:**

```typescript
import { container } from "bootifyjs";

const components = container.getRegisteredComponents();
console.log(`Registered ${components.length} components`);
```

---

### Scope

Enum defining the lifecycle scope of services.

**Values:**

- `Scope.SINGLETON`: Single instance shared across the application
- `Scope.TRANSIENT`: New instance created for each resolution

**Example:**

```typescript
import { Service, Scope } from "bootifyjs";

@Service({ scope: Scope.TRANSIENT })
export class RequestScopedService {
  // New instance for each injection
}

@Service({ scope: Scope.SINGLETON })
export class ApplicationScopedService {
  // Single instance shared across the app
}
```

---

## Request Context

### RequestContextService

Service for managing request-scoped data using AsyncLocalStorage.

#### Methods

##### get()

Retrieves a value from the current request context.

**Signature:**

```typescript
get<T = any>(key: string): T | undefined
```

**Parameters:**

- `key`: The key of the value to retrieve

**Returns:**

- The value, or `undefined` if not found

**Example:**

```typescript
import { Service, Autowired, RequestContextService } from "bootifyjs";

@Service()
export class UserService {
  @Autowired()
  private context!: RequestContextService;

  async getCurrentUser() {
    const userId = this.context.get<string>("userId");
    return await this.findById(userId);
  }
}
```

---

##### set()

Sets a value in the current request context.

**Signature:**

```typescript
set(key: string, value: any): void
```

**Parameters:**

- `key`: The key to set
- `value`: The value to store

**Example:**

```typescript
import { FastifyRequest, FastifyReply } from "fastify";
import { RequestContextService } from "bootifyjs";

export const authMiddleware = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const contextService = new RequestContextService();
  contextService.set("userId", request.headers["x-user-id"]);
  contextService.set("requestId", request.id);
};
```

---

##### store()

Returns the underlying AsyncLocalStorage store.

**Signature:**

```typescript
store(): Map<string, any> | undefined
```

**Returns:**

- The current request context store, or `undefined` if not in a request context

**Example:**

```typescript
const contextService = new RequestContextService();
const store = contextService.store();

if (store) {
  console.log("Context keys:", Array.from(store.keys()));
}
```

---

##### run() (static)

Runs a function within a new request context.

**Signature:**

```typescript
static run(callback: () => void): void
```

**Parameters:**

- `callback`: Function to execute within the new context

**Example:**

```typescript
import { RequestContextService } from "bootifyjs";

RequestContextService.run(() => {
  const contextService = new RequestContextService();
  contextService.set("requestId", "123");
  // All code here has access to this context
});
```

---

### requestContextStore

The global AsyncLocalStorage instance used for request context management.

**Type:**

```typescript
AsyncLocalStorage<Map<string, any>>;
```

**Example:**

```typescript
import { requestContextStore } from "bootifyjs";

// Get current store
const store = requestContextStore.getStore();

// Run with new context
requestContextStore.run(new Map(), () => {
  // Code here has access to the new context
});
```

---

## Routing

### registerControllers()

Registers all controllers with the Fastify instance.

**Signature:**

```typescript
registerControllers(fastify: FastifyInstance, controllers: Constructor[]): void
```

**Parameters:**

- `fastify`: Fastify application instance
- `controllers`: Array of controller class constructors

**Example:**

```typescript
import { BootifyApp, registerControllers } from "bootifyjs";
import { UserController, PostController } from "./controllers";

const app = new BootifyApp();

// Manual registration
registerControllers(app.getFastifyInstance(), [UserController, PostController]);

// Or use BootifyApp's built-in method
await app.start();
```

---

## Component Registry

### registeredComponents

A global Set that stores all classes decorated with `@Component`, `@Service`, `@Repository`, or `@Controller`.

**Type:**

```typescript
Set<Constructor>;
```

**Example:**

```typescript
import { registeredComponents } from "bootifyjs";

// Get all registered components
const components = Array.from(registeredComponents);
console.log(`Total components: ${components.length}`);

// Check if a component is registered
if (registeredComponents.has(UserService)) {
  console.log("UserService is registered");
}
```

---

## Types

### Constructor

Type representing a class constructor.

**Definition:**

```typescript
type Constructor<T = any> = new (...args: any[]) => T;
```

**Example:**

```typescript
import { Constructor } from "bootifyjs";

function registerService<T>(ServiceClass: Constructor<T>) {
  container.register(ServiceClass, {
    useClass: ServiceClass,
    scope: "singleton",
  });
}
```

---

### DiToken

Type representing a dependency injection token.

**Definition:**

```typescript
type DiToken = any;
```

**Example:**

```typescript
import { DiToken } from "bootifyjs";

const IUserService: DiToken = Symbol.for("IUserService");
const ILogger: DiToken = Symbol.for("ILogger");
```

---

### ComponentOptions

Configuration options for component registration.

**Definition:**

```typescript
interface ComponentOptions {
  bindTo?: DiToken[];
  scope?: "singleton" | "transient";
  eager?: boolean;
}
```

**Properties:**

- `bindTo`: Array of tokens to bind this component to (for interface injection)
- `scope`: Lifecycle scope of the component
- `eager`: Whether to instantiate immediately on startup

**Example:**

```typescript
import { Service, ComponentOptions } from "bootifyjs";

const IUserService = Symbol.for("IUserService");

const options: ComponentOptions = {
  bindTo: [IUserService],
  scope: "singleton",
  eager: true,
};

@Service(options)
export class UserService implements IUserService {
  // ...
}
```

---

### FastifyMiddleware

Type representing a Fastify middleware function.

**Definition:**

```typescript
type FastifyMiddleware = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<void> | void;
```

**Example:**

```typescript
import { FastifyMiddleware } from "bootifyjs";

const loggingMiddleware: FastifyMiddleware = async (request, reply) => {
  console.log(`${request.method} ${request.url}`);
};

const authMiddleware: FastifyMiddleware = async (request, reply) => {
  const token = request.headers.authorization;
  if (!token) {
    reply.code(401).send({ error: "Unauthorized" });
  }
};
```

---

### ValidationDecoratorOptions

Options for the `@Schema` decorator.

**Definition:**

```typescript
interface ValidationDecoratorOptions {
  body?: ZodSchema<any>;
  query?: ZodSchema<any>;
  params?: ZodSchema<any>;
  responses?: {
    [statusCode: number]: ZodSchema<any>;
  };
}
```

**Properties:**

- `body`: Zod schema for request body validation
- `query`: Zod schema for query parameter validation
- `params`: Zod schema for path parameter validation
- `responses`: Object mapping HTTP status codes to response schemas

**Example:**

```typescript
import { ValidationDecoratorOptions } from "bootifyjs";
import { z } from "zod";

const validationOptions: ValidationDecoratorOptions = {
  body: z.object({
    name: z.string(),
    email: z.string().email(),
  }),
  query: z.object({
    page: z.coerce.number().default(1),
  }),
  responses: {
    200: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
    }),
  },
};
```

---

### SwaggerOptions

Options for the `@Swagger` decorator.

**Definition:**

```typescript
interface SwaggerOptions {
  summary?: string;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
  operationId?: string;
  security?: Array<Record<string, string[]>>;
}
```

**Properties:**

- `summary`: Brief description of the endpoint
- `description`: Detailed description
- `tags`: Array of tags for grouping endpoints
- `deprecated`: Whether the endpoint is deprecated
- `operationId`: Unique identifier for the operation
- `security`: Security requirements for the endpoint

**Example:**

```typescript
import { SwaggerOptions } from "bootifyjs";

const swaggerOptions: SwaggerOptions = {
  summary: "Create a new user",
  description: "Creates a new user account with the provided information",
  tags: ["Users", "Authentication"],
  deprecated: false,
  operationId: "createUser",
  security: [{ bearerAuth: [] }],
};
```

---

## Metadata Keys

### METADATA_KEYS

Object containing all metadata keys used by the framework.

**Definition:**

```typescript
const METADATA_KEYS = {
  controllerPrefix: "bootify:controller-prefix",
  routes: "bootify:routes",
  validationSchema: "bootify:validation-schema",
  paramTypes: "bootify:param-types",
  middleware: "bootify:middleware",
  autowiredProperties: "bootify:autowired-properties",
  autowiredParams: "bootify:autowired-params",
  swaggerMetadata: "swagger:metadata",
};
```

**Usage:**
These keys are used internally by decorators to store metadata. You typically don't need to use them directly unless you're creating custom decorators.

**Example:**

```typescript
import "reflect-metadata";
import { METADATA_KEYS } from "bootifyjs";

// Get controller prefix
const prefix = Reflect.getMetadata(
  METADATA_KEYS.controllerPrefix,
  UserController
);

// Get routes
const routes = Reflect.getMetadata(METADATA_KEYS.routes, UserController);
```

---

## Best Practices

### Dependency Injection

1. **Use constructor injection for required dependencies:**

```typescript
@Service()
export class UserService {
  constructor(
    @Autowired() private userRepo: UserRepository,
    @Autowired() private logger: Logger
  ) {}
}
```

2. **Use property injection for optional dependencies:**

```typescript
@Service()
export class UserService {
  @Autowired()
  private cacheService?: CacheService;
}
```

3. **Use interface injection for loose coupling:**

```typescript
const IUserRepository = Symbol.for("IUserRepository");

@Repository({ bindTo: [IUserRepository] })
export class UserRepository implements IUserRepository {
  // ...
}

@Service()
export class UserService {
  constructor(@Autowired(IUserRepository) private userRepo: IUserRepository) {}
}
```

### Request Context

1. **Set context early in the request lifecycle:**

```typescript
export const contextMiddleware: FastifyMiddleware = async (request, reply) => {
  const contextService = new RequestContextService();
  contextService.set("requestId", request.id);
  contextService.set("userId", extractUserId(request));
  contextService.set("timestamp", Date.now());
};
```

2. **Access context in services:**

```typescript
@Service()
export class AuditService {
  @Autowired()
  private context!: RequestContextService;

  async logAction(action: string) {
    const userId = this.context.get<string>("userId");
    const requestId = this.context.get<string>("requestId");

    await this.auditRepo.save({
      action,
      userId,
      requestId,
      timestamp: new Date(),
    });
  }
}
```

### Scopes

1. **Use SINGLETON for stateless services:**

```typescript
@Service({ scope: Scope.SINGLETON })
export class UserService {
  // No instance state, safe to share
}
```

2. **Use TRANSIENT for stateful services:**

```typescript
@Service({ scope: Scope.TRANSIENT })
export class RequestProcessor {
  private data: any[] = [];

  // Instance state, needs new instance per use
}
```

---

## See Also

- [Decorators API Reference](./decorators.md)
- [Dependency Injection Guide](../core-concepts/dependency-injection.md)
- [Request Context Guide](../core-concepts/request-context.md)
- [Controllers Guide](../modules/core/controllers.md)
