---
id: middleware
title: Middleware Template
sidebar_label: Middleware
description: Custom middleware patterns and examples
keywords: [bootifyjs, middleware, request, response, template]
---

# Middleware Template

This template demonstrates how to create and use custom middleware in BootifyJS applications for cross-cutting concerns like logging, authentication, rate limiting, and more.

## Basic Middleware Structure

```typescript title="src/middleware/example.middleware.ts"
import { FastifyRequest, FastifyReply } from "fastify";

export class ExampleMiddleware {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    // Pre-processing logic
    console.log("Before request processing");

    // Modify request or reply
    (request as any).customProperty = "value";

    // Continue to next middleware or route handler
    // (BootifyJS handles this automatically)
  }
}
```

## Request Logging Middleware

Log all incoming requests:

```typescript title="src/middleware/request-logger.middleware.ts"
import { FastifyRequest, FastifyReply } from "fastify";
import { Logger } from "bootifyjs/logging";

export class RequestLoggerMiddleware {
  constructor(private logger: Logger) {}

  async handle(request: FastifyRequest, reply: FastifyReply) {
    const startTime = Date.now();

    // Log request
    this.logger.info("Incoming request", {
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers["user-agent"],
    });

    // Hook into response to log completion
    reply.addHook("onSend", async (request, reply, payload) => {
      const duration = Date.now() - startTime;

      this.logger.info("Request completed", {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        duration: `${duration}ms`,
      });

      return payload;
    });
  }
}
```

## Authentication Middleware

Verify user authentication:

```typescript title="src/middleware/auth.middleware.ts"
import { FastifyRequest, FastifyReply } from "fastify";
import { AuthService } from "../services/auth.service";

export class AuthMiddleware {
  constructor(private authService: AuthService) {}

  async handle(request: FastifyRequest, reply: FastifyReply) {
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
      const user = await this.authService.verifyToken(token);

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

## Authorization Middleware

Check user permissions:

```typescript title="src/middleware/authorization.middleware.ts"
import { FastifyRequest, FastifyReply } from "fastify";

export class AuthorizationMiddleware {
  constructor(private requiredRoles: string[]) {}

  async handle(request: FastifyRequest, reply: FastifyReply) {
    const user = (request as any).user;

    if (!user) {
      return reply.status(401).send({
        error: "Unauthorized",
        message: "Authentication required",
      });
    }

    // Check if user has required role
    const hasRole = this.requiredRoles.some((role) =>
      user.roles?.includes(role)
    );

    if (!hasRole) {
      return reply.status(403).send({
        error: "Forbidden",
        message: "Insufficient permissions",
      });
    }
  }
}

// Factory function for role-based middleware
export function requireRoles(...roles: string[]) {
  return new AuthorizationMiddleware(roles);
}
```

## Rate Limiting Middleware

Prevent abuse with rate limiting:

```typescript title="src/middleware/rate-limit.middleware.ts"
import { FastifyRequest, FastifyReply } from "fastify";

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export class RateLimitMiddleware {
  private requests: Map<string, number[]> = new Map();

  constructor(private config: RateLimitConfig) {
    // Clean up old entries periodically
    setInterval(() => this.cleanup(), this.config.windowMs);
  }

  async handle(request: FastifyRequest, reply: FastifyReply) {
    const identifier = this.getIdentifier(request);
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Get recent requests for this identifier
    let timestamps = this.requests.get(identifier) || [];

    // Filter out old requests
    timestamps = timestamps.filter((ts) => ts > windowStart);

    // Check if limit exceeded
    if (timestamps.length >= this.config.maxRequests) {
      const oldestRequest = timestamps[0];
      const retryAfter = Math.ceil(
        (oldestRequest + this.config.windowMs - now) / 1000
      );

      return reply.status(429).send({
        error: "Too Many Requests",
        message: "Rate limit exceeded",
        retryAfter,
      });
    }

    // Add current request
    timestamps.push(now);
    this.requests.set(identifier, timestamps);

    // Add rate limit headers
    reply.header("X-RateLimit-Limit", this.config.maxRequests);
    reply.header(
      "X-RateLimit-Remaining",
      this.config.maxRequests - timestamps.length
    );
    reply.header(
      "X-RateLimit-Reset",
      new Date(windowStart + this.config.windowMs).toISOString()
    );
  }

  private getIdentifier(request: FastifyRequest): string {
    // Use user ID if authenticated, otherwise use IP
    const user = (request as any).user;
    return user?.id || request.ip;
  }

  private cleanup() {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    for (const [identifier, timestamps] of this.requests.entries()) {
      const filtered = timestamps.filter((ts) => ts > windowStart);

      if (filtered.length === 0) {
        this.requests.delete(identifier);
      } else {
        this.requests.set(identifier, filtered);
      }
    }
  }
}
```

## CORS Middleware

Handle Cross-Origin Resource Sharing:

```typescript title="src/middleware/cors.middleware.ts"
import { FastifyRequest, FastifyReply } from "fastify";

