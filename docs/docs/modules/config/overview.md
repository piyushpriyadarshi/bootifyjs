---
id: config-overview
title: Config Module Overview
sidebar_label: Overview
description: Introduction to the Config module - type-safe configuration management with Zod validation
keywords:
  [bootifyjs, config, configuration, environment variables, zod, validation]
---

# Config Module Overview

The Config module provides type-safe configuration management for BootifyJS applications. It uses Zod schemas to validate environment variables at startup, ensuring your application has all required configuration before it runs. This prevents runtime errors caused by missing or invalid configuration.

## Why Use the Config Module?

**Without Config Module:**

```typescript
// Unsafe - no validation, no types
const port = process.env.PORT || 3000;
const dbUrl = process.env.DATABASE_URL; // Could be undefined!
const maxConnections = parseInt(process.env.MAX_CONNECTIONS); // Could be NaN!
```

**With Config Module:**

```typescript
// Safe - validated at startup, fully typed
const port = config.get("PORT"); // number
const dbUrl = config.get("DATABASE_URL"); // string (guaranteed to exist)
const maxConnections = config.get("MAX_CONNECTIONS"); // number (validated)
```

## Key Features

- **Type Safety**: Full TypeScript support with inferred types from Zod schemas
- **Validation**: Automatic validation of all environment variables at startup
- **Default Values**: Define sensible defaults for optional configuration
- **Schema Merging**: Combine framework and application schemas seamlessly
- **Error Messages**: Clear, actionable error messages for invalid configuration
- **Singleton Pattern**: Single source of truth for configuration across your app
- **Sensitive Data Redaction**: Automatic redaction of passwords and secrets in logs

## Quick Example

Here's a complete example of using the Config module:

```typescript
import { AppConfig } from "bootifyjs";
import { z } from "zod";

// Define your application's configuration schema
const appConfigSchema = z.object({
  // Database configuration
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_SIZE: z.coerce.number().min(1).max(100).default(10),

  // API configuration
  API_KEY: z.string().min(32),
  API_RATE_LIMIT: z.coerce.number().default(100),

  // Feature flags
  ENABLE_CACHING: z.coerce.boolean().default(true),
  ENABLE_METRICS: z.coerce.boolean().default(false),
});

// Initialize the config (do this once at app startup)
AppConfig.initialize(appConfigSchema);

// Get the config instance
const config = AppConfig.getInstance();

// Access configuration values (fully typed!)
const dbUrl = config.get("DATABASE_URL"); // string
const poolSize = config.get("DATABASE_POOL_SIZE"); // number
const enableCaching = config.get("ENABLE_CACHING"); // boolean

// Also access framework configuration
const port = config.get("SERVER_PORT"); // number
const nodeEnv = config.get("NODE_ENV"); // 'development' | 'production' | 'test'
```

## Framework Configuration

BootifyJS includes built-in configuration for common framework needs:

```typescript
// Framework configuration (automatically available)
{
  NODE_ENV: 'development' | 'production' | 'test',  // default: 'development'
  SERVER_PORT: number,                               // default: 4000
  SERVER_HOST: string,                               // default: 'localhost'
  CONFIG_DEBUG: boolean,                             // default: true

  // Logging configuration
  LOG_LEVEL: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal',
  SERVICE_NAME: string,                              // default: 'bootifyjs-app'

  // ClickHouse logging (optional)
  CLICKHOUSE_ENABLED: boolean,                       // default: true
  CLICKHOUSE_URL: string,                            // default: 'http://localhost:8123'
  CLICKHOUSE_USER: string,                           // default: 'default'
  CLICKHOUSE_PASSWORD: string,                       // default: ''
  CLICKHOUSE_DB: string,                             // default: 'default'
}
```

Your application schema is merged with the framework schema, so you can access both.

## Configuration Lifecycle

```
┌─────────────────────────────────────┐
│  1. Define Zod Schema               │
│     (Application config)            │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  2. Initialize AppConfig            │
│     AppConfig.initialize(schema)    │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  3. Merge with Framework Schema     │
│     (Automatic)                     │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  4. Validate process.env            │
│     (Fails fast on errors)          │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  5. Application Starts              │
│     (Config guaranteed valid)       │
└─────────────────────────────────────┘
```

## Basic Usage Pattern

### 1. Create Configuration Schema

Create a file for your configuration schema:

```typescript title="src/config/app.config.ts"
import { z } from "zod";

export const appConfigSchema = z.object({
  // Required configuration
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),

  // Optional with defaults
  CACHE_TTL: z.coerce.number().default(3600),
  MAX_UPLOAD_SIZE: z.coerce.number().default(10485760), // 10MB
});

export type AppConfigType = z.infer<typeof appConfigSchema>;
```

### 2. Initialize at Startup

Initialize the config before starting your application:

```typescript title="src/index.ts"
import { BootifyApp, AppConfig } from "bootifyjs";
import { appConfigSchema } from "./config/app.config";

// Initialize config first
AppConfig.initialize(appConfigSchema);

// Then start your app
const app = new BootifyApp({
  port: AppConfig.getInstance().get("SERVER_PORT"),
  controllers: [
    /* your controllers */
  ],
});

await app.start();
```

