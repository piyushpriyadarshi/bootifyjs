---
id: core-routing
title: Routing
sidebar_label: Routing
description: Master HTTP routing with decorators in BootifyJS
keywords: [bootifyjs, routing, http methods, routes, rest api, url patterns]
---

# Routing

Routing in BootifyJS is declarative and type-safe, using decorators to define HTTP endpoints. This guide covers all routing features including HTTP methods, route parameters, query strings, and advanced patterns.

## HTTP Method Decorators

BootifyJS provides decorators for all standard HTTP methods:

```typescript
import { Controller, Get, Post, Put, Delete, Patch } from "bootifyjs";

@Controller("/api/products")
export class ProductController {
  @Get("/")
  getAllProducts() {
    return [];
  }

  @Get("/:id")
  getProduct() {}

  @Post("/")
  createProduct() {}

  @Put("/:id")
  updateProduct() {}

  @Patch("/:id")
  partialUpdateProduct() {}

  @Delete("/:id")
  deleteProduct() {}
}
```

### @Get

Handles HTTP GET requests for retrieving resources:

```typescript
@Controller("/api/users")
export class UserController {
  @Get("/")
  getAllUsers() {
    return [{ id: 1, name: "John" }];
  }

  @Get("/:id")
  getUser(@Param("id") id: string) {
    return { id, name: "John" };
  }

  @Get("/:userId/posts")
  getUserPosts(@Param("userId") userId: string) {
    return [];
  }
}
```

### @Post

Handles HTTP POST requests for creating resources:

```typescript
@Controller("/api/users")
export class UserController {
  @Post("/")
  @Schema({
    body: z.object({
      name: z.string(),
      email: z.string().email(),
    }),
  })
  createUser(@Body() userData: CreateUserDto) {
    return { id: 1, ...userData };
  }

  @Post("/:userId/posts")
  createUserPost(
    @Param("userId") userId: string,
    @Body() postData: CreatePostDto
  ) {
    return { id: 1, userId, ...postData };
  }
}
```

### @Put

Handles HTTP PUT requests for full resource updates:

```typescript
@Controller("/api/users")
export class UserController {
  @Put("/:id")
  @Schema({
    params: z.object({
      id: z.string().uuid(),
    }),
    body: z.object({
      name: z.string(),
      email: z.string().email(),
      age: z.number(),
    }),
  })
  updateUser(@Param("id") id: string, @Body() userData: UpdateUserDto) {
    return { id, ...userData };
  }
}
```

### @Patch

Handles HTTP PATCH requests for partial resource updates:

```typescript
@Controller("/api/users")
export class UserController {
  @Patch("/:id")
  @Schema({
    body: z.object({
      name: z.string().optional(),
      email: z.string().email().optional(),
      age: z.number().optional(),
    }),
  })
  partialUpdateUser(@Param("id") id: string, @Body() updates: Partial<User>) {
    return { id, ...updates };
  }
}
```

### @Delete

Handles HTTP DELETE requests for removing resources:

```typescript
@Controller("/api/users")
export class UserController {
  @Delete("/:id")
  deleteUser(@Param("id") id: string) {
    return { message: `User ${id} deleted` };
  }

  @Delete("/:userId/posts/:postId")
  deleteUserPost(
    @Param("userId") userId: string,
    @Param("postId") postId: string
  ) {
    return { message: "Post deleted" };
  }
}
```

## Route Paths

### Simple Paths

```typescript
@Controller("/api")
export class ApiController {
  @Get("/health") // GET /api/health
  checkHealth() {}

  @Get("/version") // GET /api/version
  getVersion() {}
}
```

### Root Path

```typescript
@Controller("/api/users")
export class UserController {
  @Get("/") // GET /api/users/
  getAllUsers() {}

  @Get("") // Also GET /api/users/
  getAllUsersAlt() {}
}
```

### Nested Paths

```typescript
@Controller("/api/organizations")
export class OrganizationController {
  @Get("/:orgId/teams") // GET /api/organizations/:orgId/teams
  getTeams() {}

  @Get("/:orgId/teams/:teamId") // GET /api/organizations/:orgId/teams/:teamId
  getTeam() {}

  @Get("/:orgId/teams/:teamId/members") // GET /api/organizations/:orgId/teams/:teamId/members
  getTeamMembers() {}
}
```

## Route Parameters

Extract dynamic segments from the URL path:

