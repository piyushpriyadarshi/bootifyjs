---
id: config-environment-variables
title: Environment Variables
sidebar_label: Environment Variables
description: Best practices for managing environment variables in BootifyJS applications
keywords: [bootifyjs, config, environment variables, env, dotenv, deployment]
---

# Environment Variables

Environment variables are the standard way to configure applications across different environments (development, staging, production). This guide covers best practices for managing environment variables in BootifyJS applications.

## What Are Environment Variables?

Environment variables are key-value pairs set in the operating system that your application can read at runtime. They allow you to:

- **Separate Configuration from Code**: Keep secrets out of version control
- **Environment-Specific Settings**: Different values for dev, staging, production
- **Security**: Store sensitive data like API keys and passwords securely
- **Flexibility**: Change configuration without code changes

## Using .env Files

### Development Setup

For local development, use a `.env` file in your project root:

```bash title=".env"
# Server Configuration
NODE_ENV=development
SERVER_PORT=3000
SERVER_HOST=localhost

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/myapp_dev
DATABASE_POOL_SIZE=10

# Redis
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_EXPIRES_IN=7d

# External Services
STRIPE_API_KEY=sk_test_your_test_key
SENDGRID_API_KEY=SG.your_sendgrid_key

# Feature Flags
ENABLE_SIGNUP=true
ENABLE_CACHE=true

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

### Loading .env Files

BootifyJS automatically loads `.env` files using the `dotenv` package. Make sure to load environment variables before initializing your config:

```typescript title="src/index.ts"
import "dotenv/config"; // Load .env file first
import { BootifyApp, AppConfig } from "bootifyjs";
import { appConfigSchema } from "./config/app.config";

// Now initialize config
AppConfig.initialize(appConfigSchema);

const app = new BootifyApp({
  port: AppConfig.getInstance().get("SERVER_PORT"),
  controllers: [
    /* ... */
  ],
});

await app.start();
```

### Multiple .env Files

Use different `.env` files for different environments:

```
.env                 # Default values (committed to git)
.env.local           # Local overrides (not committed)
.env.development     # Development environment
.env.test            # Test environment
.env.production      # Production environment (not committed)
```

Load the appropriate file based on `NODE_ENV`:

```typescript
import { config } from "dotenv";
import path from "path";

// Load environment-specific .env file
const envFile = `.env.${process.env.NODE_ENV || "development"}`;
config({ path: path.resolve(process.cwd(), envFile) });

// Also load .env.local for local overrides
config({ path: path.resolve(process.cwd(), ".env.local") });
```

## .env File Best Practices

### 1. Never Commit Secrets

Add sensitive `.env` files to `.gitignore`:

```bash title=".gitignore"
# Environment files with secrets
.env.local
.env.production
.env.*.local

# Keep .env.example for documentation
!.env.example
```

### 2. Provide an Example File

Create `.env.example` with dummy values:

```bash title=".env.example"
# Server Configuration
NODE_ENV=development
SERVER_PORT=3000
SERVER_HOST=localhost

# Database (replace with your values)
DATABASE_URL=postgresql://user:password@localhost:5432/myapp

# Authentication (generate secure keys)
JWT_SECRET=generate-a-secure-key-min-32-characters

# External Services (get from service providers)
STRIPE_API_KEY=sk_test_your_key_here
SENDGRID_API_KEY=your_key_here

# Feature Flags
ENABLE_SIGNUP=true
ENABLE_CACHE=true
```

### 3. Document Required Variables

Add comments explaining each variable:

```bash
# Database connection string
# Format: postgresql://user:password@host:port/database
# Example: postgresql://admin:secret@localhost:5432/myapp
DATABASE_URL=postgresql://localhost:5432/myapp

# JWT secret for signing tokens
# IMPORTANT: Must be at least 32 characters
# Generate with: openssl rand -base64 32
JWT_SECRET=your-secret-key-here

# Allowed CORS origins (comma-separated)
# Development: http://localhost:3000
# Production: https://yourdomain.com
ALLOWED_ORIGINS=http://localhost:3000
```

### 4. Use Consistent Naming

Follow a naming convention:

```bash
# Good: Descriptive, grouped, uppercase
DATABASE_URL=...
DATABASE_POOL_SIZE=10
DATABASE_SSL=true

REDIS_URL=...
REDIS_TTL=3600

AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

# Avoid: Inconsistent, unclear
db=...
redis-url=...
awsRegion=...
```

## Environment-Specific Configuration

### Development Environment

```bash title=".env.development"
NODE_ENV=development
SERVER_PORT=3000
LOG_LEVEL=debug

# Local services
DATABASE_URL=postgresql://localhost:5432/myapp_dev
REDIS_URL=redis://localhost:6379

# Test API keys
STRIPE_API_KEY=sk_test_...

