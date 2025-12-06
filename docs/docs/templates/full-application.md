---
id: full-application
title: Full Application Template
sidebar_label: Full Application
description: Complete application template with all features integrated
keywords: [bootifyjs, full stack, complete application, template]
---

# Full Application Template

This template provides a complete, production-ready BootifyJS application with authentication, database integration, caching, events, logging, and best practices.

## Project Structure

```
my-bootify-app/
├── src/
│   ├── config/
│   │   ├── app.config.ts
│   │   ├── database.config.ts
│   │   └── cache.config.ts
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── user.controller.ts
│   │   └── post.controller.ts
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── user.service.ts
│   │   └── post.service.ts
│   ├── repositories/
│   │   ├── user.repository.ts
│   │   └── post.repository.ts
│   ├── middleware/
│   │   ├── auth.middleware.ts
│   │   ├── error-handler.middleware.ts
│   │   └── request-logger.middleware.ts
│   ├── events/
│   │   ├── user.events.ts
│   │   └── post.events.ts
│   ├── handlers/
│   │   ├── user.handlers.ts
│   │   └── post.handlers.ts
│   ├── models/
│   │   ├── user.model.ts
│   │   └── post.model.ts
│   ├── errors/
│   │   └── custom-errors.ts
│   ├── utils/
│   │   ├── validation.ts
│   │   └── helpers.ts
│   └── index.ts
├── tests/
│   ├── unit/
│   └── integration/
├── prisma/
│   └── schema.prisma
├── .env
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## Complete Implementation

### 1. Application Configuration

```typescript title="src/config/app.config.ts"
export const appConfig = {
  port: parseInt(process.env.PORT || "3000"),
  env: process.env.NODE_ENV || "development",
  jwt: {
    secret: process.env.JWT_SECRET || "your-secret-key",
    expiresIn: "1h",
    refreshExpiresIn: "7d",
  },
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
  },
};
```

### 2. Database Configuration

```typescript title="src/config/database.config.ts"
export const databaseConfig = {
  url: process.env.DATABASE_URL || "postgresql://localhost:5432/mydb",
  pool: {
    min: 2,
    max: 10,
  },
};
```

### 3. Main Application

```typescript title="src/index.ts"
import "reflect-metadata";
import { BootifyApp } from "bootifyjs";
import { appConfig } from "./config/app.config";

// Controllers
import { AuthController } from "./controllers/auth.controller";
import { UserController } from "./controllers/user.controller";
import { PostController } from "./controllers/post.controller";

// Services
import { AuthService } from "./services/auth.service";
import { UserService } from "./services/user.service";
import { PostService } from "./services/post.service";
import { DatabaseService } from "./services/database.service";

// Repositories
import { UserRepository } from "./repositories/user.repository";
import { PostRepository } from "./repositories/post.repository";

// Middleware
import { AuthMiddleware } from "./middleware/auth.middleware";
import { ErrorHandlerMiddleware } from "./middleware/error-handler.middleware";
import { RequestLoggerMiddleware } from "./middleware/request-logger.middleware";

// Event Handlers
import { UserEventHandlers } from "./handlers/user.handlers";
import { PostEventHandlers } from "./handlers/post.handlers";

async function bootstrap() {
  const app = new BootifyApp({
    port: appConfig.port,

    controllers: [AuthController, UserController, PostController],

    providers: [
      // Services
      AuthService,
      UserService,
      PostService,
      DatabaseService,

      // Repositories
      UserRepository,
      PostRepository,

      // Middleware
      AuthMiddleware,
      ErrorHandlerMiddleware,
      RequestLoggerMiddleware,
    ],

    eventHandlers: [UserEventHandlers, PostEventHandlers],

    globalMiddleware: [RequestLoggerMiddleware, ErrorHandlerMiddleware],
  });

  // Connect to database
  const dbService = app.get(DatabaseService);
  await dbService.connect();

  // Start server
  await app.start();

  console.log(`🚀 Application running on port ${appConfig.port}`);
  console.log(`📝 Environment: ${appConfig.env}`);

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    console.log("SIGTERM received, shutting down gracefully...");
    await dbService.disconnect();
    await app.stop();
    process.exit(0);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start application:", error);
  process.exit(1);
});
```

### 4. User Model and Validation

```typescript title="src/models/user.model.ts"
import { z } from "zod";

export const RegisterSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  password: z.string().min(8).max(100),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const UpdateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
});

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export type RegisterDto = z.infer<typeof RegisterSchema>;
export type LoginDto = z.infer<typeof LoginSchema>;
export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;
```

### 5. Post Model

```typescript title="src/models/post.model.ts"
import { z } from "zod";

export const CreatePostSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().optional(),
  published: z.boolean().default(false),
});

export const UpdatePostSchema = CreatePostSchema.partial();

