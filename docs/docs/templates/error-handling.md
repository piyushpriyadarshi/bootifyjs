---
id: error-handling
title: Error Handling Template
sidebar_label: Error Handling
description: Comprehensive error handling patterns and strategies
keywords: [bootifyjs, error handling, exceptions, middleware, template]
---

# Error Handling Template

This template demonstrates comprehensive error handling strategies in BootifyJS applications, including custom errors, global error handlers, and best practices.

## Custom Error Classes

Define custom error types for different scenarios:

```typescript title="src/errors/custom-errors.ts"
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(400, message, "VALIDATION_ERROR", details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id
      ? `${resource} with id ${id} not found`
      : `${resource} not found`;
    super(404, message, "NOT_FOUND");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized") {
    super(401, message, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = "Forbidden") {
    super(403, message, "FORBIDDEN");
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: any) {
    super(409, message, "CONFLICT", details);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, details?: any) {
    super(400, message, "BAD_REQUEST", details);
  }
}

export class InternalServerError extends AppError {
  constructor(message: string = "Internal server error", details?: any) {
    super(500, message, "INTERNAL_ERROR", details);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(service: string) {
    super(503, `${service} is currently unavailable`, "SERVICE_UNAVAILABLE");
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfter?: number) {
    super(429, "Too many requests", "RATE_LIMIT_EXCEEDED", { retryAfter });
  }
}
```

## Global Error Handler Middleware

Create a centralized error handler:

```typescript title="src/middleware/error-handler.middleware.ts"
import { FastifyRequest, FastifyReply } from "fastify";
import { AppError } from "../errors/custom-errors";
import { Logger } from "bootifyjs/logging";

export class ErrorHandlerMiddleware {
  constructor(private logger: Logger) {}

  async handle(error: Error, request: FastifyRequest, reply: FastifyReply) {
    // Log the error
    this.logger.error("Error occurred", {
      error: error.message,
      stack: error.stack,
      path: request.url,
      method: request.method,
      body: request.body,
      query: request.query,
      params: request.params,
    });

    // Handle known application errors
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
        timestamp: new Date().toISOString(),
        path: request.url,
      });
    }

    // Handle validation errors from Zod
    if (error.name === "ZodError") {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          details: (error as any).errors,
        },
        timestamp: new Date().toISOString(),
        path: request.url,
      });
    }

    // Handle unknown errors
    const isDevelopment = process.env.NODE_ENV === "development";
    return reply.status(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: isDevelopment ? error.message : "An unexpected error occurred",
        ...(isDevelopment && { stack: error.stack }),
      },
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
```

## Service Layer Error Handling

Implement error handling in services:

```typescript title="src/services/user.service.ts"
import { Injectable } from "bootifyjs";
import { UserRepository } from "../repositories/user.repository";
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  InternalServerError,
} from "../errors/custom-errors";
import { Logger } from "bootifyjs/logging";

@Injectable()
export class UserService {
  constructor(private userRepository: UserRepository, private logger: Logger) {}

  async getUserById(id: string) {
    try {
      const user = await this.userRepository.findById(id);

      if (!user) {
        throw new NotFoundError("User", id);
      }

      return user;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      this.logger.error("Failed to get user", { id, error });
      throw new InternalServerError("Failed to retrieve user");
    }
  }

  async createUser(data: any) {
    try {
      // Validate email format
      if (!this.isValidEmail(data.email)) {
        throw new ValidationError("Invalid email format", {
          field: "email",
          value: data.email,
        });
      }

      // Check if user already exists
      const existing = await this.userRepository.findByEmail(data.email);
      if (existing) {
        throw new ConflictError("User with this email already exists", {
          email: data.email,
        });
      }

      return await this.userRepository.create(data);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      this.logger.error("Failed to create user", { data, error });
      throw new InternalServerError("Failed to create user");
    }
  }

  async updateUser(id: string, data: any) {
    try {
      const user = await this.getUserById(id);

      // Check email uniqueness if email is being updated
      if (data.email && data.email !== user.email) {
        const existing = await this.userRepository.findByEmail(data.email);
        if (existing) {
          throw new ConflictError("Email already in use", {
            email: data.email,
          });
        }
      }

      const updated = await this.userRepository.update(id, data);
      if (!updated) {
        throw new InternalServerError("Failed to update user");
      }

      return updated;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      this.logger.error("Failed to update user", { id, data, error });
      throw new InternalServerError("Failed to update user");
    }
  }

  async deleteUser(id: string) {
    try {
      await this.getUserById(id); // Verify user exists

      const deleted = await this.userRepository.delete(id);
      if (!deleted) {
        throw new InternalServerError("Failed to delete user");
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      this.logger.error("Failed to delete user", { id, error });
      throw new InternalServerError("Failed to delete user");
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}
```

## Controller Error Handling

Handle errors in controllers:

```typescript title="src/controllers/user.controller.ts"
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Validate,
} from "bootifyjs";
import { z } from "zod";
import { UserService } from "../services/user.service";
import { AppError } from "../errors/custom-errors";

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  password: z.string().min(8),
});

const UpdateUserSchema = CreateUserSchema.partial();

@Controller("/api/users")
export class UserController {
  constructor(private userService: UserService) {}

  @Get("/:id")
  async getUser(@Param("id") id: string) {
    // Errors thrown by service will be caught by global error handler
    return this.userService.getUserById(id);
  }

  @Post("/")
  @Validate(CreateUserSchema)
  async createUser(@Body() data: any) {
    const user = await this.userService.createUser(data);
    return {
      statusCode: 201,
      data: user,
      message: "User created successfully",
    };
  }

  @Put("/:id")
  @Validate(UpdateUserSchema)
  async updateUser(@Param("id") id: string, @Body() data: any) {
    const user = await this.userService.updateUser(id, data);
    return {
      data: user,
      message: "User updated successfully",
    };
  }

  @Delete("/:id")
  async deleteUser(@Param("id") id: string) {
    await this.userService.deleteUser(id);
    return {
      message: "User deleted successfully",
    };
  }
}
```

