---
id: authentication
title: Authentication Template
sidebar_label: Authentication
description: JWT authentication template with login, registration, and protected routes
keywords: [bootifyjs, authentication, jwt, security, template]
---

# Authentication Template

This template provides a complete JWT-based authentication system with user registration, login, token management, and protected routes.

## Complete Example

### 1. Install Dependencies

```bash
npm install jsonwebtoken bcrypt
npm install --save-dev @types/jsonwebtoken @types/bcrypt
```

### 2. Define User Model and Schemas

```typescript title="src/models/user.model.ts"
import { z } from "zod";

// Validation schemas
export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  name: z.string().min(2).max(100),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// TypeScript types
export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

export type RegisterDto = z.infer<typeof RegisterSchema>;
export type LoginDto = z.infer<typeof LoginSchema>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface JwtPayload {
  userId: string;
  email: string;
}
```

### 3. Create Authentication Service

```typescript title="src/services/auth.service.ts"
import { Injectable } from "bootifyjs";
import * as bcrypt from "bcrypt";
import * as jwt from "jsonwebtoken";
import { UserRepository } from "../repositories/user.repository";
import {
  RegisterDto,
  LoginDto,
  AuthTokens,
  JwtPayload,
  UserResponse,
} from "../models/user.model";

@Injectable()
export class AuthService {
  private readonly JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
  private readonly JWT_EXPIRES_IN = "1h";
  private readonly REFRESH_TOKEN_EXPIRES_IN = "7d";
  private readonly SALT_ROUNDS = 10;

  constructor(private userRepository: UserRepository) {}

  async register(
    data: RegisterDto
  ): Promise<{ user: UserResponse; tokens: AuthTokens }> {
    // Check if user already exists
    const existingUser = await this.userRepository.findByEmail(data.email);
    if (existingUser) {
      throw new Error("User with this email already exists");
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, this.SALT_ROUNDS);

    // Create user
    const user = await this.userRepository.create({
      email: data.email,
      name: data.name,
      passwordHash,
    });

    // Generate tokens
    const tokens = this.generateTokens(user.id, user.email);

    return {
      user: this.sanitizeUser(user),
      tokens,
    };
  }

  async login(
    data: LoginDto
  ): Promise<{ user: UserResponse; tokens: AuthTokens }> {
    // Find user
    const user = await this.userRepository.findByEmail(data.email);
    if (!user) {
      throw new Error("Invalid credentials");
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(
      data.password,
      user.passwordHash
    );
    if (!isPasswordValid) {
      throw new Error("Invalid credentials");
    }

    // Generate tokens
    const tokens = this.generateTokens(user.id, user.email);

    return {
      user: this.sanitizeUser(user),
      tokens,
    };
  }

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    try {
      const payload = jwt.verify(refreshToken, this.JWT_SECRET) as JwtPayload;

      // Verify user still exists
      const user = await this.userRepository.findById(payload.userId);
      if (!user) {
        throw new Error("User not found");
      }

      return this.generateTokens(user.id, user.email);
    } catch (error) {
      throw new Error("Invalid refresh token");
    }
  }

  async verifyToken(token: string): Promise<JwtPayload> {
    try {
      return jwt.verify(token, this.JWT_SECRET) as JwtPayload;
    } catch (error) {
      throw new Error("Invalid token");
    }
  }

  async getUserFromToken(token: string): Promise<UserResponse> {
    const payload = await this.verifyToken(token);
    const user = await this.userRepository.findById(payload.userId);

    if (!user) {
      throw new Error("User not found");
    }

    return this.sanitizeUser(user);
  }

  private generateTokens(userId: string, email: string): AuthTokens {
    const payload: JwtPayload = { userId, email };

    const accessToken = jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: this.JWT_EXPIRES_IN,
    });

    const refreshToken = jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: this.REFRESH_TOKEN_EXPIRES_IN,
    });

    return { accessToken, refreshToken };
  }

  private sanitizeUser(user: any): UserResponse {
    const { passwordHash, ...sanitized } = user;
    return sanitized;
  }
}
```

### 4. Create User Repository

```typescript title="src/repositories/user.repository.ts"
import { Injectable } from "bootifyjs";
import { User } from "../models/user.model";

@Injectable()
export class UserRepository {
  private users: Map<string, User> = new Map();
  private idCounter = 1;

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async findByEmail(email: string): Promise<User | null> {
    return (
      Array.from(this.users.values()).find((u) => u.email === email) || null
    );
  }

  async create(data: {
    email: string;
    name: string;
    passwordHash: string;
  }): Promise<User> {
    const user: User = {
      id: (this.idCounter++).toString(),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.users.set(user.id, user);
    return user;
  }

  async update(id: string, data: Partial<User>): Promise<User | null> {
    const user = this.users.get(id);
    if (!user) return null;

    const updated = {
      ...user,
      ...data,
      updatedAt: new Date(),
    };

    this.users.set(id, updated);
    return updated;
  }
}
```

### 5. Create Authentication Middleware

```typescript title="src/middleware/auth.middleware.ts"
import { FastifyRequest, FastifyReply } from "fastify";
import { AuthService } from "../services/auth.service";

export class AuthMiddleware {
  constructor(private authService: AuthService) {}

  async authenticate(request: FastifyRequest, reply: FastifyReply) {
    try {
      // Extract token from Authorization header
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return reply.status(401).send({
          error: "Unauthorized",
          message: "No token provided",
        });
      }

      const token = authHeader.substring(7);

      // Verify token and get user
      const user = await this.authService.getUserFromToken(token);

      // Attach user to request
      (request as any).user = user;
    } catch (error) {
      return reply.status(401).send({
        error: "Unauthorized",
        message: "Invalid or expired token",
      });
    }
  }
}
```