export interface Post {
  id: string;
  title: string;
  content?: string;
  published: boolean;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CreatePostDto = z.infer<typeof CreatePostSchema>;
export type UpdatePostDto = z.infer<typeof UpdatePostSchema>;
```

### 6. Auth Controller

```typescript title="src/controllers/auth.controller.ts"
import {
  Controller,
  Post,
  Get,
  Body,
  Validate,
  UseMiddleware,
} from "bootifyjs";
import { AuthService } from "../services/auth.service";
import {
  RegisterSchema,
  LoginSchema,
  RegisterDto,
  LoginDto,
} from "../models/user.model";

@Controller("/api/auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post("/register")
  @Validate(RegisterSchema)
  async register(@Body() data: RegisterDto) {
    const result = await this.authService.register(data);
    return {
      statusCode: 201,
      data: result,
      message: "User registered successfully",
    };
  }

  @Post("/login")
  @Validate(LoginSchema)
  async login(@Body() data: LoginDto) {
    const result = await this.authService.login(data);
    return {
      data: result,
      message: "Login successful",
    };
  }

  @Get("/me")
  @UseMiddleware("authMiddleware")
  async getCurrentUser(request: any) {
    return {
      data: request.user,
    };
  }
}
```

### 7. User Controller

```typescript title="src/controllers/user.controller.ts"
import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Body,
  Validate,
  UseMiddleware,
} from "bootifyjs";
import { UserService } from "../services/user.service";
import { UpdateUserSchema, UpdateUserDto } from "../models/user.model";

@Controller("/api/users")
@UseMiddleware("authMiddleware")
export class UserController {
  constructor(private userService: UserService) {}

  @Get("/")
  async getAllUsers() {
    const users = await this.userService.getAllUsers();
    return { data: users };
  }

  @Get("/:id")
  async getUser(@Param("id") id: string) {
    const user = await this.userService.getUserById(id);
    return { data: user };
  }

  @Put("/:id")
  @Validate(UpdateUserSchema)
  async updateUser(@Param("id") id: string, @Body() data: UpdateUserDto) {
    const user = await this.userService.updateUser(id, data);
    return {
      data: user,
      message: "User updated successfully",
    };
  }

  @Delete("/:id")
  async deleteUser(@Param("id") id: string) {
    await this.userService.deleteUser(id);
    return { message: "User deleted successfully" };
  }
}
```

### 8. Post Controller

```typescript title="src/controllers/post.controller.ts"
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Validate,
  UseMiddleware,
} from "bootifyjs";
import { PostService } from "../services/post.service";
import {
  CreatePostSchema,
  UpdatePostSchema,
  CreatePostDto,
  UpdatePostDto,
} from "../models/post.model";

@Controller("/api/posts")
export class PostController {
  constructor(private postService: PostService) {}

  @Get("/")
  async getPosts(@Query("published") published?: string) {
    const isPublished =
      published === "true" ? true : published === "false" ? false : undefined;
    const posts = await this.postService.getAllPosts(isPublished);
    return { data: posts };
  }

  @Get("/:id")
  async getPost(@Param("id") id: string) {
    const post = await this.postService.getPostById(id);
    return { data: post };
  }

  @Post("/")
  @UseMiddleware("authMiddleware")
  @Validate(CreatePostSchema)
  async createPost(@Body() data: CreatePostDto, request: any) {
    const post = await this.postService.createPost({
      ...data,
      authorId: request.user.id,
    });
    return {
      statusCode: 201,
      data: post,
      message: "Post created successfully",
    };
  }

  @Put("/:id")
  @UseMiddleware("authMiddleware")
  @Validate(UpdatePostSchema)
  async updatePost(
    @Param("id") id: string,
    @Body() data: UpdatePostDto,
    request: any
  ) {
    const post = await this.postService.updatePost(id, data, request.user.id);
    return {
      data: post,
      message: "Post updated successfully",
    };
  }

  @Delete("/:id")
  @UseMiddleware("authMiddleware")
  async deletePost(@Param("id") id: string, request: any) {
    await this.postService.deletePost(id, request.user.id);
    return { message: "Post deleted successfully" };
  }
}
```

### 9. User Service

```typescript title="src/services/user.service.ts"
import { Injectable } from "bootifyjs";
import { EventBus } from "bootifyjs/events";
import { UserRepository } from "../repositories/user.repository";
import { UpdateUserDto } from "../models/user.model";
import { NotFoundError } from "../errors/custom-errors";
import { UserUpdatedEvent, UserDeletedEvent } from "../events/user.events";

@Injectable()
export class UserService {
  constructor(
    private userRepository: UserRepository,
    private eventBus: EventBus
  ) {}

  async getAllUsers() {
    return this.userRepository.findAll();
  }