interface CorsConfig {
  origin: string | string[] | "*";
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

export class CorsMiddleware {
  constructor(private config: CorsConfig) {}

  async handle(request: FastifyRequest, reply: FastifyReply) {
    const origin = request.headers.origin;

    // Check if origin is allowed
    if (this.isOriginAllowed(origin)) {
      reply.header("Access-Control-Allow-Origin", origin || "*");
    }

    // Handle preflight requests
    if (request.method === "OPTIONS") {
      reply.header(
        "Access-Control-Allow-Methods",
        (this.config.methods || ["GET", "POST", "PUT", "DELETE", "PATCH"]).join(
          ", "
        )
      );

      reply.header(
        "Access-Control-Allow-Headers",
        (this.config.allowedHeaders || ["Content-Type", "Authorization"]).join(
          ", "
        )
      );

      if (this.config.exposedHeaders) {
        reply.header(
          "Access-Control-Expose-Headers",
          this.config.exposedHeaders.join(", ")
        );
      }

      if (this.config.credentials) {
        reply.header("Access-Control-Allow-Credentials", "true");
      }

      if (this.config.maxAge) {
        reply.header("Access-Control-Max-Age", this.config.maxAge.toString());
      }

      return reply.status(204).send();
    }

    // For actual requests
    if (this.config.credentials) {
      reply.header("Access-Control-Allow-Credentials", "true");
    }

    if (this.config.exposedHeaders) {
      reply.header(
        "Access-Control-Expose-Headers",
        this.config.exposedHeaders.join(", ")
      );
    }
  }

  private isOriginAllowed(origin?: string): boolean {
    if (!origin) return false;
    if (this.config.origin === "*") return true;
    if (typeof this.config.origin === "string") {
      return origin === this.config.origin;
    }
    return this.config.origin.includes(origin);
  }
}
```

## Request Validation Middleware

Validate request size and content type:

```typescript title="src/middleware/request-validation.middleware.ts"
import { FastifyRequest, FastifyReply } from "fastify";

interface ValidationConfig {
  maxBodySize?: number;
  allowedContentTypes?: string[];
}

export class RequestValidationMiddleware {
  constructor(private config: ValidationConfig) {}

  async handle(request: FastifyRequest, reply: FastifyReply) {
    // Check content type for POST/PUT/PATCH requests
    if (["POST", "PUT", "PATCH"].includes(request.method)) {
      const contentType = request.headers["content-type"];

      if (this.config.allowedContentTypes && contentType) {
        const isAllowed = this.config.allowedContentTypes.some((type) =>
          contentType.includes(type)
        );

        if (!isAllowed) {
          return reply.status(415).send({
            error: "Unsupported Media Type",
            message: `Content-Type must be one of: ${this.config.allowedContentTypes.join(
              ", "
            )}`,
          });
        }
      }
    }

    // Check body size
    if (this.config.maxBodySize) {
      const contentLength = parseInt(request.headers["content-length"] || "0");

      if (contentLength > this.config.maxBodySize) {
        return reply.status(413).send({
          error: "Payload Too Large",
          message: `Request body exceeds maximum size of ${this.config.maxBodySize} bytes`,
        });
      }
    }
  }
}
```

## Request ID Middleware

Add unique ID to each request:

```typescript title="src/middleware/request-id.middleware.ts"
import { FastifyRequest, FastifyReply } from "fastify";
import { v4 as uuidv4 } from "uuid";

export class RequestIdMiddleware {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    // Generate or use existing request ID
    const requestId = (request.headers["x-request-id"] as string) || uuidv4();

    // Attach to request
    (request as any).requestId = requestId;

    // Add to response headers
    reply.header("X-Request-ID", requestId);
  }
}
```

## Compression Middleware

Compress responses:

```typescript title="src/middleware/compression.middleware.ts"
import { FastifyRequest, FastifyReply } from "fastify";
import * as zlib from "zlib";

export class CompressionMiddleware {
  private minSize = 1024; // Only compress responses larger than 1KB

