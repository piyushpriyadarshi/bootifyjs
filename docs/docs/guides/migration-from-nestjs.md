---
id: migration-from-nestjs
title: Migrating from NestJS
sidebar_label: From NestJS
description: Step-by-step guide to migrate your NestJS application to BootifyJS
keywords: [bootifyjs, nestjs, migration, nodejs, typescript]
---

# Migrating from NestJS to BootifyJS

This guide will help you migrate your NestJS application to BootifyJS, highlighting the differences and providing practical migration examples.

## Why Migrate?

### Benefits of BootifyJS over NestJS

- **Simpler Architecture**: No complex module system, flat structure
- **Less Boilerplate**: Minimal configuration required
- **Faster Development**: Quicker iteration without heavy abstractions
- **Lighter Bundle**: Smaller application size
- **Easier Learning Curve**: Less concepts to master
- **Zod Validation**: Modern, type-safe validation instead of class-validator
- **Similar Performance**: Both built on Fastify (when using Fastify adapter)

### When to Consider Migration

- Your NestJS app feels over-engineered for its complexity
- You want to reduce boilerplate and configuration
- You prefer Zod over class-validator
- You don't need GraphQL, microservices, or WebSocket features
- You want a simpler mental model

## Key Differences

| Aspect            | NestJS                   | BootifyJS                |
| ----------------- | ------------------------ | ------------------------ |
| **Module System** | Required, hierarchical   | Optional, flat           |
| **Validation**    | class-validator + DTOs   | Zod schemas (inline)     |
| **DI Tokens**     | String tokens, @Inject() | Type-based, @Autowired() |
| **Configuration** | @Module decorators       | Builder pattern          |
| **Boilerplate**   | Heavy                    | Minimal                  |
| **Complexity**    | High                     | Low-Medium               |

## Step-by-Step Migration

### 1. Installation

```bash
npm install bootifyjs fastify zod reflect-metadata
```

Your `tsconfig.json` should already have decorator support from NestJS:

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

### 2. Application Bootstrap

#### NestJS

```typescript
// main.ts
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();

// app.module.ts
@Module({
  imports: [UserModule, ProductModule, ConfigModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
```

#### BootifyJS

```typescript
// main.ts
import "reflect-metadata";
import { createBootify } from "bootifyjs";
import { UserController, ProductController } from "./controllers";

async function bootstrap() {
  const app = await createBootify()
    .setPort(3000)
    .useControllers([UserController, ProductController])
    .build();

  await app.start();
}

bootstrap();
```

**Key Changes:**

- No module system required
- Flat controller registration
- Builder pattern instead of decorators
- Much less configuration

### 3. Controllers

#### NestJS

```typescript
import { Controller, Get, Post, Body, Param } from "@nestjs/common";
import { CreateUserDto } from "./dto/create-user.dto";
import { UserService } from "./user.service";

@Controller("users")
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  findAll() {
    return this.userService.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.userService.findOne(id);
  }

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }
}
```

#### BootifyJS

```typescript
import { Controller, Get, Post, Body, Param, Schema } from "bootifyjs";
import { z } from "zod";
import { UserService } from "./user.service";

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().int().min(18),
});

@Controller("/users")
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get("/")
  findAll() {
    return this.userService.findAll();
  }

  @Get("/:id")
  findOne(@Param("id") id: string) {
    return this.userService.findOne(id);
  }

  @Post("/")
  @Schema({ body: createUserSchema })
  create(@Body() data: z.infer<typeof createUserSchema>) {
    return this.userService.create(data);
  }
}
```

**Key Changes:**

- Routes need leading `/` in BootifyJS
- No separate DTO classes needed
- Inline Zod schemas instead of class-validator
- Type inference with `z.infer<>`

### 4. Services

#### NestJS

```typescript
import { Injectable } from "@nestjs/common";
import { UserRepository } from "./user.repository";
import { EventEmitter2 } from "@nestjs/event-emitter";

@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async create(data: CreateUserDto) {
    const user = await this.userRepository.save(data);
    this.eventEmitter.emit("user.created", user);
    return user;
  }

  findAll() {
    return this.userRepository.findAll();
  }
}
```

