# BootifyJS Authentication System

A comprehensive, multi-strategy authentication framework for Node.js applications built with TypeScript and Fastify.

## Features

- **Multi-Strategy Support**: JWT, API Key, and extensible for custom strategies
- **Token Management**: Access tokens, refresh tokens, and automatic rotation
- **Session Management**: Redis-based token storage with TTL support
- **Middleware Integration**: Easy-to-use Fastify middleware
- **Type Safety**: Full TypeScript support with comprehensive type definitions
- **Scalable Architecture**: Strategy pattern for easy extension
- **Security Best Practices**: Secure token generation, validation, and revocation

## Quick Start

### Installation

```bash
npm install @bootifyjs/auth
# or
yarn add @bootifyjs/auth
```

### Basic JWT Setup

```typescript
import Fastify from 'fastify';
import { setupJwtAuth } from '@bootifyjs/auth/examples/basic-usage';

const app = Fastify({ logger: true });

// Setup JWT authentication
setupJwtAuth(app);

app.listen({ port: 3000 });
```

### Multi-Strategy Setup (JWT + API Key)

```typescript
import Fastify from 'fastify';
import { setupMultiAuth } from '@bootifyjs/auth/examples/basic-usage';

const app = Fastify({ logger: true });

// Setup JWT + API Key authentication
setupMultiAuth(app);

app.listen({ port: 3000 });
```

## Core Components

### AuthManager

The central orchestrator for authentication strategies.

```typescript
import { AuthManager, JwtStrategy, RedisTokenStorage } from '@bootifyjs/auth';

const authManager = new AuthManager({
  defaultStrategy: 'jwt',
  tokenStorage: new RedisTokenStorage({ /* config */ })
});

// Register strategies
const jwtStrategy = new JwtStrategy();
await authManager.registerStrategy(jwtStrategy, {
  strategy: 'jwt',
  options: {
    accessTokenSecret: 'your-secret',
    refreshTokenSecret: 'your-refresh-secret',
    // ... other options
  }
});
```

### Authentication Strategies

#### JWT Strategy

Provides JWT-based authentication with refresh token support.

```typescript
import { JwtStrategy } from '@bootifyjs/auth';

const jwtStrategy = new JwtStrategy();
await authManager.registerStrategy(jwtStrategy, {
  strategy: 'jwt',
  options: {
    accessTokenSecret: 'your-access-secret',
    refreshTokenSecret: 'your-refresh-secret',
    accessTokenExpiry: '15m',
    refreshTokenExpiry: '7d',
    userProvider: async (userId) => {
      // Return user data from your database
      return await getUserById(userId);
    },
    credentialValidator: async (credentials) => {
      // Validate user credentials
      return await validateCredentials(credentials);
    }
  }
});
```

#### API Key Strategy

Provides API key-based authentication with scoped permissions.

```typescript
import { ApiKeyStrategy } from '@bootifyjs/auth';

const apiKeyStrategy = new ApiKeyStrategy();
await authManager.registerStrategy(apiKeyStrategy, {
  strategy: 'api-key',
  options: {
    tokenStorage: redisStorage,
    keyPrefix: 'ak_',
    defaultScopes: ['api:read'],
    maxKeysPerUser: 10,
    userProvider: async (userId) => {
      return await getUserById(userId);
    }
  }
});
```

### Token Storage

#### Redis Token Storage

Redis-based implementation for scalable token storage.

```typescript
import { RedisTokenStorage } from '@bootifyjs/auth';
import Redis from 'ioredis';

const redisClient = new Redis({
  host: 'localhost',
  port: 6379
});

const tokenStorage = new RedisTokenStorage({
  client: redisClient,
  keyPrefix: 'auth:',
  defaultTTL: 3600 // 1 hour
});
```

### Middleware

Fastify middleware for route protection.

```typescript
import { AuthMiddleware } from '@bootifyjs/auth';

const middleware = new AuthMiddleware(authManager);

// Protect routes
app.get('/protected', {
  preHandler: middleware.authenticate({ strategies: ['jwt', 'api-key'] })
}, async (request, reply) => {
  // Access authenticated user via request.user
  reply.send({ user: request.user });
});
```

## API Reference

### AuthManager Methods

