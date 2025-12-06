---
id: auth-api
title: Auth API Reference
sidebar_label: Auth API
description: Complete reference for BootifyJS authentication system classes and methods
keywords: [bootifyjs, auth, api, reference, jwt, api-key]
---

# Auth API Reference

This page documents the authentication system classes and methods for implementing secure authentication in BootifyJS applications.

## Core Authentication

### AuthManager

Central orchestrator for authentication strategies.

#### Constructor

```typescript
constructor(config?: {
  defaultStrategy?: string;
  tokenStorage?: TokenStorage;
})
```

**Parameters:**

- `config` (optional): Configuration options
  - `defaultStrategy`: Name of the default authentication strategy
  - `tokenStorage`: Token storage implementation for session management

**Example:**

```typescript
import { AuthManager } from "bootifyjs";

const authManager = new AuthManager({
  defaultStrategy: "jwt",
  tokenStorage: redisTokenStorage,
});
```

---

#### Methods

##### registerStrategy()

Registers an authentication strategy.

**Signature:**

```typescript
async registerStrategy(strategy: AuthStrategy, config: AuthConfig): Promise<void>
```

**Parameters:**

- `strategy`: Strategy instance to register
- `config`: Strategy configuration

**Example:**

```typescript
import { AuthManager, JwtStrategy } from "bootifyjs";

const authManager = new AuthManager();
const jwtStrategy = new JwtStrategy();

await authManager.registerStrategy(jwtStrategy, {
  strategy: "jwt",
  options: {
    accessTokenSecret: process.env.JWT_ACCESS_SECRET!,
    refreshTokenSecret: process.env.JWT_REFRESH_SECRET!,
    accessTokenExpiry: "15m",
    refreshTokenExpiry: "7d",
    userProvider: async (userId) => await userRepo.findById(userId),
    credentialValidator: async (credentials) => {
      return await userService.validateCredentials(credentials);
    },
  },
});
```

---

##### authenticate()

Authenticates a user using a specific strategy or auto-detection.

**Signature:**

```typescript
async authenticate(context: AuthContext, strategyName?: string): Promise<AuthResult>
```

**Parameters:**

- `context`: Authentication context
- `strategyName` (optional): Specific strategy to use

**Returns:**

- `AuthResult` with user data and tokens if successful

**Example:**

```typescript
const result = await authManager.authenticate({
  type: "login",
  strategy: "jwt",
  request: fastifyRequest,
  headers: request.headers,
  body: {
    email: "user@example.com",
    password: "password123",
  },
});

if (result.success) {
  console.log("User authenticated:", result.user);
  console.log("Access token:", result.tokens?.accessToken);
} else {
  console.error("Authentication failed:", result.error);
}
```

---

##### validate()

Validates a token using a specific strategy or auto-detection.

**Signature:**

```typescript
async validate(token: string, context: AuthContext, strategyName?: string): Promise<AuthResult>
```

**Parameters:**

- `token`: Token to validate
- `context`: Authentication context
- `strategyName` (optional): Specific strategy to use

**Returns:**

- `AuthResult` with user data if valid

**Example:**

```typescript
const token = request.headers.authorization?.replace("Bearer ", "");

const result = await authManager.validate(token, {
  type: "validate",
  strategy: "jwt",
  request: fastifyRequest,
  headers: request.headers,
});

if (result.success) {
  request.user = result.user;
} else {
  reply.code(401).send({ error: "Invalid token" });
}
```

---

##### refresh()

Refreshes an access token using a refresh token.

**Signature:**

```typescript
async refresh(refreshToken: string, context: AuthContext, strategyName?: string): Promise<AuthResult>
```

**Parameters:**

- `refreshToken`: Refresh token
- `context`: Authentication context
- `strategyName` (optional): Specific strategy to use

**Returns:**

- `AuthResult` with new tokens if successful

**Example:**

```typescript
const result = await authManager.refresh(refreshToken, {
  type: "refresh",
  strategy: "jwt",
  request: fastifyRequest,
  headers: request.headers,
});

if (result.success) {
  reply.send({
    accessToken: result.tokens?.accessToken,
    refreshToken: result.tokens?.refreshToken,
  });
}
```

---

##### revoke()

Revokes/logs out a user's session.

**Signature:**

```typescript
async revoke(token: string, context: AuthContext, strategyName?: string): Promise<boolean>
```

**Parameters:**

- `token`: Token to revoke
- `context`: Authentication context
- `strategyName` (optional): Specific strategy to use

**Returns:**

- `true` if revocation succeeded

**Example:**