  async handle(request: FastifyRequest, reply: FastifyReply) {
    const acceptEncoding = request.headers["accept-encoding"] || "";

    reply.addHook("onSend", async (request, reply, payload) => {
      // Skip if already compressed or too small
      if (
        reply.hasHeader("content-encoding") ||
        !payload ||
        (typeof payload === "string" && payload.length < this.minSize)
      ) {
        return payload;
      }

      // Compress with gzip if supported
      if (acceptEncoding.includes("gzip")) {
        reply.header("Content-Encoding", "gzip");
        return zlib.gzipSync(payload);
      }

      // Compress with deflate if supported
      if (acceptEncoding.includes("deflate")) {
        reply.header("Content-Encoding", "deflate");
        return zlib.deflateSync(payload);
      }

      return payload;
    });
  }
}
```

## Security Headers Middleware

Add security headers:

```typescript title="src/middleware/security-headers.middleware.ts"
import { FastifyRequest, FastifyReply } from "fastify";

export class SecurityHeadersMiddleware {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    // Prevent clickjacking
    reply.header("X-Frame-Options", "DENY");

    // Prevent MIME type sniffing
    reply.header("X-Content-Type-Options", "nosniff");

    // Enable XSS protection
    reply.header("X-XSS-Protection", "1; mode=block");

    // Strict Transport Security (HTTPS only)
    if (request.protocol === "https") {
      reply.header(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains"
      );
    }

    // Content Security Policy
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
    );

    // Referrer Policy
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");

    // Permissions Policy
    reply.header(
      "Permissions-Policy",
      "geolocation=(), microphone=(), camera=()"
    );
  }
}
```

## Middleware Composition

Combine multiple middleware:

```typescript title="src/middleware/middleware-chain.ts"
import { FastifyRequest, FastifyReply } from "fastify";

export class MiddlewareChain {
  constructor(private middlewares: any[]) {}

  async handle(request: FastifyRequest, reply: FastifyReply) {
    for (const middleware of this.middlewares) {
      await middleware.handle(request, reply);

      // Stop if response was sent
      if (reply.sent) {
        break;
      }
    }
  }
}

// Usage
const apiMiddleware = new MiddlewareChain([
  new RequestIdMiddleware(),
  new RequestLoggerMiddleware(logger),
  new CorsMiddleware({ origin: "*" }),
  new SecurityHeadersMiddleware(),
  new AuthMiddleware(authService),
]);
```

## Conditional Middleware

Apply middleware based on conditions:

```typescript title="src/middleware/conditional.middleware.ts"
import { FastifyRequest, FastifyReply } from "fastify";

export class ConditionalMiddleware {
  constructor(
    private condition: (request: FastifyRequest) => boolean,
    private middleware: any
  ) {}

  async handle(request: FastifyRequest, reply: FastifyReply) {
    if (this.condition(request)) {
      await this.middleware.handle(request, reply);
    }
  }
}

// Usage: Only apply auth to /api routes
const conditionalAuth = new ConditionalMiddleware(
  (request) => request.url.startsWith("/api"),
  new AuthMiddleware(authService)
);
```

## Bootstrap with Middleware

```typescript title="src/index.ts"
import { BootifyApp } from "bootifyjs";
import { RequestLoggerMiddleware } from "./middleware/request-logger.middleware";
import { AuthMiddleware } from "./middleware/auth.middleware";
import { RateLimitMiddleware } from "./middleware/rate-limit.middleware";
import { SecurityHeadersMiddleware } from "./middleware/security-headers.middleware";

const app = new BootifyApp({
  port: 3000,
  controllers: [
    /* controllers */
  ],
  providers: [
    /* providers */
  ],
  globalMiddleware: [
    RequestLoggerMiddleware,
    SecurityHeadersMiddleware,
    new RateLimitMiddleware({ windowMs: 60000, maxRequests: 100 }),
  ],
});

app.start();
```

## Best Practices

- **Order Matters**: Apply middleware in the correct order
- **Early Exit**: Return early if response is sent
- **Error Handling**: Handle errors gracefully
- **Performance**: Keep middleware lightweight
- **Reusability**: Create generic, reusable middleware
- **Configuration**: Make middleware configurable
- **Testing**: Test middleware in isolation
- **Documentation**: Document middleware behavior

## Common Middleware Patterns

1. **Pre-processing**: Modify request before handler
2. **Post-processing**: Modify response after handler
3. **Validation**: Validate requests
4. **Authentication**: Verify identity
5. **Authorization**: Check permissions
6. **Logging**: Track requests and responses
7. **Rate Limiting**: Prevent abuse
8. **Caching**: Cache responses
9. **Compression**: Compress responses
10. **Security**: Add security headers

:::tip
Use middleware for cross-cutting concerns that apply to multiple routes. Keep business logic in services and controllers.
:::
