---
id: core-validation
title: Validation
sidebar_label: Validation
description: Learn how to validate requests using Zod schemas in BootifyJS
keywords:
  [
    bootifyjs,
    validation,
    zod,
    schema validation,
    request validation,
    type safety,
  ]
---

# Validation

BootifyJS uses [Zod](https://zod.dev/) for runtime validation of request data. Zod provides type-safe schema validation with excellent TypeScript integration, ensuring your API receives valid data before it reaches your business logic.

## Why Validation Matters

Validation is critical for:

- **Security**: Prevent malicious or malformed data
- **Data Integrity**: Ensure data meets business requirements
- **Type Safety**: Runtime validation that matches TypeScript types
- **Better Errors**: Clear, actionable error messages for clients
- **Documentation**: Schemas serve as API documentation

## The @Schema Decorator

Use the `@Schema` decorator to validate request data:

```typescript
import { Schema } from "bootifyjs";
import { z } from "zod";

@Controller("/api/users")
export class UserController {
  @Post("/")
  @Schema({
    body: z.object({
      name: z.string(),
      email: z.string().email(),
    }),
  })
  createUser(@Body() userData: { name: string; email: string }) {
    return userData;
  }
}
```

## Validating Request Body

The most common validation scenario is validating the request body:

### Basic Body Validation

```typescript
const createUserSchema = {
  body: z.object({
    name: z.string().min(2).max(50),
    email: z.string().email(),
    age: z.number().min(18).max(120),
  }),
};

@Controller("/api/users")
export class UserController {
  @Post("/")
  @Schema(createUserSchema)
  createUser(@Body() userData: z.infer<typeof createUserSchema.body>) {
    // userData is validated and typed
    return userData;
  }
}
```

### Optional Fields

```typescript
@Post('/')
@Schema({
  body: z.object({
    name: z.string(),
    email: z.string().email(),
    age: z.number().optional(),           // Optional field
    bio: z.string().max(500).optional()   // Optional field
  })
})
createUser(@Body() userData: CreateUserDto) {
  return userData;
}
```

### Default Values

```typescript
@Post('/')
@Schema({
  body: z.object({
    name: z.string(),
    email: z.string().email(),
    role: z.enum(['user', 'admin']).default('user'),
    isActive: z.boolean().default(true)
  })
})
createUser(@Body() userData: CreateUserDto) {
  // role defaults to 'user' if not provided
  // isActive defaults to true if not provided
  return userData;
}
```

### Nested Objects

```typescript
@Post('/')
@Schema({
  body: z.object({
    name: z.string(),
    email: z.string().email(),
    address: z.object({
      street: z.string(),
      city: z.string(),
      zipCode: z.string().regex(/^\d{5}$/),
      country: z.string()
    }),
    preferences: z.object({
      newsletter: z.boolean().default(false),
      notifications: z.boolean().default(true)
    })
  })
})
createUser(@Body() userData: CreateUserDto) {
  return userData;
}
```

### Arrays

```typescript
@Post('/bulk')
@Schema({
  body: z.object({
    users: z.array(
      z.object({
        name: z.string(),
        email: z.string().email()
      })
    ).min(1).max(100)  // At least 1, at most 100 users
  })
})
createUsers(@Body() data: { users: User[] }) {
  return data.users;
}
```

## Validating Route Parameters

Validate dynamic segments in the URL:

```typescript
@Get('/:id')
@Schema({
  params: z.object({
    id: z.string().uuid()
  })
})
getUser(@Param('id') id: string) {
  return { id };
}

@Get('/:userId/posts/:postId')
@Schema({
  params: z.object({
    userId: z.string().regex(/^\d+$/),
    postId: z.string().regex(/^\d+$/)
  })
})
getUserPost(
  @Param('userId') userId: string,
  @Param('postId') postId: string
) {
  return { userId, postId };
}
```

## Validating Query Parameters

Validate and transform query string parameters:

### Basic Query Validation

```typescript
@Get('/')
@Schema({
  query: z.object({
    page: z.string().transform(val => parseInt(val)).default('1'),
    limit: z.string().transform(val => parseInt(val)).default('10'),
    sort: z.enum(['name', 'createdAt', 'updatedAt']).default('createdAt')
  })
})
getUsers(
  @Query('page') page: number,
  @Query('limit') limit: number,
  @Query('sort') sort: string
) {
  // page and limit are numbers, not strings
  return { page, limit, sort };
}
```

### Boolean Query Parameters

```typescript
@Get('/')
@Schema({
  query: z.object({
    active: z.string().transform(val => val === 'true').optional(),
    verified: z.string().transform(val => val === 'true').optional()
  })
})
getUsers(
  @Query('active') active: boolean,
  @Query('verified') verified: boolean
) {
  return { active, verified };
}

// GET /api/users?active=true&verified=false
// active = true, verified = false
```

### Array Query Parameters

```typescript
@Get('/')
@Schema({
  query: z.object({
    tags: z.string().transform(val => val.split(',')).optional(),
    categories: z.array(z.string()).optional()
  })
})
getProducts(
  @Query('tags') tags: string[],
  @Query('categories') categories: string[]
) {
  return { tags, categories };
}

// GET /api/products?tags=electronics,gadgets&categories=phones
```

## Combining Validations

Validate multiple parts of the request:

```typescript
@Post('/:orgId/users')
@Schema({
  params: z.object({
    orgId: z.string().uuid()
  }),
  query: z.object({
    sendEmail: z.string().transform(val => val === 'true').optional(),
    role: z.enum(['member', 'admin']).default('member')
  }),
  body: z.object({
    name: z.string().min(2).max(50),
    email: z.string().email(),
    department: z.string().optional()
  })
})
addUserToOrganization(
  @Param('orgId') orgId: string,
  @Query('sendEmail') sendEmail: boolean,
  @Query('role') role: string,
  @Body() userData: AddUserDto
) {
  return { orgId, sendEmail, role, userData };
}
```

## Response Schemas

Define expected response schemas for documentation and validation:

```typescript
@Post('/')
@Schema({
  body: z.object({
    text: z.string().min(1).max(500)
  }),
  responses: {
    201: z.object({
      id: z.string(),
      text: z.string(),
      completed: z.boolean(),
      createdAt: z.date()
    }),
    400: z.object({
      error: z.string(),
      details: z.array(z.string())
    })
  }
})
createTodo(@Body() body: { text: string }) {
  return {
    id: '123',
    text: body.text,
    completed: false,
    createdAt: new Date()
  };
}
```

## Common Validation Patterns

### Email Validation

```typescript
@Schema({
  body: z.object({
    email: z.string().email()
  })
})
```

### URL Validation

```typescript
@Schema({
  body: z.object({
    website: z.string().url(),
    avatar: z.string().url().optional()
  })
})
```

### UUID Validation

```typescript
@Schema({
  params: z.object({
    id: z.string().uuid()
  })
})
```

### Regex Validation

```typescript
@Schema({
  body: z.object({
    phone: z.string().regex(/^\+?[1-9]\d{1,14}$/),
    zipCode: z.string().regex(/^\d{5}(-\d{4})?$/),
    username: z.string().regex(/^[a-zA-Z0-9_]{3,20}$/)
  })
})
```

### Enum Validation

```typescript
@Schema({
  body: z.object({
    status: z.enum(['pending', 'active', 'inactive']),
    priority: z.enum(['low', 'medium', 'high']).default('medium')
  })
})
```

### Number Validation

```typescript
@Schema({
  body: z.object({
    age: z.number().int().min(0).max(150),
    price: z.number().positive(),
    discount: z.number().min(0).max(100),
    rating: z.number().min(1).max(5)
  })
})
```

### Date Validation

```typescript
@Schema({
  body: z.object({
    birthDate: z.string().datetime(),
    startDate: z.date(),
    endDate: z.date()
  })
})
```

### String Length Validation

```typescript
@Schema({
  body: z.object({
    username: z.string().min(3).max(20),
    password: z.string().min(8).max(100),
    bio: z.string().max(500).optional()
  })
})
```

## Advanced Validation

### Custom Validation

```typescript
@Schema({
  body: z.object({
    password: z.string()
      .min(8)
      .refine(
        (val) => /[A-Z]/.test(val),
        { message: 'Password must contain at least one uppercase letter' }
      )
      .refine(
        (val) => /[a-z]/.test(val),
        { message: 'Password must contain at least one lowercase letter' }
      )
      .refine(
        (val) => /[0-9]/.test(val),
        { message: 'Password must contain at least one number' }
      )
  })
})
```

### Conditional Validation

```typescript
@Schema({
  body: z.object({
    type: z.enum(['individual', 'business']),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    companyName: z.string().optional()
  }).refine(
    (data) => {
      if (data.type === 'individual') {
        return data.firstName && data.lastName;
      }
      return data.companyName;
    },
    {
      message: 'Individual requires firstName and lastName, business requires companyName'
    }
  )
})
```

### Cross-Field Validation

```typescript
@Schema({
  body: z.object({
    password: z.string().min(8),
    confirmPassword: z.string()
  }).refine(
    (data) => data.password === data.confirmPassword,
    {
      message: 'Passwords do not match',
      path: ['confirmPassword']
    }
  )
})
```

### Dependent Fields

```typescript
@Schema({
  body: z.object({
    hasAddress: z.boolean(),
    address: z.object({
      street: z.string(),
      city: z.string(),
      zipCode: z.string()
    }).optional()
  }).refine(
    (data) => !data.hasAddress || data.address !== undefined,
    {
      message: 'Address is required when hasAddress is true',
      path: ['address']
    }
  )
})
```

## Reusable Schemas

Define schemas once and reuse them:

```typescript
// schemas/user.schema.ts
import { z } from "zod";

export const UserBaseSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2).max(50),
  email: z.string().email(),
  age: z.number().min(18).max(120),
  createdAt: z.date(),
});

export const CreateUserSchema = UserBaseSchema.pick({
  name: true,
  email: true,
  age: true,
});

export const UpdateUserSchema = UserBaseSchema.pick({
  name: true,
  email: true,
  age: true,
}).partial();

export const UserResponseSchema = UserBaseSchema;

// In controller
@Controller("/api/users")
export class UserController {
  @Post("/")
  @Schema({
    body: CreateUserSchema,
    responses: {
      201: UserResponseSchema,
    },
  })
  createUser(@Body() userData: z.infer<typeof CreateUserSchema>) {
    return userData;
  }

  @Put("/:id")
  @Schema({
    params: z.object({ id: z.string().uuid() }),
    body: UpdateUserSchema,
  })
  updateUser(
    @Param("id") id: string,
    @Body() updates: z.infer<typeof UpdateUserSchema>
  ) {
    return updates;
  }
}
```

## Type Inference

Extract TypeScript types from Zod schemas:

```typescript
const createTodoSchema = z.object({
  text: z.string().min(1).max(500),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  tags: z.array(z.string()).optional()
});

// Infer TypeScript type
type CreateTodoDto = z.infer<typeof createTodoSchema>;
// {
//   text: string;
//   priority: 'low' | 'medium' | 'high';
//   tags?: string[];
// }

@Post('/')
@Schema({ body: createTodoSchema })
createTodo(@Body() body: CreateTodoDto) {
  // body is fully typed
  return body;
}
```

## Error Handling

Validation errors automatically return 400 Bad Request with detailed error messages:

```typescript
// Request: POST /api/users
// Body: { "name": "A", "email": "invalid" }

// Response: 400 Bad Request
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "validation": [
    {
      "field": "name",
      "message": "String must contain at least 2 character(s)"
    },
    {
      "field": "email",
      "message": "Invalid email"
    }
  ]
}
```

## Complete Example

Here's a complete example with comprehensive validation:

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
} from "bootifyjs";