```typescript
const token = request.headers.authorization?.replace("Bearer ", "");

const revoked = await authManager.revoke(token, {
  type: "revoke",
  strategy: "jwt",
  request: fastifyRequest,
  headers: request.headers,
});

if (revoked) {
  reply.send({ message: "Logged out successfully" });
}
```

---

##### getStrategy()

Gets a registered strategy by name.

**Signature:**

```typescript
getStrategy(name: string): AuthStrategy | undefined
```

**Parameters:**

- `name`: Strategy name

**Returns:**

- Strategy instance or `undefined`

---

##### getRegisteredStrategies()

Gets all registered strategy names.

**Signature:**

```typescript
getRegisteredStrategies(): string[]
```

**Returns:**

- Array of strategy names

---

##### getStats()

Gets authentication statistics.

**Signature:**

```typescript
getStats(): {
  registeredStrategies: number;
  strategyNames: string[];
  defaultStrategy?: string;
}
```

**Returns:**

- Statistics object

---

## Authentication Strategies

### JwtStrategy

JWT-based authentication with refresh token support.

#### Constructor

```typescript
constructor();
```

---

#### Configuration

**JwtStrategyConfig:**

```typescript
interface JwtStrategyConfig {
  accessTokenSecret: string;
  refreshTokenSecret: string;
  accessTokenExpiry: string | number;
  refreshTokenExpiry: string | number;
  issuer?: string;
  audience?: string;
  algorithm?: jwt.Algorithm;
  tokenStorage?: TokenStorage;
  userProvider: (userId: string) => Promise<User | null>;
  credentialValidator?: (credentials: any) => Promise<User | null>;
}
```

**Example:**

```typescript
const jwtConfig: JwtStrategyConfig = {
  accessTokenSecret: process.env.JWT_ACCESS_SECRET!,
  refreshTokenSecret: process.env.JWT_REFRESH_SECRET!,
  accessTokenExpiry: "15m",
  refreshTokenExpiry: "7d",
  issuer: "my-app",
  audience: "my-app-users",
  algorithm: "HS256",
  tokenStorage: redisTokenStorage,
  userProvider: async (userId) => {
    return await userRepository.findById(userId);
  },
  credentialValidator: async (credentials) => {
    const user = await userRepository.findByEmail(credentials.email);
    if (!user) return null;

    const valid = await bcrypt.compare(credentials.password, user.passwordHash);
    return valid ? user : null;
  },
};
```

---

### ApiKeyStrategy

API key-based authentication with scoped permissions.

#### Constructor

```typescript
constructor();
```

---

#### Configuration

**ApiKeyStrategyConfig:**

```typescript
interface ApiKeyStrategyConfig {
  keyPrefix?: string;
  keyLength?: number;
  hashAlgorithm?: string;
  tokenStorage: TokenStorage;
  userProvider: (userId: string) => Promise<User | null>;
  keyValidator?: (
    keyId: string,
    hashedKey: string
  ) => Promise<ApiKeyData | null>;
  defaultScopes?: string[];
  maxKeysPerUser?: number;
  keyExpiry?: number;
}
```

**Example:**

```typescript
const apiKeyConfig: ApiKeyStrategyConfig = {
  keyPrefix: "ak_",
  keyLength: 32,
  hashAlgorithm: "sha256",
  tokenStorage: redisTokenStorage,
  userProvider: async (userId) => {
    return await userRepository.findById(userId);
  },
  defaultScopes: ["read"],
  maxKeysPerUser: 10,
  keyExpiry: 31536000, // 1 year
};
```

---

#### Methods

##### listUserApiKeys()

Lists all API keys for a user.

**Signature:**

```typescript
async listUserApiKeys(userId: string): Promise<ApiKeyData[]>
```

**Parameters:**

- `userId`: User ID

**Returns:**

- Array of API key data (without secrets)

**Example:**

```typescript
const apiKeys = await apiKeyStrategy.listUserApiKeys("user-123");
console.log(`User has ${apiKeys.length} API keys`);
```

---

##### deleteApiKey()

Permanently deletes an API key.

**Signature:**

```typescript
async deleteApiKey(keyId: string, userId: string): Promise<boolean>
```

**Parameters:**

- `keyId`: API key ID
- `userId`: User ID

**Returns:**

- `true` if deletion succeeded

**Example:**

```typescript
const deleted = await apiKeyStrategy.deleteApiKey("key-123", "user-456");
if (deleted) {
  console.log("API key deleted");
}
```

---

## Interfaces and Types

### User

User object returned by authentication.

**Definition:**