# Relaxed security for development
JWT_EXPIRES_IN=30d
ENABLE_DEBUG=true
```

### Test Environment

```bash title=".env.test"
NODE_ENV=test
SERVER_PORT=3001
LOG_LEVEL=error

# Test database (separate from dev)
DATABASE_URL=postgresql://localhost:5432/myapp_test
REDIS_URL=redis://localhost:6379/1

# Fast expiration for tests
JWT_EXPIRES_IN=1h

# Disable external services in tests
STRIPE_API_KEY=sk_test_mock
SENDGRID_API_KEY=mock_key
```

### Production Environment

```bash title=".env.production"
NODE_ENV=production
SERVER_PORT=8080
LOG_LEVEL=info

# Production database (from hosting provider)
DATABASE_URL=postgresql://user:pass@prod-db.example.com:5432/myapp
DATABASE_SSL=true
DATABASE_POOL_SIZE=20

# Production Redis
REDIS_URL=redis://prod-redis.example.com:6379

# Real API keys (from secure storage)
STRIPE_API_KEY=sk_live_...
SENDGRID_API_KEY=SG.live...

# Production security
JWT_EXPIRES_IN=7d
ENABLE_DEBUG=false

# Production CORS
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

## Deployment Strategies

### Heroku

Set environment variables using the CLI:

```bash
# Set individual variables
heroku config:set DATABASE_URL=postgresql://...
heroku config:set JWT_SECRET=your-secret

# Set multiple variables from file
heroku config:set $(cat .env.production | sed '/^#/d' | sed '/^$/d')

# View current config
heroku config

# Unset a variable
heroku config:unset VARIABLE_NAME
```

Or use the Heroku dashboard: Settings → Config Vars

### Docker

Pass environment variables to containers:

```bash
# Using -e flag
docker run -e DATABASE_URL=postgresql://... -e JWT_SECRET=secret myapp

# Using --env-file
docker run --env-file .env.production myapp
```

In `docker-compose.yml`:

```yaml
version: "3.8"
services:
  app:
    build: .
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://db:5432/myapp
    env_file:
      - .env.production
    ports:
      - "3000:3000"
```

### Kubernetes

Use ConfigMaps for non-sensitive data:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  NODE_ENV: production
  SERVER_PORT: "3000"
  LOG_LEVEL: info
```

Use Secrets for sensitive data:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
type: Opaque
stringData:
  DATABASE_URL: postgresql://...
  JWT_SECRET: your-secret-key
```

Reference in deployment:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  template:
    spec:
      containers:
        - name: app
          image: myapp:latest
          envFrom:
            - configMapRef:
                name: app-config
            - secretRef:
                name: app-secrets
```

### AWS (Elastic Beanstalk, ECS, Lambda)

**Elastic Beanstalk:**

```bash
# Using EB CLI
eb setenv DATABASE_URL=postgresql://... JWT_SECRET=secret

# Or in .ebextensions/environment.config
option_settings:
  aws:elasticbeanstalk:application:environment:
    NODE_ENV: production
    SERVER_PORT: 8080
```

**ECS Task Definition:**

```json
{
  "containerDefinitions": [
    {
      "environment": [
        { "name": "NODE_ENV", "value": "production" },
        { "name": "SERVER_PORT", "value": "3000" }
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:region:account:secret:db-url"
        }
      ]
    }
  ]
}
```

**Lambda:**

```bash
# Using AWS CLI
aws lambda update-function-configuration \
  --function-name myapp \
  --environment Variables={NODE_ENV=production,DATABASE_URL=postgresql://...}
```

### Vercel / Netlify

**Vercel:**

```bash
# Using Vercel CLI
vercel env add DATABASE_URL production
vercel env add JWT_SECRET production

# Or in project settings on vercel.com
```

**Netlify:**

```bash
# Using Netlify CLI
netlify env:set DATABASE_URL postgresql://...
netlify env:set JWT_SECRET your-secret

# Or in Site settings → Environment variables
```

## Security Best Practices

### 1. Never Hardcode Secrets

```typescript
// ❌ Bad: Hardcoded secret
const jwtSecret = "my-secret-key";

// ✅ Good: From environment variable
const jwtSecret = config.get("JWT_SECRET");
```

### 2. Use Strong Secrets

Generate secure random keys:

```bash
# Generate 32-byte random key (base64)
openssl rand -base64 32

# Generate 64-byte random key (hex)
openssl rand -hex 64

# Generate UUID
uuidgen
```

### 3. Rotate Secrets Regularly

```bash
# Update secrets periodically
# 1. Generate new secret
NEW_SECRET=$(openssl rand -base64 32)

# 2. Update in production
heroku config:set JWT_SECRET=$NEW_SECRET

# 3. Restart application
heroku restart
```

### 4. Use Secret Management Services

For production, use dedicated secret management:

- **AWS Secrets Manager**: Store and rotate secrets
- **HashiCorp Vault**: Centralized secret management
- **Azure Key Vault**: Microsoft's secret storage
- **Google Secret Manager**: GCP secret storage

Example with AWS Secrets Manager:

```typescript
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

async function getSecret(secretName: string) {
  const client = new SecretsManagerClient({ region: "us-east-1" });
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: secretName })
  );
  return JSON.parse(response.SecretString!);
}

