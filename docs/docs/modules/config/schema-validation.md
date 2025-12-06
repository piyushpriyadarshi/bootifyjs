---
id: config-schema-validation
title: Schema Validation
sidebar_label: Schema Validation
description: Advanced Zod schema validation techniques for configuration management
keywords: [bootifyjs, config, zod, validation, schema, types]
---

# Schema Validation with Zod

The Config module uses [Zod](https://zod.dev/) for runtime validation and TypeScript type inference. This ensures your configuration is valid before your application starts, preventing runtime errors from missing or invalid environment variables.

## Why Zod?

Zod provides:

- **Runtime Validation**: Catch configuration errors at startup, not in production
- **Type Inference**: Automatic TypeScript types from your schema
- **Transformations**: Convert string env vars to numbers, booleans, arrays, etc.
- **Custom Validation**: Complex validation rules and relationships
- **Clear Error Messages**: Actionable feedback when validation fails

## Basic Schema Types

### String Validation

```typescript
import { z } from "zod";

const schema = z.object({
  // Required string
  API_KEY: z.string(),

  // String with minimum length
  JWT_SECRET: z.string().min(32),

  // String with maximum length
  USERNAME: z.string().max(50),

  // String with length range
  PASSWORD: z.string().min(8).max(128),

  // Email validation
  ADMIN_EMAIL: z.string().email(),

  // URL validation
  API_ENDPOINT: z.string().url(),

  // UUID validation
  TENANT_ID: z.string().uuid(),

  // Pattern matching (regex)
  VERSION: z.string().regex(/^\d+\.\d+\.\d+$/),

  // Starts with / ends with
  STRIPE_KEY: z.string().startsWith("sk_"),
  LOG_FILE: z.string().endsWith(".log"),
});
```

### Number Validation

Environment variables are strings by default. Use `z.coerce.number()` to convert:

```typescript
const schema = z.object({
  // Convert string to number
  PORT: z.coerce.number(),

  // Number with minimum
  MIN_CONNECTIONS: z.coerce.number().min(1),

  // Number with maximum
  MAX_CONNECTIONS: z.coerce.number().max(100),

  // Number with range
  POOL_SIZE: z.coerce.number().min(1).max(50),

  // Positive number
  TIMEOUT: z.coerce.number().positive(),

  // Non-negative (0 or positive)
  RETRY_COUNT: z.coerce.number().nonnegative(),

  // Integer only
  WORKER_COUNT: z.coerce.number().int(),

  // Multiple of (e.g., must be multiple of 10)
  BATCH_SIZE: z.coerce.number().multipleOf(10),
});
```

### Boolean Validation

```typescript
const schema = z.object({
  // Convert string to boolean
  ENABLE_CACHE: z.coerce.boolean(),

  // Custom boolean parsing
  DEBUG_MODE: z
    .string()
    .transform((val) => val.toLowerCase() === "true")
    .pipe(z.boolean()),

  // Preprocess for flexible boolean values
  ENABLE_SSL: z.preprocess(
    (val) => String(val).toLowerCase() === "true",
    z.boolean()
  ),
});

// Accepts: 'true', 'false', '1', '0', 'yes', 'no'
```

### Enum Validation

```typescript
const schema = z.object({
  // Enum with specific values
  NODE_ENV: z.enum(["development", "production", "test"]),

  // Log level enum
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]),

  // Database type
  DB_TYPE: z.enum(["postgres", "mysql", "mongodb", "sqlite"]),

  // Region selection
  AWS_REGION: z.enum(["us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1"]),
});
```

## Default Values

Provide fallback values for optional configuration:

```typescript
const schema = z.object({
  // Simple default
  PORT: z.coerce.number().default(3000),

  // String default
  HOST: z.string().default("localhost"),

  // Boolean default
  ENABLE_METRICS: z.coerce.boolean().default(false),

  // Enum default
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // Environment-specific default
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default(process.env.NODE_ENV === "production" ? "info" : "debug"),
});
```

## Optional Values

Make configuration optional (can be undefined):

```typescript
const schema = z.object({
  // Optional string
  OPTIONAL_API_KEY: z.string().optional(),

  // Optional with default (never undefined)
  CACHE_TTL: z.coerce.number().optional().default(3600),

  // Nullable (can be null)
  EXTERNAL_SERVICE_URL: z.string().nullable(),

  // Optional or nullable
  BACKUP_PATH: z.string().optional().nullable(),
});
```

## Transformations

Transform string environment variables into complex types:

### Array Transformation

```typescript
const schema = z.object({
  // Comma-separated list to array
  ALLOWED_ORIGINS: z
    .string()
    .transform((val) => val.split(",").map((s) => s.trim())),

  // With validation on each item
  ADMIN_EMAILS: z
    .string()
    .transform((val) => val.split(","))
    .pipe(z.array(z.string().email())),

  // Number array
  ALLOWED_PORTS: z
    .string()
    .transform((val) => val.split(",").map(Number))
    .pipe(z.array(z.number())),
});

// Usage:
// ALLOWED_ORIGINS=http://localhost:3000,https://example.com
// Result: ['http://localhost:3000', 'https://example.com']
```

### JSON Transformation

```typescript
const schema = z.object({
  // Parse JSON string
  FEATURE_FLAGS: z
    .string()
    .transform((val) => JSON.parse(val))
    .pipe(
      z.object({
        enableNewUI: z.boolean(),
        enableBetaFeatures: z.boolean(),
      })
    ),

  // Array of objects
  SERVICE_ENDPOINTS: z
    .string()
    .transform((val) => JSON.parse(val))
    .pipe(
      z.array(
        z.object({
          name: z.string(),
          url: z.string().url(),
        })
      )
    ),
});

// Usage:
// FEATURE_FLAGS={"enableNewUI":true,"enableBetaFeatures":false}
```

### Custom Transformations

```typescript
const schema = z.object({
  // Convert duration string to milliseconds
  SESSION_TIMEOUT: z.string().transform((val) => {
    const match = val.match(/^(\d+)(s|m|h|d)$/);
    if (!match) throw new Error("Invalid duration format");

    const [, num, unit] = match;
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return parseInt(num) * multipliers[unit as keyof typeof multipliers];
  }),

  // Parse connection string
  DATABASE_URL: z
    .string()
    .url()
    .transform((val) => {
      const url = new URL(val);
      return {
        host: url.hostname,
        port: parseInt(url.port) || 5432,
        database: url.pathname.slice(1),
        username: url.username,
        password: url.password,
      };
    }),
});

// Usage:
// SESSION_TIMEOUT=30m → 1800000 (milliseconds)
// DATABASE_URL=postgresql://user:pass@localhost:5432/mydb
```

## Advanced Validation

### Conditional Validation

```typescript
const schema = z
  .object({
    ENABLE_SSL: z.coerce.boolean(),
    SSL_CERT_PATH: z.string().optional(),
    SSL_KEY_PATH: z.string().optional(),
  })
  .refine(
    (data) => !data.ENABLE_SSL || (data.SSL_CERT_PATH && data.SSL_KEY_PATH),
    {
      message:
        "SSL_CERT_PATH and SSL_KEY_PATH are required when ENABLE_SSL is true",
      path: ["SSL_CERT_PATH"],
    }
  );
```

### Cross-Field Validation

```typescript
const schema = z
  .object({
    MIN_POOL_SIZE: z.coerce.number(),
    MAX_POOL_SIZE: z.coerce.number(),
  })
  .refine((data) => data.MIN_POOL_SIZE <= data.MAX_POOL_SIZE, {
    message: "MIN_POOL_SIZE must be less than or equal to MAX_POOL_SIZE",
    path: ["MAX_POOL_SIZE"],
  });
```

### Multiple Refinements

```typescript
const schema = z
  .object({
    PASSWORD: z.string(),
  })
  .refine((data) => data.PASSWORD.length >= 8, {
    message: "Password must be at least 8 characters",
  })
  .refine((data) => /[A-Z]/.test(data.PASSWORD), {
    message: "Password must contain at least one uppercase letter",
  })
  .refine((data) => /[0-9]/.test(data.PASSWORD), {
    message: "Password must contain at least one number",
  });
```

### Superrefine for Complex Logic

```typescript
const schema = z
  .object({
    AUTH_TYPE: z.enum(["jwt", "oauth", "api-key"]),
    JWT_SECRET: z.string().optional(),
    OAUTH_CLIENT_ID: z.string().optional(),
    API_KEY: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.AUTH_TYPE === "jwt" && !data.JWT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "JWT_SECRET is required when AUTH_TYPE is jwt",
        path: ["JWT_SECRET"],
      });
    }

    if (data.AUTH_TYPE === "oauth" && !data.OAUTH_CLIENT_ID) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "OAUTH_CLIENT_ID is required when AUTH_TYPE is oauth",
        path: ["OAUTH_CLIENT_ID"],
      });
    }

    if (data.AUTH_TYPE === "api-key" && !data.API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "API_KEY is required when AUTH_TYPE is api-key",
        path: ["API_KEY"],
      });
    }
  });
```

## Nested Objects

Organize related configuration into nested objects:

```typescript
const schema = z
  .object({
    // Flat structure (from env vars)
    DB_HOST: z.string(),
    DB_PORT: z.coerce.number(),
    DB_NAME: z.string(),
    DB_USER: z.string(),
    DB_PASSWORD: z.string(),
  })
  .transform((data) => ({
    // Transform to nested structure
    database: {
      host: data.DB_HOST,
      port: data.DB_PORT,
      name: data.DB_NAME,
      credentials: {
        user: data.DB_USER,
        password: data.DB_PASSWORD,
      },
    },
  }));

// Access as: config.get('database').host
```

## Union Types

Allow multiple valid types:

```typescript
const schema = z.object({
  // String or number
  CACHE_TTL: z.union([z.coerce.number(), z.literal("infinite")]),

  // Multiple formats
  TIMEOUT: z.union([
    z.coerce.number(), // milliseconds
    z.string().regex(/^\d+[smh]$/), // duration string
  ]),
});
```

## Discriminated Unions

Different schemas based on a discriminator field:

```typescript
const schema = z
  .object({
    STORAGE_TYPE: z.enum(["local", "s3", "gcs"]),

    // Local storage config
    LOCAL_PATH: z.string().optional(),

    // S3 config
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().optional(),

    // GCS config
    GCS_BUCKET: z.string().optional(),
    GCS_PROJECT_ID: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.STORAGE_TYPE === "local" && !data.LOCAL_PATH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "LOCAL_PATH required for local storage",
        path: ["LOCAL_PATH"],
      });
    }

    if (data.STORAGE_TYPE === "s3" && (!data.S3_BUCKET || !data.S3_REGION)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "S3_BUCKET and S3_REGION required for S3 storage",
        path: ["S3_BUCKET"],
      });
    }

    if (
      data.STORAGE_TYPE === "gcs" &&
      (!data.GCS_BUCKET || !data.GCS_PROJECT_ID)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "GCS_BUCKET and GCS_PROJECT_ID required for GCS storage",
        path: ["GCS_BUCKET"],
      });
    }
  });
```

## Type Inference

Get TypeScript types from your schema:

```typescript
const configSchema = z.object({
  PORT: z.coerce.number(),
  DATABASE_URL: z.string().url(),
  ENABLE_CACHE: z.coerce.boolean(),
  ALLOWED_ORIGINS: z.string().transform((val) => val.split(",")),
});

// Infer the type
type Config = z.infer<typeof configSchema>;
// Result:
// {
//   PORT: number;
//   DATABASE_URL: string;
//   ENABLE_CACHE: boolean;
//   ALLOWED_ORIGINS: string[];
// }

// Use in your code
function setupServer(config: Config) {
  // config is fully typed
  console.log(config.PORT); // number
  console.log(config.ALLOWED_ORIGINS); // string[]
}
```

## Real-World Examples

### Complete Application Configuration

```typescript
import { z } from "zod";

export const appConfigSchema = z
  .object({
    // Server
    PORT: z.coerce.number().min(1).max(65535).default(3000),
    HOST: z.string().default("0.0.0.0"),

    // Database
    DATABASE_URL: z.string().url(),
    DATABASE_POOL_MIN: z.coerce.number().min(0).default(2),
    DATABASE_POOL_MAX: z.coerce.number().min(1).default(10),
    DATABASE_SSL: z.coerce.boolean().default(false),

    // Redis
    REDIS_URL: z.string().url(),
    REDIS_TTL: z.coerce.number().default(3600),

    // Authentication
    JWT_SECRET: z.string().min(32),
    JWT_EXPIRES_IN: z.string().default("7d"),
    REFRESH_TOKEN_SECRET: z.string().min(32),
    REFRESH_TOKEN_EXPIRES_IN: z.string().default("30d"),

    // External Services
    STRIPE_API_KEY: z.string().startsWith("sk_"),
    SENDGRID_API_KEY: z.string(),
    AWS_REGION: z.string().default("us-east-1"),
    AWS_ACCESS_KEY_ID: z.string(),
    AWS_SECRET_ACCESS_KEY: z.string(),

    // Feature Flags
    ENABLE_SIGNUP: z.coerce.boolean().default(true),
    ENABLE_SOCIAL_LOGIN: z.coerce.boolean().default(false),
    ENABLE_EMAIL_VERIFICATION: z.coerce.boolean().default(true),

    // CORS
    ALLOWED_ORIGINS: z
      .string()
      .transform((val) => val.split(",").map((s) => s.trim()))
      .pipe(z.array(z.string().url())),

    // Rate Limiting
    RATE_LIMIT_WINDOW: z.coerce.number().default(900000), // 15 minutes
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  })
  .refine((data) => data.DATABASE_POOL_MIN <= data.DATABASE_POOL_MAX, {
    message: "DATABASE_POOL_MIN must be <= DATABASE_POOL_MAX",
    path: ["DATABASE_POOL_MAX"],
  });

export type AppConfig = z.infer<typeof appConfigSchema>;
```

### Microservice Configuration

```typescript
const microserviceConfig = z.object({
  // Service Identity
  SERVICE_NAME: z.string(),
  SERVICE_VERSION: z.string().regex(/^\d+\.\d+\.\d+$/),

  // Service Discovery
  CONSUL_HOST: z.string(),
  CONSUL_PORT: z.coerce.number(),

  // Message Queue
  RABBITMQ_URL: z.string().url(),
  QUEUE_NAME: z.string(),
  QUEUE_PREFETCH: z.coerce.number().default(10),

  // Observability
  JAEGER_ENDPOINT: z.string().url().optional(),
  PROMETHEUS_PORT: z.coerce.number().default(9090),

  // Health Check
  HEALTH_CHECK_INTERVAL: z.coerce.number().default(30000),
  HEALTH_CHECK_TIMEOUT: z.coerce.number().default(5000),
});
```

## Error Messages

Zod provides detailed error messages:

```typescript
// Missing required field
Configuration validation failed:
- DATABASE_URL: Required

// Invalid type
Configuration validation failed:
- PORT: Expected number, received nan

// Failed validation
Configuration validation failed:
- JWT_SECRET: String must contain at least 32 character(s)

// Custom refinement
Configuration validation failed:
- MAX_POOL_SIZE: MIN_POOL_SIZE must be less than or equal to MAX_POOL_SIZE
```

## Best Practices

1. **Use Descriptive Variable Names**: `DATABASE_URL` not `DB_URL`
2. **Group Related Config**: Prefix related vars (`DB_*`, `REDIS_*`, `AWS_*`)
3. **Provide Sensible Defaults**: Don't require config for everything
4. **Validate Early**: Initialize config at app startup
5. **Document Requirements**: Comment your schema
6. **Use Transformations**: Convert strings to appropriate types
7. **Add Custom Validation**: Ensure relationships between variables
8. **Type Everything**: Use `z.infer` for TypeScript types

## Next Steps

- **[Environment Variables](./environment-variables.md)** - Managing env vars across environments
- **[Config Overview](./overview.md)** - Back to Config module overview
- **[API Reference](../../api-reference/config-api.md)** - Complete API documentation