### Single Parameter

```typescript
@Controller("/api/users")
export class UserController {
  @Get("/:id")
  getUser(@Param("id") id: string) {
    return { id, name: "John" };
  }
}

// GET /api/users/123
// id = "123"
```

### Multiple Parameters

```typescript
@Controller("/api/users")
export class UserController {
  @Get("/:userId/posts/:postId")
  getUserPost(
    @Param("userId") userId: string,
    @Param("postId") postId: string
  ) {
    return { userId, postId };
  }
}

// GET /api/users/123/posts/456
// userId = "123", postId = "456"
```

### Parameter Validation

Use Zod schemas to validate route parameters:

```typescript
@Controller("/api/users")
export class UserController {
  @Get("/:id")
  @Schema({
    params: z.object({
      id: z.string().uuid(),
    }),
  })
  getUser(@Param("id") id: string) {
    return { id };
  }

  @Get("/:userId/posts/:postId")
  @Schema({
    params: z.object({
      userId: z.string().regex(/^\d+$/),
      postId: z.string().regex(/^\d+$/),
    }),
  })
  getUserPost(
    @Param("userId") userId: string,
    @Param("postId") postId: string
  ) {
    return { userId, postId };
  }
}
```

## Query Parameters

Extract data from the URL query string:

### Single Query Parameter

```typescript
@Controller("/api/products")
export class ProductController {
  @Get("/")
  getProducts(@Query("category") category: string) {
    return { category };
  }
}

// GET /api/products?category=electronics
// category = "electronics"
```

### Multiple Query Parameters

```typescript
@Controller("/api/products")
export class ProductController {
  @Get("/")
  getProducts(
    @Query("category") category: string,
    @Query("page") page: string,
    @Query("limit") limit: string,
    @Query("sort") sort: string
  ) {
    return {
      category: category || "all",
      page: parseInt(page || "1"),
      limit: parseInt(limit || "10"),
      sort: sort || "createdAt",
    };
  }
}

// GET /api/products?category=electronics&page=2&limit=20&sort=price
```

### Query Parameter Validation

Use Zod schemas to validate and transform query parameters:

```typescript
@Controller("/api/products")
export class ProductController {
  @Get("/")
  @Schema({
    query: z.object({
      category: z.string().optional(),
      page: z
        .string()
        .transform((val) => parseInt(val))
        .default("1"),
      limit: z
        .string()
        .transform((val) => parseInt(val))
        .default("10"),
      sort: z.enum(["price", "name", "createdAt"]).default("createdAt"),
      inStock: z
        .string()
        .transform((val) => val === "true")
        .optional(),
    }),
  })
  getProducts(
    @Query("category") category: string,
    @Query("page") page: number,
    @Query("limit") limit: number,
    @Query("sort") sort: string,
    @Query("inStock") inStock: boolean
  ) {
    // All parameters are validated and transformed
    return { category, page, limit, sort, inStock };
  }
}
```

## Request Body

Extract data from the request body:

### Simple Body

```typescript
@Controller("/api/users")
export class UserController {
  @Post("/")
  createUser(@Body() userData: any) {
    return userData;
  }
}
```

### Validated Body

```typescript
@Controller("/api/users")
export class UserController {
  @Post("/")
  @Schema({
    body: z.object({
      name: z.string().min(2).max(50),
      email: z.string().email(),
      age: z.number().min(18).max(120),
      role: z.enum(["user", "admin"]).default("user"),
    }),
  })
  createUser(@Body() userData: CreateUserDto) {
    // userData is validated and typed
    return userData;
  }
}
```

## Combining Parameters

Routes can use parameters, query strings, and body together:

```typescript
@Controller("/api/organizations")
export class OrganizationController {
  @Post("/:orgId/users")
  @Schema({
    params: z.object({
      orgId: z.string().uuid(),
    }),
    query: z.object({
      sendEmail: z
        .string()
        .transform((val) => val === "true")
        .optional(),
    }),
    body: z.object({
      name: z.string(),
      email: z.string().email(),
      role: z.enum(["member", "admin"]),
    }),
  })
  addUserToOrganization(
    @Param("orgId") orgId: string,
    @Query("sendEmail") sendEmail: boolean,
    @Body() userData: AddUserDto
  ) {
    return { orgId, sendEmail, userData };
  }
}

// POST /api/organizations/123e4567-e89b-12d3-a456-426614174000/users?sendEmail=true
// Body: { "name": "John", "email": "john@example.com", "role": "member" }
```