// Load secrets at startup
const secrets = await getSecret("myapp/production");
process.env.DATABASE_URL = secrets.DATABASE_URL;
process.env.JWT_SECRET = secrets.JWT_SECRET;
```

### 5. Limit Access

- Use principle of least privilege
- Different secrets for different environments
- Audit who has access to production secrets
- Use role-based access control (RBAC)

## Validation and Type Safety

Use Zod to validate environment variables:

```typescript
import { z } from "zod";

const configSchema = z.object({
  // Validate URL format
  DATABASE_URL: z.string().url(),

  // Validate minimum length for secrets
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),

  // Validate enum values
  NODE_ENV: z.enum(["development", "test", "production"]),

  // Validate number ranges
  SERVER_PORT: z.coerce.number().min(1).max(65535),

  // Validate email format
  ADMIN_EMAIL: z.string().email(),

  // Validate array of URLs
  ALLOWED_ORIGINS: z
    .string()
    .transform((val) => val.split(","))
    .pipe(z.array(z.string().url())),
});

// This will fail fast if any validation fails
AppConfig.initialize(configSchema);
```

## Troubleshooting

### Variable Not Found

```typescript
// Error: Configuration validation failed: DATABASE_URL: Required

// Solutions:
// 1. Check .env file exists and is loaded
// 2. Verify variable name matches exactly (case-sensitive)
// 3. Ensure dotenv is loaded before AppConfig.initialize()
```

### Variable Has Wrong Type

```typescript
// Error: Expected number, received nan

// Solutions:
// 1. Use z.coerce.number() to convert strings
// 2. Check the value is actually a number: PORT=3000 not PORT=abc
// 3. Verify no extra spaces: PORT=3000 not PORT= 3000
```

### .env File Not Loading

```typescript
// Check if dotenv is installed
npm install dotenv

// Load explicitly at the top of your entry file
import 'dotenv/config';

// Or with custom path
import { config } from 'dotenv';
config({ path: '.env.production' });
```

### Different Values in Different Environments

```typescript
// Use environment-specific files
const envFile = `.env.${process.env.NODE_ENV}`;
config({ path: envFile });

// Or use a package like dotenv-flow
npm install dotenv-flow
import 'dotenv-flow/config';
```

## Testing with Environment Variables

### Mock Environment Variables in Tests

```typescript
describe("Config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
  });

  it("should load config with valid env vars", () => {
    process.env.DATABASE_URL = "postgresql://localhost:5432/test";
    process.env.JWT_SECRET = "test-secret-key-min-32-characters";

    AppConfig.initialize(configSchema);
    const config = AppConfig.getInstance();

    expect(config.get("DATABASE_URL")).toBe("postgresql://localhost:5432/test");
  });

  it("should fail with invalid env vars", () => {
    process.env.DATABASE_URL = "invalid-url";

    expect(() => {
      AppConfig.initialize(configSchema);
    }).toThrow("Configuration validation failed");
  });
});
```

### Use Test-Specific .env

```bash title=".env.test"
NODE_ENV=test
DATABASE_URL=postgresql://localhost:5432/myapp_test
REDIS_URL=redis://localhost:6379/1
JWT_SECRET=test-secret-key-for-testing-only
```

Load in test setup:

```typescript title="tests/setup.ts"
import { config } from "dotenv";
config({ path: ".env.test" });
```

## Quick Reference

### Common Environment Variables

```bash
# Application
NODE_ENV=development|test|production
SERVER_PORT=3000
SERVER_HOST=localhost
LOG_LEVEL=debug|info|warn|error

# Database
DATABASE_URL=postgresql://user:pass@host:port/db
DATABASE_POOL_SIZE=10
DATABASE_SSL=true|false

# Cache
REDIS_URL=redis://host:port
REDIS_TTL=3600

# Authentication
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d
REFRESH_TOKEN_SECRET=your-refresh-secret
REFRESH_TOKEN_EXPIRES_IN=30d

# External Services
STRIPE_API_KEY=sk_test_...
SENDGRID_API_KEY=SG...
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

# CORS
ALLOWED_ORIGINS=http://localhost:3000,https://example.com

# Feature Flags
ENABLE_SIGNUP=true|false
ENABLE_CACHE=true|false
```

## Next Steps

- **[Schema Validation](./schema-validation.md)** - Advanced Zod validation techniques
- **[Config Overview](./overview.md)** - Back to Config module overview
- **[API Reference](../../api-reference/config-api.md)** - Complete API documentation