#### BootifyJS

```typescript
import { Service, Autowired } from "bootifyjs";
import { UserRepository } from "./user.repository";
import { EventBusService } from "bootifyjs";
import { UserCreatedEvent } from "./events";

@Service()
export class UserService {
  @Autowired()
  private readonly userRepository!: UserRepository;

  @Autowired()
  private readonly eventBus!: EventBusService;

  async create(data: CreateUserDto) {
    const user = await this.userRepository.save(data);
    await this.eventBus.emit(new UserCreatedEvent(user));
    return user;
  }

  findAll() {
    return this.userRepository.findAll();
  }
}
```

**Key Changes:**

- `@Injectable()` → `@Service()`
- Constructor injection still works
- Field injection with `@Autowired()` is also available
- Event emitter → Event bus with typed events

### 5. Validation (DTOs vs Zod)

#### NestJS (class-validator)

```typescript
// dto/create-user.dto.ts
import { IsString, IsEmail, IsInt, Min, IsOptional } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsInt()
  @Min(18)
  age: number;

  @IsOptional()
  @IsString()
  bio?: string;
}

// controller
@Post()
@UsePipes(new ValidationPipe())
create(@Body() createUserDto: CreateUserDto) {
  return this.userService.create(createUserDto);
}
```

#### BootifyJS (Zod)

```typescript
// schemas/user.schema.ts
import { z } from 'zod';

export const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  age: z.number().int().min(18, 'Must be 18 or older'),
  bio: z.string().optional()
});

export type CreateUserDto = z.infer<typeof createUserSchema>;

// controller
@Post('/')
@Schema({ body: createUserSchema })
create(@Body() data: CreateUserDto) {
  return this.userService.create(data);
}
```

**Key Changes:**

- No separate class files needed
- Inline schema definitions
- Type inference from schemas
- More concise syntax
- Better TypeScript integration

### 6. Dependency Injection

#### NestJS (Token-based)

```typescript
// Interface
export interface IUserRepository {
  findAll(): Promise<User[]>;
  save(user: User): Promise<User>;
}

// Provider
@Injectable()
export class UserRepository implements IUserRepository {
  findAll() {
    /* ... */
  }
  save(user: User) {
    /* ... */
  }
}

// Module
@Module({
  providers: [
    {
      provide: "IUserRepository",
      useClass: UserRepository,
    },
  ],
})
export class UserModule {}

// Service
@Injectable()
export class UserService {
  constructor(
    @Inject("IUserRepository")
    private readonly userRepository: IUserRepository
  ) {}
}
```

#### BootifyJS (Type-based)

```typescript
// Interface
export interface IUserRepository {
  findAll(): Promise<User[]>;
  save(user: User): Promise<User>;
}

// Repository
@Repository({
  bindTo: ["IUserRepository"],
})
export class UserRepository implements IUserRepository {
  findAll() {
    /* ... */
  }
  save(user: User) {
    /* ... */
  }
}

// Service
@Service()
export class UserService {
  @Autowired("IUserRepository")
  private readonly userRepository!: IUserRepository;

  // Or constructor injection
  constructor(
    @Autowired("IUserRepository")
    private readonly repo: IUserRepository
  ) {}
}
```

**Key Changes:**

- No module configuration needed
- `bindTo` option for interface binding
- `@Autowired()` instead of `@Inject()`
- Simpler setup

### 7. Middleware

#### NestJS

```typescript
// middleware/logger.middleware.ts
import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    console.log(`${req.method} ${req.url}`);
    next();
  }
}

// app.module.ts
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes("*");
  }
}
```

#### BootifyJS

```typescript
// middleware/logger.middleware.ts
import { FastifyRequest, FastifyReply } from "fastify";

export const loggerMiddleware = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  console.log(`${request.method} ${request.url}`);
};

// main.ts
const app = await createBootify()
  .useMiddleware(loggerMiddleware)
  .useControllers([UserController])
  .build();
```

**Key Changes:**

- No class-based middleware required
- Async functions instead of callbacks
- No `next()` function
- Simpler registration

