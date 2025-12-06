---
id: config-api
title: Config API Reference
sidebar_label: Config API
description: Complete reference for BootifyJS configuration system classes and methods
keywords: [bootifyjs, config, api, reference, environment, validation]
---

# Config API Reference

This page documents the configuration system classes and methods for type-safe, validated configuration management in BootifyJS applications.

## Core Configuration

### AppConfig

Singleton configuration manager with Zod schema validation.

#### Static Methods

##### getInstance()

Gets the singleton instance of AppConfig.

**Signature:**

```typescript
static getInstance<T extends ZodRawShape>(userSchema?: ZodObject<T>): AppConfig<T>
```

**Parameters:**

- `userSchema` (optional): User configuration schema (required on first call)

**Returns:**

- AppConfig instance

**Throws:**

- Error if called without schema before initialization

**Example:**

```typescript
import { AppConfig } from "bootifyjs";
import { z } from "zod";

// Define your application schema
const UserConfigSchema = z.object({
  DATABASE_URL: z.string().url(),
  API_KEY: z.string().min(32),
  MAX_CONNECTIONS: z.coerce.number().default(10),
});

// Get instance (first call requires schema)
const config = AppConfig.getInstance(UserConfigSchema);

// Subsequent calls don't need schema
const config2 = AppConfig.getInstance();
```

---

##### initialize()

Initializes the singleton instance explicitly.

**Signature:**

```typescript
static initialize<T extends ZodRawShape>(userSchema: ZodObject<T>): void
```

**Parameters:**

- `userSchema`: User configuration schema

**Example:**

```typescript
import { AppConfig } from "bootifyjs";
import { z } from "zod";

const UserConfigSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
});

// Initialize once at application startup
AppConfig.initialize(UserConfigSchema);

// Use anywhere in your application
const config = AppConfig.getInstance();
```

---

#### Instance Methods

##### get()

Gets a configuration value by key.

**Signature:**

```typescript
get<K extends keyof (FrameworkConfig & z.infer<ZodObject<T>>)>(
  key: K
): (FrameworkConfig & z.infer<ZodObject<T>>)[K]
```

**Parameters:**

- `key`: Configuration key to retrieve

**Returns:**

- Configuration value

**Example:**

```typescript
const config = AppConfig.getInstance();

// Framework configuration
const port = config.get("SERVER_PORT"); // number
const env = config.get("NODE_ENV"); // 'development' | 'production' | 'test'
const logLevel = config.get("LOG_LEVEL"); // 'debug' | 'info' | 'warn' | 'error'

// User configuration
const databaseUrl = config.get("DATABASE_URL"); // string
const maxConnections = config.get("MAX_CONNECTIONS"); // number
```

---

##### getAll()

Gets the entire configuration object.

**Signature:**

```typescript
getAll(): FrameworkConfig & z.infer<ZodObject<T>>
```

**Returns:**

- Complete configuration object

**Example:**

```typescript
const config = AppConfig.getInstance();
const allConfig = config.getAll();

console.log("All configuration:", allConfig);
```

---

##### getSchema()

Gets the merged Zod schema for introspection.

**Signature:**

```typescript
getSchema(): AnyZodObject
```

**Returns:**

- Zod schema object

**Example:**

```typescript
const config = AppConfig.getInstance();
const schema = config.getSchema();

// Inspect schema shape
console.log("Schema keys:", Object.keys(schema.shape));
```

---

## Framework Configuration

### FrameworkConfigSchema

Built-in framework configuration schema.

**Definition:**

```typescript
const FrameworkConfigSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  SERVER_PORT: z.coerce.number().default(4000),
  SERVER_HOST: z.string().default("localhost"),
  CONFIG_DEBUG: z.coerce.boolean().default(true),
});
```

**Properties:**

- `NODE_ENV`: Application environment
- `SERVER_PORT`: Server port number
- `SERVER_HOST`: Server host address
- `CONFIG_DEBUG`: Enable configuration debug logging

---

### LoggingConfigSchema

Built-in logging configuration schema.

**Definition:**

```typescript
const LoggingConfigSchema = z.object({
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("debug"),
  SERVICE_NAME: z.string().default("bootifyjs-app"),

  CLICKHOUSE_ENABLED: z.boolean().default(true),
  CLICKHOUSE_URL: z.string().url().default("http://localhost:8123"),
  CLICKHOUSE_USER: z.string().default("default"),
  CLICKHOUSE_PASSWORD: z.string().default(""),
  CLICKHOUSE_DB: z.string().default("default"),
});
```

**Properties:**

- `LOG_LEVEL`: Logging level
- `SERVICE_NAME`: Service name for logs
- `CLICKHOUSE_ENABLED`: Enable ClickHouse logging
- `CLICKHOUSE_URL`: ClickHouse server URL
- `CLICKHOUSE_USER`: ClickHouse username
- `CLICKHOUSE_PASSWORD`: ClickHouse password
- `CLICKHOUSE_DB`: ClickHouse database name

---

## Types

### FrameworkConfig

Type representing the framework configuration.

**Definition:**