// Reusable schemas
const TodoBaseSchema = z.object({
  id: z.string().uuid(),
  text: z.string().min(1).max(500),
  completed: z.boolean(),
  priority: z.enum(["low", "medium", "high"]),
  tags: z.array(z.string()),
  dueDate: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const CreateTodoSchema = TodoBaseSchema.pick({
  text: true,
  priority: true,
  tags: true,
  dueDate: true,
}).extend({
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  tags: z.array(z.string()).default([]),
});

const UpdateTodoSchema = TodoBaseSchema.pick({
  text: true,
  completed: true,
  priority: true,
  tags: true,
  dueDate: true,
}).partial();

const ListTodosQuerySchema = z.object({
  completed: z
    .string()
    .transform((val) => val === "true")
    .optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  page: z
    .string()
    .transform((val) => parseInt(val))
    .default("1"),
  limit: z
    .string()
    .transform((val) => parseInt(val))
    .default("10"),
  sort: z.enum(["createdAt", "dueDate", "priority"]).default("createdAt"),
});

@Controller("/api/todos")
export class TodoController {
  constructor(private readonly todoService: TodoService) {}

  @Get("/")
  @Schema({
    query: ListTodosQuerySchema,
  })
  getAllTodos(
    @Query("completed") completed: boolean,
    @Query("priority") priority: string,
    @Query("page") page: number,
    @Query("limit") limit: number,
    @Query("sort") sort: string
  ) {
    return this.todoService.findAll({
      completed,
      priority,
      page,
      limit,
      sort,
    });
  }

  @Get("/:id")
  @Schema({
    params: z.object({
      id: z.string().uuid(),
    }),
    responses: {
      200: TodoBaseSchema,
      404: z.object({
        error: z.string(),
        message: z.string(),
      }),
    },
  })
  getTodoById(@Param("id") id: string) {
    return this.todoService.findById(id);
  }

  @Post("/")
  @Schema({
    body: CreateTodoSchema,
    responses: {
      201: TodoBaseSchema,
      400: z.object({
        error: z.string(),
        validation: z.array(
          z.object({
            field: z.string(),
            message: z.string(),
          })
        ),
      }),
    },
  })
  createTodo(@Body() todoData: z.infer<typeof CreateTodoSchema>) {
    return this.todoService.create(todoData);
  }

  @Put("/:id")
  @Schema({
    params: z.object({
      id: z.string().uuid(),
    }),
    body: UpdateTodoSchema,
    responses: {
      200: TodoBaseSchema,
      404: z.object({
        error: z.string(),
      }),
    },
  })
  updateTodo(
    @Param("id") id: string,
    @Body() updates: z.infer<typeof UpdateTodoSchema>
  ) {
    return this.todoService.update(id, updates);
  }

  @Delete("/:id")
  @Schema({
    params: z.object({
      id: z.string().uuid(),
    }),
  })
  deleteTodo(@Param("id") id: string) {
    this.todoService.delete(id);
    return { message: "Todo deleted successfully" };
  }
}
```

## Best Practices

### 1. Always Validate Input

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

### 2. Use Type Inference

```typescript
// Good: Type inference
const schema = z.object({ name: z.string() });
type Dto = z.infer<typeof schema>;

@Post('/')
@Schema({ body: schema })
create(@Body() body: Dto) {}

// Bad: Manual types
@Post('/')
@Schema({ body: schema })
create(@Body() body: { name: string }) {}
```

### 3. Reuse Schemas

```typescript
// Good: Reusable schemas
const UserBaseSchema = z.object({ ... });
const CreateUserSchema = UserBaseSchema.pick({ ... });
const UpdateUserSchema = UserBaseSchema.partial();

// Bad: Duplicate schemas
const CreateUserSchema = z.object({ name: z.string(), email: z.string() });
const UpdateUserSchema = z.object({ name: z.string(), email: z.string() });
```

### 4. Provide Clear Error Messages

```typescript
// Good: Custom error messages
z.string().min(8, "Password must be at least 8 characters");

// Bad: Default messages
z.string().min(8);
```

### 5. Validate All Layers

```typescript
// Good: Validate params, query, and body
@Post('/:orgId/users')
@Schema({
  params: z.object({ orgId: z.string().uuid() }),
  query: z.object({ sendEmail: z.string() }),
  body: z.object({ name: z.string() })
})

// Bad: Only validate body
@Post('/:orgId/users')
@Schema({
  body: z.object({ name: z.string() })
})
```

## Next Steps

- Learn about [Controllers](./controllers.md) to handle validated requests
- Explore [Services](./services.md) for business logic
- Read about [Routing](./routing.md) for route patterns
- Check out [Zod documentation](https://zod.dev/) for advanced validation