```typescript
interface User {
  id: string;
  email?: string;
  username?: string;
  roles: string[];
  permissions: string[];
  metadata?: Record<string, any>;
  createdAt: Date;
  lastLoginAt?: Date;
}
```

**Example:**

```typescript
const user: User = {
  id: "123",
  email: "user@example.com",
  username: "johndoe",
  roles: ["user", "admin"],
  permissions: ["read:users", "write:users", "delete:users"],
  metadata: {
    department: "Engineering",
    level: "Senior",
  },
  createdAt: new Date("2024-01-01"),
  lastLoginAt: new Date(),
};
```

---

### AuthResult

Result of authentication operations.

**Definition:**

```typescript
interface AuthResult {
  success: boolean;
  user?: User;
  tokens?: TokenPair;
  error?: string;
  metadata?: Record<string, any>;
}
```

**Properties:**

- `success`: Whether operation succeeded
- `user`: User object if successful
- `tokens`: Token pair if successful
- `error`: Error message if failed
- `metadata`: Additional metadata

---

### TokenPair

Access and refresh token pair.

**Definition:**

```typescript
interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: "Bearer" | "API-Key";
  scope?: string[];
}
```

**Example:**

```typescript
const tokens: TokenPair = {
  accessToken: "eyJhbGciOiJIUzI1NiIs...",
  refreshToken: "eyJhbGciOiJIUzI1NiIs...",
  expiresIn: 900, // 15 minutes
  tokenType: "Bearer",
  scope: ["read", "write"],
};
```

---

### AuthContext

Context for authentication operations.

**Definition:**

```typescript
interface AuthContext {
  type: "login" | "validate" | "refresh" | "revoke" | "generate";
  strategy: string;
  request: any;
  headers: Record<string, string>;
  body?: any;
  query?: Record<string, string>;
}
```

---

### AuthStrategy

Interface for authentication strategies.

**Definition:**

```typescript
interface AuthStrategy {
  readonly name: string;
  readonly type: AuthStrategyType;

  authenticate(context: AuthContext): Promise<AuthResult>;
  validate(token: string, context: AuthContext): Promise<AuthResult>;
  refresh?(refreshToken: string, context: AuthContext): Promise<AuthResult>;
  revoke?(token: string, context: AuthContext): Promise<boolean>;
  initialize(config: AuthConfig): Promise<void>;
}
```

---

### TokenStorage

Interface for token storage implementations.

**Definition:**

```typescript
interface TokenStorage {
  store(key: string, value: any, ttl?: number): Promise<void>;
  get(key: string): Promise<any>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
```

**Example Implementation:**

```typescript
import { TokenStorage } from "bootifyjs";
import Redis from "ioredis";

export class RedisTokenStorage implements TokenStorage {
  private redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl);
  }

  async store(key: string, value: any, ttl?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttl) {
      await this.redis.setex(key, ttl, serialized);
    } else {
      await this.redis.set(key, serialized);
    }
  }

  async get(key: string): Promise<any> {
    const value = await this.redis.get(key);
    return value ? JSON.parse(value) : null;
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.redis.exists(key);
    return result === 1;
  }
}
```

---

### ApiKeyData

API key metadata.

**Definition:**

```typescript
interface ApiKeyData {
  keyId: string;
  userId: string;
  name: string;
  scopes: string[];
  isActive: boolean;
  createdAt: Date;
  lastUsedAt?: Date;
  expiresAt?: Date;
}
```

---

## Error Classes

### AuthError

Base authentication error.

**Definition:**

```typescript
class AuthError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 401,
    public metadata?: Record<string, any>
  );
}
```

**Example:**

```typescript
throw new AuthError("Invalid credentials", "INVALID_CREDENTIALS", 401, {
  attemptCount: 3,
});
```

---

### TokenExpiredError

Token expiration error.

**Definition:**

```typescript
class TokenExpiredError extends AuthError {
  constructor(message: string = "Token has expired");
}
```

---

### InvalidTokenError

Invalid token error.

**Definition:**

```typescript
class InvalidTokenError extends AuthError {
  constructor(message: string = "Invalid token");
}
```

---

### UnauthorizedError

Unauthorized access error.

**Definition:**

```typescript
class UnauthorizedError extends AuthError {
  constructor(message: string = "Unauthorized access");
}
```

---

### ForbiddenError

Forbidden access error.

**Definition:**

```typescript
class ForbiddenError extends AuthError {
  constructor(message: string = "Forbidden access");
}
```

---

## Usage Examples

### JWT Authentication Setup