```typescript
type FrameworkConfig = z.infer<typeof FrameworkConfigSchema>;
```

**Example:**

```typescript
import { FrameworkConfig } from "bootifyjs";

const config: FrameworkConfig = {
  NODE_ENV: "production",
  SERVER_PORT: 3000,
  SERVER_HOST: "0.0.0.0",
  CONFIG_DEBUG: false,
  LOG_LEVEL: "info",
  SERVICE_NAME: "my-api",
  CLICKHOUSE_ENABLED: true,
  CLICKHOUSE_URL: "http://clickhouse:8123",
  CLICKHOUSE_USER: "default",
  CLICKHOUSE_PASSWORD: "",
  CLICKHOUSE_DB: "logs",
};
```

---

## Usage Examples

### Basic Configuration

```typescript
import { AppConfig } from "bootifyjs";
import { z } from "zod";

// Define your configuration schema
const UserConfigSchema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_SIZE: z.coerce.number().default(10),
  REDIS_URL: z.string().url(),
  API_KEY: z.string().min(32),
  FEATURE_FLAGS: z
    .object({
      enableNewUI: z.coerce.boolean().default(false),
      enableBetaFeatures: z.coerce.boolean().default(false),
    })
    .default({}),
});

// Initialize configuration
AppConfig.initialize(UserConfigSchema);

// Use configuration
const config = AppConfig.getInstance();

const databaseUrl = config.get("DATABASE_URL");
const poolSize = config.get("DATABASE_POOL_SIZE");
const redisUrl = config.get("REDIS_URL");
```

---

### Environment-Specific Configuration

```typescript
import { AppConfig } from "bootifyjs";
import { z } from "zod";

const UserConfigSchema = z.object({
  DATABASE_URL: z.string().url(),
  CACHE_TTL: z.coerce.number().default(300),
  ENABLE_METRICS: z.coerce.boolean().default(false),
});

AppConfig.initialize(UserConfigSchema);
const config = AppConfig.getInstance();

// Different behavior based on environment
const env = config.get("NODE_ENV");

if (env === "production") {
  // Production-specific logic
  const metricsEnabled = config.get("ENABLE_METRICS");
  if (metricsEnabled) {
    // Initialize metrics
  }
} else if (env === "development") {
  // Development-specific logic
  const debugEnabled = config.get("CONFIG_DEBUG");
  if (debugEnabled) {
    console.log("Configuration:", config.getAll());
  }
}
```

---

### Configuration with Transformations

```typescript
import { AppConfig } from "bootifyjs";
import { z } from "zod";

const UserConfigSchema = z.object({
  // Transform comma-separated string to array
  ALLOWED_ORIGINS: z
    .string()
    .transform((val) => val.split(",").map((s) => s.trim()))
    .default("http://localhost:3000"),

  // Transform string to number with validation
  MAX_FILE_SIZE_MB: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().min(1).max(100))
    .default("10"),

  // Complex nested configuration
  DATABASE: z
    .object({
      host: z.string().default("localhost"),
      port: z.coerce.number().default(5432),
      name: z.string(),
      ssl: z.coerce.boolean().default(false),
    })
    .transform((val) => ({
      ...val,
      connectionString: `postgresql://${val.host}:${val.port}/${val.name}`,
    })),
});

AppConfig.initialize(UserConfigSchema);
const config = AppConfig.getInstance();

const allowedOrigins = config.get("ALLOWED_ORIGINS"); // string[]
const maxFileSize = config.get("MAX_FILE_SIZE_MB"); // number
const database = config.get("DATABASE"); // includes connectionString
```

---

### Configuration in Services

```typescript
import { Service, Autowired } from "bootifyjs";
import { AppConfig } from "bootifyjs";

@Service()
export class DatabaseService {
  private config = AppConfig.getInstance();

  async connect() {
    const url = this.config.get("DATABASE_URL");
    const poolSize = this.config.get("DATABASE_POOL_SIZE");

    console.log(`Connecting to database with pool size ${poolSize}`);
    // Connect to database
  }
}

@Service()
export class CacheService {
  private config = AppConfig.getInstance();

  async initialize() {
    const redisUrl = this.config.get("REDIS_URL");
    const ttl = this.config.get("CACHE_TTL");

    console.log(`Initializing cache with TTL ${ttl}s`);
    // Initialize cache
  }
}
```

---

### Configuration Validation

```typescript
import { AppConfig } from "bootifyjs";
import { z } from "zod";

const UserConfigSchema = z
  .object({
    // Required field
    DATABASE_URL: z.string().url(),

    // Optional with default
    DATABASE_POOL_SIZE: z.coerce.number().min(1).max(100).default(10),

    // Enum validation
    LOG_FORMAT: z.enum(["json", "pretty"]).default("json"),

    // Custom validation
    API_KEY: z
      .string()
      .refine((val) => val.length >= 32, {
        message: "API key must be at least 32 characters",
      }),

    // Conditional validation
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
  })
  .refine(
    (data) => {
      // If any SMTP field is provided, all must be provided
      const smtpFields = [
        data.SMTP_HOST,
        data.SMTP_PORT,
        data.SMTP_USER,
        data.SMTP_PASSWORD,
      ];
      const providedCount = smtpFields.filter((f) => f !== undefined).length;
      return providedCount === 0 || providedCount === 4;
    },
    { message: "All SMTP fields must be provided together" }
  );