  async getUserById(id: string) {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundError("User", id);
    }
    return user;
  }

  async updateUser(id: string, data: UpdateUserDto) {
    const user = await this.getUserById(id);
    const updated = await this.userRepository.update(id, data);

    await this.eventBus.publish(new UserUpdatedEvent(id, data));

    return updated;
  }

  async deleteUser(id: string) {
    await this.getUserById(id);
    await this.userRepository.delete(id);

    await this.eventBus.publish(new UserDeletedEvent(id));
  }
}
```

### 10. Post Service

```typescript title="src/services/post.service.ts"
import { Injectable } from "bootifyjs";
import { Cacheable, CacheEvict } from "bootifyjs/cache";
import { EventBus } from "bootifyjs/events";
import { PostRepository } from "../repositories/post.repository";
import { CreatePostDto, UpdatePostDto } from "../models/post.model";
import { NotFoundError, ForbiddenError } from "../errors/custom-errors";
import { PostCreatedEvent, PostPublishedEvent } from "../events/post.events";

@Injectable()
export class PostService {
  constructor(
    private postRepository: PostRepository,
    private eventBus: EventBus
  ) {}

  @Cacheable({ key: (published?: boolean) => `posts:${published}`, ttl: 300 })
  async getAllPosts(published?: boolean) {
    return this.postRepository.findAll(published);
  }

  @Cacheable({ key: (id: string) => `post:${id}`, ttl: 600 })
  async getPostById(id: string) {
    const post = await this.postRepository.findById(id);
    if (!post) {
      throw new NotFoundError("Post", id);
    }
    return post;
  }

  @CacheEvict({ key: "posts:*" })
  async createPost(data: CreatePostDto & { authorId: string }) {
    const post = await this.postRepository.create(data);

    await this.eventBus.publish(new PostCreatedEvent(post.id, post.authorId));

    if (post.published) {
      await this.eventBus.publish(new PostPublishedEvent(post.id));
    }

    return post;
  }

  @CacheEvict({ key: (id: string) => `post:${id}` })
  @CacheEvict({ key: "posts:*" })
  async updatePost(id: string, data: UpdatePostDto, userId: string) {
    const post = await this.getPostById(id);

    if (post.authorId !== userId) {
      throw new ForbiddenError("You can only update your own posts");
    }

    const wasPublished = post.published;
    const updated = await this.postRepository.update(id, data);

    if (!wasPublished && updated?.published) {
      await this.eventBus.publish(new PostPublishedEvent(id));
    }

    return updated;
  }

  @CacheEvict({ key: (id: string) => `post:${id}` })
  @CacheEvict({ key: "posts:*" })
  async deletePost(id: string, userId: string) {
    const post = await this.getPostById(id);

    if (post.authorId !== userId) {
      throw new ForbiddenError("You can only delete your own posts");
    }

    await this.postRepository.delete(id);
  }
}
```

### 11. Environment Variables

```bash title=".env.example"
# Application
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/mydb

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# Redis (optional)
REDIS_HOST=localhost
REDIS_PORT=6379

# CORS
CORS_ORIGIN=*

# Logging
LOG_LEVEL=info
```

### 12. Package.json

```json title="package.json"
{
  "name": "my-bootify-app",
  "version": "1.0.0",
  "scripts": {
    "dev": "nodemon",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "prisma:migrate": "prisma migrate dev",
    "prisma:generate": "prisma generate",
    "prisma:studio": "prisma studio"
  },
  "dependencies": {
    "bootifyjs": "^1.0.0",
    "@prisma/client": "^5.0.0",
    "bcrypt": "^5.1.0",
    "jsonwebtoken": "^9.0.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/bcrypt": "^5.0.0",
    "@types/jsonwebtoken": "^9.0.0",
    "@types/jest": "^29.0.0",
    "typescript": "^5.0.0",
    "nodemon": "^3.0.0",
    "ts-node": "^10.0.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0",
    "prisma": "^5.0.0"
  }
}
```

### 13. TypeScript Configuration

```json title="tsconfig.json"
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

## Running the Application

```bash
# Install dependencies
npm install

# Set up database
npx prisma migrate dev

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (protected)

### Users

- `GET /api/users` - Get all users (protected)
- `GET /api/users/:id` - Get user by ID (protected)
- `PUT /api/users/:id` - Update user (protected)
- `DELETE /api/users/:id` - Delete user (protected)

### Posts

- `GET /api/posts` - Get all posts
- `GET /api/posts/:id` - Get post by ID
- `POST /api/posts` - Create post (protected)
- `PUT /api/posts/:id` - Update post (protected)
- `DELETE /api/posts/:id` - Delete post (protected)

## Features Included

✅ Authentication with JWT
✅ Database integration with Prisma
✅ Caching with decorators
✅ Event-driven architecture
✅ Request validation with Zod
✅ Error handling
✅ Logging
✅ Middleware
✅ TypeScript support
✅ Testing setup

## Next Steps

- Add API documentation with Swagger
- Implement rate limiting
- Add file upload support
- Set up CI/CD pipeline
- Add monitoring and metrics
- Implement search functionality
- Add pagination
- Set up Docker containers

:::tip
This template provides a solid foundation for building production-ready applications. Customize it based on your specific requirements.
:::