### 6. Create Auth Controller

```typescript title="src/controllers/auth.controller.ts"
import {
  Controller,
  Post,
  Get,
  Validate,
  Body,
  Headers,
  UseMiddleware,
} from "bootifyjs";
import { AuthService } from "../services/auth.service";
import { AuthMiddleware } from "../middleware/auth.middleware";
import {
  RegisterSchema,
  LoginSchema,
  RegisterDto,
  LoginDto,
} from "../models/user.model";

@Controller("/api/auth")
export class AuthController {
  constructor(
    private authService: AuthService,
    private authMiddleware: AuthMiddleware
  ) {}

  // POST /api/auth/register - Register new user
  @Post("/register")
  @Validate(RegisterSchema)
  async register(@Body() data: RegisterDto) {
    try {
      const result = await this.authService.register(data);
      return {
        statusCode: 201,
        data: result,
        message: "User registered successfully",
      };
    } catch (error) {
      throw {
        statusCode: 400,
        message: error.message,
      };
    }
  }

  // POST /api/auth/login - Login user
  @Post("/login")
  @Validate(LoginSchema)
  async login(@Body() data: LoginDto) {
    try {
      const result = await this.authService.login(data);
      return {
        data: result,
        message: "Login successful",
      };
    } catch (error) {
      throw {
        statusCode: 401,
        message: error.message,
      };
    }
  }

  // POST /api/auth/refresh - Refresh access token
  @Post("/refresh")
  async refreshToken(@Body() body: { refreshToken: string }) {
    try {
      const tokens = await this.authService.refreshToken(body.refreshToken);
      return {
        data: tokens,
        message: "Token refreshed successfully",
      };
    } catch (error) {
      throw {
        statusCode: 401,
        message: error.message,
      };
    }
  }

  // GET /api/auth/me - Get current user (protected route)
  @Get("/me")
  @UseMiddleware("authMiddleware")
  async getCurrentUser(@Headers("authorization") auth: string) {
    try {
      const token = auth.substring(7);
      const user = await this.authService.getUserFromToken(token);
      return {
        data: user,
      };
    } catch (error) {
      throw {
        statusCode: 401,
        message: "Unauthorized",
      };
    }
  }
}
```

### 7. Create Protected Resource Controller

```typescript title="src/controllers/profile.controller.ts"
import { Controller, Get, Put, UseMiddleware, Body, Validate } from "bootifyjs";
import { z } from "zod";

const UpdateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
});

@Controller("/api/profile")
@UseMiddleware("authMiddleware") // Apply to all routes in this controller
export class ProfileController {
  // GET /api/profile - Get user profile
  @Get("/")
  async getProfile(request: any) {
    // User is available from auth middleware
    return {
      data: request.user,
    };
  }

  // PUT /api/profile - Update user profile
  @Put("/")
  @Validate(UpdateProfileSchema)
  async updateProfile(request: any, @Body() data: any) {
    // Update user profile logic here
    return {
      data: {
        ...request.user,
        ...data,
      },
      message: "Profile updated successfully",
    };
  }
}
```

### 8. Bootstrap Application

```typescript title="src/index.ts"
import { BootifyApp } from "bootifyjs";
import { AuthController } from "./controllers/auth.controller";
import { ProfileController } from "./controllers/profile.controller";
import { AuthService } from "./services/auth.service";
import { UserRepository } from "./repositories/user.repository";
import { AuthMiddleware } from "./middleware/auth.middleware";

const app = new BootifyApp({
  port: 3000,
  controllers: [AuthController, ProfileController],
  providers: [AuthService, UserRepository, AuthMiddleware],
});

app.start();
```

### 9. Environment Configuration

```bash title=".env"
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
NODE_ENV=development
```

## API Endpoints

| Method | Endpoint             | Protected | Description          |
| ------ | -------------------- | --------- | -------------------- |
| POST   | `/api/auth/register` | No        | Register new user    |
| POST   | `/api/auth/login`    | No        | Login user           |
| POST   | `/api/auth/refresh`  | No        | Refresh access token |
| GET    | `/api/auth/me`       | Yes       | Get current user     |
| GET    | `/api/profile`       | Yes       | Get user profile     |
| PUT    | `/api/profile`       | Yes       | Update user profile  |

## Example Requests

### Register User

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123",
    "name": "John Doe"
  }'
```

### Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123"
  }'
```

### Access Protected Route

```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Refresh Token

```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "YOUR_REFRESH_TOKEN"
  }'
```

## Security Best Practices

- **Strong Secrets**: Use strong, random JWT secrets in production
- **HTTPS Only**: Always use HTTPS in production
- **Token Expiration**: Set appropriate token expiration times
- **Password Hashing**: Use bcrypt with sufficient salt rounds (10+)
- **Input Validation**: Validate all user inputs with Zod schemas
- **Rate Limiting**: Implement rate limiting on auth endpoints
- **Refresh Tokens**: Store refresh tokens securely (database or Redis)
- **Token Revocation**: Implement token blacklisting for logout

## Next Steps

- Add password reset functionality
- Implement email verification
- Add OAuth2 providers (Google, GitHub, etc.)
- Store refresh tokens in Redis
- Add role-based access control (RBAC)
- Implement rate limiting
- Add two-factor authentication (2FA)
- Set up token blacklisting for logout

:::warning
This example uses in-memory storage for demonstration. In production, use a real database and store refresh tokens securely. Never commit JWT secrets to version control.
:::

:::tip
For enhanced security, consider using the BootifyJS Auth module which provides built-in strategies for JWT, API keys, and OAuth2.
:::