### 8. Guards (Authorization)

#### NestJS

```typescript
// guards/auth.guard.ts
import { Injectable, CanActivate, ExecutionContext } from "@nestjs/common";

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    return validateToken(request.headers.authorization);
  }
}

// controller
@Controller("users")
@UseGuards(AuthGuard)
export class UserController {
  @Get()
  findAll() {
    /* ... */
  }
}
```

#### BootifyJS

```typescript
// middleware/auth.middleware.ts
import { FastifyRequest, FastifyReply } from "fastify";

export const authGuard = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const isValid = validateToken(request.headers.authorization);

  if (!isValid) {
    reply.code(401).send({ error: "Unauthorized" });
    return;
  }
};

// controller
import { UseMiddleware } from "bootifyjs";

@Controller("/users")
@UseMiddleware(authGuard)
export class UserController {
  @Get("/")
  findAll() {
    /* ... */
  }
}
```

**Key Changes:**

- Guards → Middleware
- No ExecutionContext abstraction
- Direct Fastify request/reply access
- Simpler implementation

### 9. Interceptors (Caching)

#### NestJS

```typescript
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const key = context.switchToHttp().getRequest().url;
    const cached = getFromCache(key);

    if (cached) {
      return of(cached);
    }

    return next.handle().pipe(tap((data) => setInCache(key, data)));
  }
}

@Controller("users")
export class UserController {
  @Get(":id")
  @UseInterceptors(CacheInterceptor)
  findOne(@Param("id") id: string) {
    return this.userService.findOne(id);
  }
}
```

#### BootifyJS

```typescript
import { Cacheable } from "bootifyjs";

@Controller("/users")
export class UserController {
  @Get("/:id")
  @Cacheable({ key: "user", ttl: 60 })
  findOne(@Param("id") id: string) {
    return this.userService.findOne(id);
  }
}
```

**Key Changes:**

- Built-in caching decorator
- No RxJS required
- Much simpler syntax
- Automatic cache key generation

### 10. Events

#### NestJS

```typescript
// events/user-created.event.ts
export class UserCreatedEvent {
  constructor(public readonly user: User) {}
}

// listeners/user-created.listener.ts
import { OnEvent } from "@nestjs/event-emitter";

@Injectable()
export class UserCreatedListener {
  @OnEvent("user.created")
  handleUserCreated(event: UserCreatedEvent) {
    console.log("User created:", event.user);
  }
}

// service
this.eventEmitter.emit("user.created", new UserCreatedEvent(user));
```

#### BootifyJS

```typescript
// events/user-created.event.ts
export class UserCreatedEvent {
  constructor(public readonly user: User) {}
}

// handlers/user-created.handler.ts
import { EventHandler } from "bootifyjs";

@EventHandler(UserCreatedEvent)
export class UserCreatedHandler {
  async handle(event: UserCreatedEvent) {
    console.log("User created:", event.user);
  }
}

// service
await this.eventBus.emit(new UserCreatedEvent(user));
```

**Key Changes:**

- Type-safe event classes
- `@EventHandler` decorator with event class
- No string-based event names
- Async by default

### 11. Configuration

#### NestJS

```typescript
// config/configuration.ts
export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  database: {
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT, 10) || 5432,
  },
});

// app.module.ts
@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
    }),
  ],
})
export class AppModule {}

// service
@Injectable()
export class AppService {
  constructor(private configService: ConfigService) {}

  getDatabaseHost() {
    return this.configService.get<string>("database.host");
  }
}
```

#### BootifyJS

```typescript
// config/app.config.ts
import { z } from "zod";

export const appConfigSchema = z.object({
  PORT: z.string().transform(Number).default("3000"),
  DATABASE_HOST: z.string(),
  DATABASE_PORT: z.string().transform(Number).default("5432"),
});

// main.ts
const app = await createBootify()
  .useConfig(appConfigSchema)
  .useControllers([UserController])
  .build();

// service
import { AppConfig } from "bootifyjs";

@Service()
export class AppService {
  getDatabaseHost() {
    return AppConfig.get("DATABASE_HOST");
  }
}
```