- `registerStrategy(strategy, config)` - Register an authentication strategy
- `authenticate(context, strategyName?)` - Authenticate using a strategy
- `validate(token, context, strategyName?)` - Validate a token
- `refresh(refreshToken, context, strategyName?)` - Refresh an access token
- `revoke(token, context, strategyName?)` - Revoke a token

### AuthContext Types

```typescript
interface AuthContext {
  type: 'login' | 'validate' | 'refresh' | 'revoke' | 'generate';
  credentials?: any;
  token?: string;
  userId?: string;
  metadata?: any;
}
```

### AuthResult

```typescript
interface AuthResult {
  success: boolean;
  user?: User;
  tokens?: TokenPair;
  error?: string;
  metadata?: any;
}
```

### TokenPair

```typescript
interface TokenPair {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
}
```

## Authentication Flow Examples

### JWT Login Flow

1. **Login Request**
   ```bash
   POST /auth/login
   {
     "email": "user@example.com",
     "password": "password123"
   }
   ```

2. **Response**
   ```json
   {
     "success": true,
     "user": {
       "id": "user-123",
       "email": "user@example.com",
       "roles": ["user"]
     },
     "tokens": {
       "accessToken": "eyJhbGciOiJIUzI1NiIs...",
       "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
       "expiresIn": 900
     }
   }
   ```

3. **Protected Request**
   ```bash
   GET /protected
   Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
   ```

### API Key Generation Flow

1. **Generate API Key** (requires JWT authentication)
   ```bash
   POST /auth/api-keys
   Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
   {
     "name": "My API Key",
     "scopes": ["api:read", "api:write"]
   }
   ```

2. **Response**
   ```json
   {
     "success": true,
     "apiKey": "ak_1234567890abcdef",
     "name": "My API Key",
     "scopes": ["api:read", "api:write"]
   }
   ```

3. **API Request**
   ```bash
   GET /api/data
   Authorization: Bearer ak_1234567890abcdef
   ```

## Configuration Options

### JWT Strategy Options

```typescript
interface JwtStrategyConfig {
  accessTokenSecret: string;
  refreshTokenSecret: string;
  accessTokenExpiry?: string | number; // Default: '15m'
  refreshTokenExpiry?: string | number; // Default: '7d'
  issuer?: string;
  audience?: string;
  tokenStorage?: TokenStorage;
  userProvider: (userId: string) => Promise<User>;
  credentialValidator?: (credentials: any) => Promise<User>;
}
```

### API Key Strategy Options

```typescript
interface ApiKeyStrategyConfig {
  tokenStorage: TokenStorage;
  keyPrefix?: string; // Default: 'ak_'
  keyLength?: number; // Default: 32
  defaultScopes?: string[];
  maxKeysPerUser?: number;
  userProvider: (userId: string) => Promise<User>;
}
```

### Redis Storage Options

```typescript
interface RedisTokenStorageConfig {
  client: RedisClient;
  keyPrefix?: string; // Default: 'auth:'
  defaultTTL?: number; // Default TTL in seconds
  serializer?: {
    serialize: (value: any) => string;
    deserialize: (value: string) => any;
  };
}
```

## Error Handling

The authentication system provides specific error types:

- `AuthError` - Base authentication error
- `InvalidTokenError` - Token validation failed
- `UnauthorizedError` - Access denied
- `TokenExpiredError` - Token has expired

```typescript
try {
  const result = await authManager.authenticate(context);
} catch (error) {
  if (error instanceof InvalidTokenError) {
    // Handle invalid token
  } else if (error instanceof UnauthorizedError) {
    // Handle unauthorized access
  }
}
```

## Security Considerations

1. **Secret Management**: Store secrets in environment variables
2. **Token Expiry**: Use short-lived access tokens with refresh tokens
3. **HTTPS Only**: Always use HTTPS in production
4. **Rate Limiting**: Implement rate limiting for authentication endpoints
5. **Token Rotation**: Implement automatic token rotation
6. **Scope Validation**: Validate API key scopes for each request

## Testing

The framework includes comprehensive test utilities:

```typescript
import { MockRedisClient } from '@bootifyjs/auth/testing';

// Use mock Redis client for testing
const mockClient = new MockRedisClient();
const tokenStorage = new RedisTokenStorage({ client: mockClient });
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details.