## Route Patterns

### RESTful Routes

Standard REST API pattern:

```typescript
@Controller("/api/products")
export class ProductController {
  @Get("/")
  list() {} // GET /api/products - List all

  @Get("/:id")
  get(@Param("id") id: string) {} // GET /api/products/:id - Get one

  @Post("/")
  create(@Body() data: any) {} // POST /api/products - Create

  @Put("/:id")
  update(@Param("id") id: string, @Body() data: any) {} // PUT /api/products/:id - Update

  @Delete("/:id")
  delete(@Param("id") id: string) {} // DELETE /api/products/:id - Delete
}
```

### Nested Resources

```typescript
@Controller("/api/users")
export class UserController {
  // User posts
  @Get("/:userId/posts")
  getUserPosts(@Param("userId") userId: string) {}

  @Post("/:userId/posts")
  createUserPost(@Param("userId") userId: string, @Body() postData: any) {}

  @Get("/:userId/posts/:postId")
  getUserPost(
    @Param("userId") userId: string,
    @Param("postId") postId: string
  ) {}

  // User comments
  @Get("/:userId/comments")
  getUserComments(@Param("userId") userId: string) {}
}
```

### Action Routes

Routes that represent actions rather than resources:

```typescript
@Controller("/api/users")
export class UserController {
  @Post("/:id/activate")
  activateUser(@Param("id") id: string) {
    return { message: "User activated" };
  }

  @Post("/:id/deactivate")
  deactivateUser(@Param("id") id: string) {
    return { message: "User deactivated" };
  }

  @Post("/:id/reset-password")
  resetPassword(@Param("id") id: string) {
    return { message: "Password reset email sent" };
  }
}
```

### Search Routes

```typescript
@Controller("/api/products")
export class ProductController {
  @Get("/search")
  search(
    @Query("q") query: string,
    @Query("category") category: string,
    @Query("minPrice") minPrice: string,
    @Query("maxPrice") maxPrice: string
  ) {
    return {
      query,
      category,
      minPrice: parseFloat(minPrice || "0"),
      maxPrice: parseFloat(maxPrice || "999999"),
    };
  }
}

// GET /api/products/search?q=laptop&category=electronics&minPrice=500&maxPrice=2000
```

## Route Versioning

### URL Path Versioning

```typescript
@Controller("/api/v1/users")
export class UserV1Controller {
  @Get("/")
  getAllUsers() {
    return { version: "v1", users: [] };
  }
}

@Controller("/api/v2/users")
export class UserV2Controller {
  @Get("/")
  getAllUsers() {
    return { version: "v2", users: [], metadata: {} };
  }
}
```

### Header Versioning

```typescript
@Controller("/api/users")
export class UserController {
  @Get("/")
  getAllUsers(@Req() request: FastifyRequest) {
    const version = request.headers["api-version"] || "v1";

    if (version === "v2") {
      return { version: "v2", users: [], metadata: {} };
    }

    return { version: "v1", users: [] };
  }
}
```

## Route Priority

Routes are matched in the order they are defined. More specific routes should come before generic ones:

```typescript
@Controller("/api/users")
export class UserController {
  // Specific route - must come first
  @Get("/me")
  getCurrentUser() {
    return { id: "current", name: "Current User" };
  }

  // Generic route - comes after
  @Get("/:id")
  getUser(@Param("id") id: string) {
    return { id, name: "User" };
  }
}

// GET /api/users/me -> getCurrentUser()
// GET /api/users/123 -> getUser('123')
```

## Wildcard Routes

Handle catch-all routes:

```typescript
@Controller("/api")
export class ApiController {
  @Get("/*")
  catchAll(@Req() request: FastifyRequest) {
    return {
      message: "Route not found",
      path: request.url,
    };
  }
}
```

## Route Middleware

Apply middleware to specific routes:

```typescript
const authenticate = async (request, reply) => {
  const token = request.headers.authorization;
  if (!token) {
    reply.code(401).send({ error: "Unauthorized" });
  }
};

const rateLimit = async (request, reply) => {
  // Rate limiting logic
};

@Controller("/api/admin")
export class AdminController {
  // Middleware on specific route
  @Get("/dashboard")
  @UseMiddleware(authenticate)
  getDashboard() {
    return { data: "Admin dashboard" };
  }

  // Multiple middleware
  @Post("/users")
  @UseMiddleware(authenticate, rateLimit)
  createUser(@Body() userData: any) {
    return userData;
  }
}
```

