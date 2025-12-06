# Swagger Decorator

The `@Swagger` decorator allows you to add OpenAPI/Swagger documentation metadata to your controller routes.

## Usage

```typescript
import { Controller, Get, Post, Schema, Swagger } from "bootify/core";
import { z } from "zod";

@Controller("/api/users")
export class UserController {
  @Get("/")
  @Swagger({
    summary: "Get all users",
    description: "Retrieves a list of all users in the system",
    tags: ["Users"],
  })
  getAllUsers() {
    return [{ id: 1, name: "John" }];
  }

  @Get("/:id")
  @Swagger({
    summary: "Get user by ID",
    description: "Retrieves a single user by their unique identifier",
    tags: ["Users"],
    operationId: "getUserById",
  })
  getUserById(@Param("id") id: string) {
    return { id, name: "John" };
  }

  @Post("/")
  @Schema({
    body: z.object({
      name: z.string(),
      email: z.string().email(),
    }),
    responses: {
      201: z.object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
      }),
    },
  })
  @Swagger({
    summary: "Create a new user",
    description: "Creates a new user with the provided information",
    tags: ["Users"],
    operationId: "createUser",
  })
  createUser(@Body() body: any) {
    return { id: "123", ...body };
  }
}
```

## Options

The `@Swagger` decorator accepts the following options:

- **summary** (string): A short summary of what the operation does
- **description** (string): A detailed description of the operation
- **tags** (string[]): Tags for grouping operations in the Swagger UI
- **deprecated** (boolean): Mark the operation as deprecated
- **operationId** (string): Unique identifier for the operation
- **security** (Array<Record<string, string[]>>): Security requirements for the operation

## How It Works

1. The `@Swagger` decorator stores metadata on the controller method
2. When routes are registered, the router reads this metadata
3. The metadata is merged with the schema from `@Schema` decorator
4. Fastify's `@fastify/swagger` plugin reads the combined schema and generates OpenAPI docs
5. The docs are available at `/api-docs` (if `enableSwagger: true` in app options)

## Combining with @Schema

The `@Swagger` decorator works alongside the `@Schema` decorator:

- `@Schema` - Defines validation rules and generates JSON Schema for request/response
- `@Swagger` - Adds documentation metadata (summary, description, tags, etc.)

Both decorators complement each other to create complete API documentation.

## Example Output

When you visit `/api-docs`, you'll see:

- Routes grouped by tags
- Summaries and descriptions for each endpoint
- Request/response schemas from `@Schema`
- All the metadata you provided in `@Swagger`