try {
  AppConfig.initialize(UserConfigSchema);
  console.log("Configuration validated successfully");
} catch (error) {
  console.error("Configuration validation failed:", error);
  process.exit(1);
}
```

---

### Configuration with Secrets

```typescript
import { AppConfig } from "bootifyjs";
import { z } from "zod";

const UserConfigSchema = z.object({
  // Public configuration
  APP_NAME: z.string().default("My App"),
  APP_VERSION: z.string().default("1.0.0"),

  // Sensitive configuration
  DATABASE_PASSWORD: z.string(),
  JWT_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().length(32),

  // API keys
  STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
  SENDGRID_API_KEY: z.string(),
});

AppConfig.initialize(UserConfigSchema);
const config = AppConfig.getInstance();

// Access secrets securely
const dbPassword = config.get("DATABASE_PASSWORD");
const jwtSecret = config.get("JWT_SECRET");

// Note: Sensitive values are automatically redacted in debug logs
```

---

## Best Practices

### Schema Organization

Organize your configuration schema logically:

```typescript
import { z } from "zod";

// Database configuration
const DatabaseConfigSchema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_SIZE: z.coerce.number().default(10),
  DATABASE_TIMEOUT: z.coerce.number().default(30000),
});

// Cache configuration
const CacheConfigSchema = z.object({
  REDIS_URL: z.string().url(),
  CACHE_TTL: z.coerce.number().default(300),
  CACHE_PREFIX: z.string().default("app:"),
});

// API configuration
const ApiConfigSchema = z.object({
  API_KEY: z.string().min(32),
  API_RATE_LIMIT: z.coerce.number().default(100),
  API_TIMEOUT: z.coerce.number().default(5000),
});

// Merge all schemas
const UserConfigSchema =
  DatabaseConfigSchema.merge(CacheConfigSchema).merge(ApiConfigSchema);

AppConfig.initialize(UserConfigSchema);
```

---

### Environment Files

Use `.env` files for different environments:

```bash
# .env.development
NODE_ENV=development
SERVER_PORT=4000
LOG_LEVEL=debug
DATABASE_URL=postgresql://localhost:5432/myapp_dev
REDIS_URL=redis://localhost:6379

# .env.production
NODE_ENV=production
SERVER_PORT=3000
LOG_LEVEL=info
DATABASE_URL=postgresql://prod-db:5432/myapp
REDIS_URL=redis://prod-redis:6379
```

Load the appropriate file:

```typescript
import dotenv from "dotenv";
import path from "path";

// Load environment-specific .env file
const envFile = `.env.${process.env.NODE_ENV || "development"}`;
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

// Initialize configuration
AppConfig.initialize(UserConfigSchema);
```

---

### Type Safety

Leverage TypeScript for type-safe configuration access:

```typescript
import { AppConfig } from "bootifyjs";
import { z } from "zod";

const UserConfigSchema = z.object({
  DATABASE_URL: z.string().url(),
  MAX_CONNECTIONS: z.coerce.number(),
});

type UserConfig = z.infer<typeof UserConfigSchema>;

AppConfig.initialize(UserConfigSchema);
const config = AppConfig.getInstance<typeof UserConfigSchema.shape>();

// TypeScript knows the exact type
const dbUrl: string = config.get("DATABASE_URL");
const maxConn: number = config.get("MAX_CONNECTIONS");

// TypeScript error: Property doesn't exist
// const invalid = config.get('INVALID_KEY');
```

---

### Default Values

Provide sensible defaults:

```typescript
const UserConfigSchema = z.object({
  // Required in production, optional in development
  DATABASE_URL: z
    .string()
    .url()
    .default(
      process.env.NODE_ENV === "production"
        ? "" // Will fail validation if not provided
        : "postgresql://localhost:5432/myapp_dev"
    ),

  // Different defaults per environment
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error"])
    .default(process.env.NODE_ENV === "production" ? "info" : "debug"),

  // Feature flags with defaults
  FEATURE_NEW_UI: z.coerce.boolean().default(false),
  FEATURE_BETA: z.coerce.boolean().default(false),
});
```

---

### Configuration Validation on Startup

Validate configuration early:

```typescript
import { AppConfig } from "bootifyjs";
import { z } from "zod";

const UserConfigSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  API_KEY: z.string().min(32),
});

try {
  // This will throw if validation fails
  AppConfig.initialize(UserConfigSchema);

  const config = AppConfig.getInstance();
  console.log("✓ Configuration validated successfully");

  // Start application
  await startApplication();
} catch (error) {
  console.error("✗ Configuration validation failed:");
  console.error(error);
  process.exit(1);
}
```

---

## See Also

- [Config Module Overview](../modules/config/overview.md)
- [Schema Validation Guide](../modules/config/schema-validation.md)
- [Environment Variables Guide](../modules/config/environment-variables.md)
- [Zod Documentation](https://zod.dev/)