## Complete Example

Here's a complete example showing all routing features:

```typescript
import { z } from "zod";
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Schema,
  UseMiddleware,
} from "bootifyjs";

const createProductSchema = {
  body: z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500),
    price: z.number().positive(),
    category: z.enum(["electronics", "clothing", "food"]),
    inStock: z.boolean().default(true),
  }),
  responses: {
    201: z.object({
      id: z.string(),
      name: z.string(),
      price: z.number(),
      createdAt: z.date(),
    }),
  },
};

const updateProductSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    price: z.number().positive().optional(),
    inStock: z.boolean().optional(),
  }),
};

const listProductsSchema = {
  query: z.object({
    category: z.string().optional(),
    page: z
      .string()
      .transform((val) => parseInt(val))
      .default("1"),
    limit: z
      .string()
      .transform((val) => parseInt(val))
      .default("10"),
    sort: z.enum(["price", "name", "createdAt"]).default("createdAt"),
    order: z.enum(["asc", "desc"]).default("asc"),
  }),
};

@Controller("/api/products")
@UseMiddleware(authenticate)
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get("/")
  @Schema(listProductsSchema)
  getAllProducts(
    @Query("category") category: string,
    @Query("page") page: number,
    @Query("limit") limit: number,
    @Query("sort") sort: string,
    @Query("order") order: string
  ) {
    return this.productService.findAll({
      category,
      page,
      limit,
      sort,
      order,
    });
  }

  @Get("/search")
  @Schema({
    query: z.object({
      q: z.string().min(1),
      category: z.string().optional(),
    }),
  })
  searchProducts(
    @Query("q") query: string,
    @Query("category") category: string
  ) {
    return this.productService.search(query, category);
  }

  @Get("/:id")
  @Schema({
    params: z.object({
      id: z.string().uuid(),
    }),
  })
  getProduct(@Param("id") id: string) {
    return this.productService.findById(id);
  }

  @Post("/")
  @Schema(createProductSchema)
  @UseMiddleware(rateLimit)
  createProduct(@Body() productData: z.infer<typeof createProductSchema.body>) {
    return this.productService.create(productData);
  }

  @Put("/:id")
  @Schema(updateProductSchema)
  updateProduct(
    @Param("id") id: string,
    @Body() updates: z.infer<typeof updateProductSchema.body>
  ) {
    return this.productService.update(id, updates);
  }

  @Delete("/:id")
  @Schema({
    params: z.object({
      id: z.string().uuid(),
    }),
  })
  deleteProduct(@Param("id") id: string) {
    this.productService.delete(id);
    return { message: "Product deleted successfully" };
  }
}
```

## Best Practices

### 1. Use RESTful Conventions

```typescript
// Good: RESTful routes
@Get('/')           // List
@Get('/:id')        // Get one
@Post('/')          // Create
@Put('/:id')        // Update
@Delete('/:id')     // Delete

// Avoid: Non-standard routes
@Get('/getAllUsers')
@Post('/createUser')
```

### 2. Validate All Input

```typescript
// Good: Validated input
@Post('/')
@Schema({
  body: z.object({
    email: z.string().email(),
    age: z.number().min(0)
  })
})
createUser(@Body() body: ValidatedUser) {}

// Bad: No validation
@Post('/')
createUser(@Body() body: any) {}
```

### 3. Use Specific Routes Before Generic

```typescript
// Good: Specific first
@Get('/me')
getCurrentUser() {}

@Get('/:id')
getUser(@Param('id') id: string) {}

// Bad: Generic first (will catch /me)
@Get('/:id')
getUser(@Param('id') id: string) {}

@Get('/me')
getCurrentUser() {}  // Never reached!
```

### 4. Keep Routes Organized

```typescript
// Good: Organized by resource
@Controller('/api/users')
export class UserController {}

@Controller('/api/products')
export class ProductController {}

// Bad: Mixed resources
@Controller('/api')
export class ApiController {
  @Get('/users') {}
  @Get('/products') {}
  @Get('/orders') {}
}
```

## Next Steps

- Learn about [Controllers](./controllers.md) for more controller patterns
- Explore [Validation](./validation.md) for request validation
- Check out [Services](./services.md) for business logic organization