```typescript
import { AuthManager, JwtStrategy } from "bootifyjs";
import { RedisTokenStorage } from "./storage/redis";

// Create token storage
const tokenStorage = new RedisTokenStorage(process.env.REDIS_URL!);

// Create auth manager
const authManager = new AuthManager({
  defaultStrategy: "jwt",
  tokenStorage,
});

// Register JWT strategy
const jwtStrategy = new JwtStrategy();
await authManager.registerStrategy(jwtStrategy, {
  strategy: "jwt",
  options: {
    accessTokenSecret: process.env.JWT_ACCESS_SECRET!,
    refreshTokenSecret: process.env.JWT_REFRESH_SECRET!,
    accessTokenExpiry: "15m",
    refreshTokenExpiry: "7d",
    userProvider: async (userId) => {
      return await userRepository.findById(userId);
    },
    credentialValidator: async (credentials) => {
      return await userService.validateCredentials(credentials);
    },
  },
});
```

---

### Login Endpoint

```typescript
import { Controller, Post, Body } from "bootifyjs";

@Controller("/auth")
export class AuthController {
  constructor(private authManager: AuthManager) {}

  @Post("/login")
  async login(@Body() credentials: any, @Req() request: any) {
    const result = await this.authManager.authenticate({
      type: "login",
      strategy: "jwt",
      request,
      headers: request.headers,
      body: credentials,
    });

    if (!result.success) {
      throw new UnauthorizedError(result.error);
    }

    return {
      user: result.user,
      accessToken: result.tokens?.accessToken,
      refreshToken: result.tokens?.refreshToken,
      expiresIn: result.tokens?.expiresIn,
    };
  }
}
```

---

### Authentication Middleware

```typescript
import { FastifyRequest, FastifyReply } from "fastify";
import { AuthManager } from "bootifyjs";

export const authMiddleware = (authManager: AuthManager) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      reply.code(401).send({ error: "No token provided" });
      return;
    }

    const result = await authManager.validate(token, {
      type: "validate",
      strategy: "jwt",
      request,
      headers: request.headers as Record<string, string>,
    });

    if (!result.success) {
      reply.code(401).send({ error: result.error });
      return;
    }

    // Attach user to request
    (request as any).user = result.user;
  };
};
```

---

### API Key Generation

```typescript
@Controller("/api-keys")
export class ApiKeyController {
  constructor(private authManager: AuthManager) {}

  @Post("/")
  async createApiKey(@Body() data: any, @Req() request: any) {
    const userId = (request as any).user.id;

    const result = await this.authManager.authenticate({
      type: "generate",
      strategy: "api-key",
      request,
      headers: request.headers,
      body: {
        userId,
        name: data.name,
        scopes: data.scopes || ["read"],
        expiresIn: data.expiresIn,
      },
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    return {
      keyId: result.metadata?.keyId,
      apiKey: result.tokens?.accessToken,
      refreshKey: result.tokens?.refreshToken,
      scopes: result.metadata?.scopes,
      expiresIn: result.tokens?.expiresIn,
    };
  }
}
```

---

## Best Practices

### Token Security

```typescript
// Use strong secrets
const accessTokenSecret = crypto.randomBytes(64).toString("hex");
const refreshTokenSecret = crypto.randomBytes(64).toString("hex");

// Short-lived access tokens
accessTokenExpiry: "15m";

// Longer-lived refresh tokens
refreshTokenExpiry: "7d";

// Store secrets securely
// Never commit secrets to version control
```

---

### Error Handling

```typescript
try {
  const result = await authManager.authenticate(context);
  if (!result.success) {
    // Handle authentication failure
    logger.warn("Authentication failed", {
      error: result.error,
      metadata: result.metadata,
    });
  }
} catch (error) {
  if (error instanceof TokenExpiredError) {
    // Prompt for token refresh
  } else if (error instanceof InvalidTokenError) {
    // Prompt for re-authentication
  } else {
    // Handle other errors
  }
}
```

---

### Role-Based Access Control

```typescript
export const requireRole = (requiredRole: string) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;

    if (!user || !user.roles.includes(requiredRole)) {
      throw new ForbiddenError(`Requires ${requiredRole} role`);
    }
  };
};

// Usage
@Get('/admin/users')
@UseMiddleware(authMiddleware, requireRole('admin'))
getAdminUsers() {
  // Only accessible to admins
}
```

---

## See Also

- [Auth Module Overview](../modules/auth/overview.md)
- [JWT Strategy Guide](../modules/auth/jwt-strategy.md)
- [API Key Strategy Guide](../modules/auth/api-key-strategy.md)
- [Custom Strategies Guide](../modules/auth/custom-strategies.md)