**Key Changes:**

- Zod schema validation
- Static `AppConfig.get()` method
- No module imports needed
- Type-safe configuration

## Complete Migration Example

### Before (NestJS)

```typescript
// user.module.ts
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UserController],
  providers: [UserService, UserRepository],
  exports: [UserService],
})
export class UserModule {}

// user.controller.ts
@Controller("users")
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  findAll() {
    return this.userService.findAll();
  }

  @Post()
  @UsePipes(new ValidationPipe())
  create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }
}

// create-user.dto.ts
export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;
}

// user.service.ts
@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  findAll() {
    return this.userRepository.findAll();
  }

  create(data: CreateUserDto) {
    return this.userRepository.save(data);
  }
}

// app.module.ts
@Module({
  imports: [UserModule, ConfigModule],
  controllers: [],
  providers: [],
})
export class AppModule {}

// main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
```

### After (BootifyJS)

```typescript
// user.controller.ts
import { Controller, Get, Post, Body, Schema } from "bootifyjs";
import { z } from "zod";

const createUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
});

@Controller("/users")
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get("/")
  findAll() {
    return this.userService.findAll();
  }

  @Post("/")
  @Schema({ body: createUserSchema })
  create(@Body() data: z.infer<typeof createUserSchema>) {
    return this.userService.create(data);
  }
}

// user.service.ts
import { Service, Autowired } from "bootifyjs";

@Service()
export class UserService {
  @Autowired()
  private readonly userRepository!: UserRepository;

  findAll() {
    return this.userRepository.findAll();
  }

  create(data: any) {
    return this.userRepository.save(data);
  }
}

// main.ts
import "reflect-metadata";
import { createBootify } from "bootifyjs";

async function bootstrap() {
  const app = await createBootify()
    .setPort(3000)
    .useControllers([UserController])
    .build();

  await app.start();
}

bootstrap();
```

**Lines of Code:**

- NestJS: ~120 lines across 7 files
- BootifyJS: ~45 lines across 3 files

## Migration Checklist

### Phase 1: Preparation

- [ ] Review NestJS modules and dependencies
- [ ] Identify features you actually use
- [ ] Plan migration order (start with simple modules)

### Phase 2: Setup

- [ ] Install BootifyJS
- [ ] Set up project structure
- [ ] Configure TypeScript (already done from NestJS)

### Phase 3: Core Migration

- [ ] Remove module files
- [ ] Convert controllers (add `/` to routes)
- [ ] Convert services (`@Injectable` → `@Service`)
- [ ] Replace DTOs with Zod schemas
- [ ] Update dependency injection

### Phase 4: Features

- [ ] Convert guards to middleware
- [ ] Replace interceptors with decorators
- [ ] Migrate event system
- [ ] Update configuration

### Phase 5: Testing

- [ ] Update unit tests
- [ ] Update integration tests
- [ ] Performance testing

## Features Not in BootifyJS

Some NestJS features don't have direct equivalents in BootifyJS:

| NestJS Feature | BootifyJS Alternative        |
| -------------- | ---------------------------- |
| GraphQL        | Use Apollo Server directly   |
| Microservices  | Use message queues directly  |
| WebSockets     | Use Fastify WebSocket plugin |
| Pipes          | Use Zod schemas              |
| Interceptors   | Use decorators or middleware |
| Module system  | Flat structure               |

## Performance Comparison

After migration, expect:

- **Similar or better performance** (both use Fastify)
- **Smaller bundle size** (~60% reduction)
- **Faster build times** (less code to compile)
- **Lower memory usage** (simpler abstractions)

## Next Steps

1. Review [Best Practices](./best-practices.md)
2. Explore [Code Templates](../templates/rest-api.md)
3. Check [Advanced Topics](../advanced/custom-middleware.md)

## Conclusion

Migrating from NestJS to BootifyJS simplifies your codebase significantly while maintaining similar functionality. You'll write less boilerplate, have faster development cycles, and maintain high performance.

The migration is straightforward for most applications, especially those not using advanced NestJS features like GraphQL or microservices.