### 3. Use in Services

Inject and use configuration in your services:

```typescript title="src/services/database.service.ts"
import { Service } from "bootifyjs";
import { AppConfig } from "bootifyjs";

@Service()
export class DatabaseService {
  private config = AppConfig.getInstance();

  async connect() {
    const url = this.config.get("DATABASE_URL");
    const poolSize = this.config.get("DATABASE_POOL_SIZE");

    // Connect to database with validated config
    console.log(`Connecting to ${url} with pool size ${poolSize}`);
  }
}
```

## Error Handling

The Config module provides clear error messages when validation fails:

```typescript
// Missing required variable
// Error: Configuration validation failed:
// - DATABASE_URL: Required

// Invalid type
// Error: Configuration validation failed:
// - SERVER_PORT: Expected number, received string

// Invalid format
// Error: Configuration validation failed:
// - DATABASE_URL: Invalid url
```

The application will exit immediately if configuration is invalid, preventing runtime errors.

## Configuration Best Practices

### 1. Use Environment-Specific Defaults

```typescript
const configSchema = z.object({
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default(process.env.NODE_ENV === "production" ? "info" : "debug"),
});
```

### 2. Group Related Configuration

```typescript
const configSchema = z.object({
  // Database group
  DB_HOST: z.string(),
  DB_PORT: z.coerce.number(),
  DB_NAME: z.string(),

  // Redis group
  REDIS_HOST: z.string(),
  REDIS_PORT: z.coerce.number(),

  // Email group
  SMTP_HOST: z.string(),
  SMTP_PORT: z.coerce.number(),
});
```

### 3. Use Transformations for Complex Logic

```typescript
const configSchema = z.object({
  ALLOWED_ORIGINS: z
    .string()
    .transform((val) => val.split(",").map((s) => s.trim())),

  FEATURE_FLAGS: z.string().transform((val) => JSON.parse(val)),
});
```

### 4. Validate Relationships Between Variables

```typescript
const configSchema = z
  .object({
    ENABLE_SSL: z.coerce.boolean(),
    SSL_CERT_PATH: z.string().optional(),
    SSL_KEY_PATH: z.string().optional(),
  })
  .refine(
    (data) => !data.ENABLE_SSL || (data.SSL_CERT_PATH && data.SSL_KEY_PATH),
    {
      message:
        "SSL_CERT_PATH and SSL_KEY_PATH required when ENABLE_SSL is true",
    }
  );
```

## API Reference

### AppConfig Class

```typescript
class AppConfig<T extends ZodRawShape> {
  // Initialize the singleton (call once at startup)
  static initialize<T>(schema: ZodObject<T>): void;

  // Get the singleton instance
  static getInstance<T>(): AppConfig<T>;

  // Get a single configuration value
  get<K>(key: K): ConfigValue;

  // Get all configuration values
  getAll(): ConfigObject;

  // Get the merged Zod schema
  getSchema(): AnyZodObject;
}
```

## Next Steps

- **[Schema Validation](./schema-validation.md)** - Learn advanced Zod validation techniques
- **[Environment Variables](./environment-variables.md)** - Best practices for managing env vars
- **[API Reference](../../api-reference/config-api.md)** - Complete API documentation

## Common Patterns

### Database Configuration

```typescript
const dbConfig = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MIN: z.coerce.number().min(0).default(2),
  DATABASE_POOL_MAX: z.coerce.number().min(1).default(10),
  DATABASE_SSL: z.coerce.boolean().default(false),
});
```

### Authentication Configuration

```typescript
const authConfig = z.object({
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("7d"),
  REFRESH_TOKEN_SECRET: z.string().min(32),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default("30d"),
});
```

### External Service Configuration

```typescript
const servicesConfig = z.object({
  STRIPE_API_KEY: z.string().startsWith("sk_"),
  SENDGRID_API_KEY: z.string(),
  AWS_REGION: z.string().default("us-east-1"),
  AWS_ACCESS_KEY_ID: z.string(),
  AWS_SECRET_ACCESS_KEY: z.string(),
});
```

## Troubleshooting

### Config Not Found Error

```typescript
// Error: User schema must be provided when creating the AppConfig instance
// Solution: Call AppConfig.initialize() before getInstance()
AppConfig.initialize(mySchema);
const config = AppConfig.getInstance();
```

### Type Errors

```typescript
// Error: Property 'MY_VAR' does not exist
// Solution: Add the variable to your schema
const schema = z.object({
  MY_VAR: z.string(),
});
```

### Validation Fails in Production

```typescript
// Solution: Use .env files or set environment variables
// Development: Create .env file
DATABASE_URL=postgresql://localhost:5432/mydb

// Production: Set in hosting platform
// Heroku: heroku config:set DATABASE_URL=...
// Docker: docker run -e DATABASE_URL=...
```