## Async Error Wrapper

Utility to wrap async functions and handle errors:

```typescript title="src/utils/async-handler.ts"
import { FastifyRequest, FastifyReply } from "fastify";

export const asyncHandler = (
  fn: (request: FastifyRequest, reply: FastifyReply) => Promise<any>
) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return await fn(request, reply);
    } catch (error) {
      // Error will be caught by global error handler
      throw error;
    }
  };
};

// Usage in controller
export class ProductController {
  @Get("/:id")
  getProduct = asyncHandler(async (request, reply) => {
    const { id } = request.params as any;
    const product = await this.productService.getById(id);
    return product;
  });
}
```

## Retry Logic for Transient Errors

Implement retry logic for operations that might fail temporarily:

```typescript title="src/utils/retry.ts"
export interface RetryOptions {
  maxAttempts: number;
  delayMs: number;
  backoff?: "linear" | "exponential";
  onRetry?: (attempt: number, error: Error) => void;
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { maxAttempts, delayMs, backoff = "linear", onRetry } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }

      if (onRetry) {
        onRetry(attempt, error as Error);
      }

      // Calculate delay
      const delay =
        backoff === "exponential"
          ? delayMs * Math.pow(2, attempt - 1)
          : delayMs * attempt;

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("Retry failed");
}

// Usage
async function fetchDataWithRetry() {
  return retry(() => externalApiCall(), {
    maxAttempts: 3,
    delayMs: 1000,
    backoff: "exponential",
    onRetry: (attempt, error) => {
      console.log(`Retry attempt ${attempt} after error: ${error.message}`);
    },
  });
}
```

## Circuit Breaker Pattern

Prevent cascading failures:

```typescript title="src/utils/circuit-breaker.ts"
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime?: number;
  private state: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";

  constructor(
    private threshold: number = 5,
    private timeout: number = 60000, // 1 minute
    private resetTimeout: number = 30000 // 30 seconds
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (Date.now() - (this.lastFailureTime || 0) > this.resetTimeout) {
        this.state = "HALF_OPEN";
      } else {
        throw new ServiceUnavailableError("Circuit breaker is OPEN");
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = "CLOSED";
  }

  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.threshold) {
      this.state = "OPEN";
    }
  }

  getState() {
    return this.state;
  }
}

// Usage
const externalServiceBreaker = new CircuitBreaker(5, 60000, 30000);

async function callExternalService() {
  return externalServiceBreaker.execute(async () => {
    // External service call
    return await fetch("https://api.example.com/data");
  });
}
```

## Error Monitoring and Reporting

Integrate with error tracking services:

```typescript title="src/services/error-reporter.service.ts"
import { Injectable } from "bootifyjs";
import { Logger } from "bootifyjs/logging";

@Injectable()
export class ErrorReporterService {
  constructor(private logger: Logger) {}

  reportError(error: Error, context?: any) {
    // Log locally
    this.logger.error("Error reported", {
      error: error.message,
      stack: error.stack,
      context,
    });

    // Send to error tracking service (Sentry, Rollbar, etc.)
    if (process.env.NODE_ENV === "production") {
      this.sendToErrorTracker(error, context);
    }
  }

  private sendToErrorTracker(error: Error, context?: any) {
    // Integration with error tracking service
    // Example: Sentry.captureException(error, { extra: context });
  }
}
```

## Graceful Degradation

Handle errors gracefully with fallback values:

```typescript title="src/services/recommendation.service.ts"
import { Injectable } from "bootifyjs";
import { Logger } from "bootifyjs/logging";

@Injectable()
export class RecommendationService {
  constructor(private logger: Logger) {}

  async getRecommendations(userId: string) {
    try {
      // Try to get personalized recommendations
      return await this.getPersonalizedRecommendations(userId);
    } catch (error) {
      this.logger.warn(
        "Failed to get personalized recommendations, using fallback",
        {
          userId,
          error,
        }
      );

      // Fallback to popular items
      try {
        return await this.getPopularItems();
      } catch (fallbackError) {
        this.logger.error("Fallback also failed", { fallbackError });

        // Return empty array as last resort
        return [];
      }
    }
  }

  private async getPersonalizedRecommendations(userId: string) {
    // Complex recommendation logic that might fail
    throw new Error("Recommendation service unavailable");
  }

  private async getPopularItems() {
    // Simpler fallback logic
    return [{ id: "1", name: "Popular Item" }];
  }
}
```

## Best Practices

- **Use Custom Errors**: Create specific error types for different scenarios
- **Centralized Handling**: Use global error handler middleware
- **Logging**: Always log errors with context
- **User-Friendly Messages**: Don't expose internal errors to users
- **Error Codes**: Use consistent error codes for client handling
- **Validation**: Validate input early to prevent errors
- **Graceful Degradation**: Provide fallbacks when possible
- **Monitoring**: Track errors in production
- **Circuit Breakers**: Prevent cascading failures
- **Retry Logic**: Handle transient failures

## Next Steps

- Integrate with Sentry or Rollbar
- Add error rate monitoring
- Implement distributed tracing
- Add error budgets and SLOs
- Create error dashboards
- Set up alerting for critical errors

:::warning
Never expose sensitive information (stack traces, internal paths, database details) in production error responses.
:::

:::tip
Use different error handling strategies based on the environment. Be verbose in development but secure in production.
:::
