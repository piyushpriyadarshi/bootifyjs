---
id: logging-overview
title: Logging Overview
sidebar_label: Overview
---

# Logging Module

The Logging module provides a powerful, structured logging system for BootifyJS applications, built on top of [Pino](https://getpino.io/) with additional features for request context tracking, distributed tracing, and advanced log management.

## Features

### Structured Logging

All logs are output in JSON format, making them easy to parse, search, and analyze with modern log aggregation tools.

```json
{
  "level": "info",
  "timestamp": "2023-05-15T12:34:56.789Z",
  "message": "User created successfully",
  "userId": "user-123",
  "service": "bootifyjs-app"
}
```

### Log Levels

The logger supports six log levels in order of increasing severity:

- **trace**: Most verbose, detailed debugging information
- **debug**: Debugging information for development
- **info**: Informational messages about normal operations
- **warn**: Warning messages for potentially harmful situations
- **error**: Error conditions that need attention
- **fatal**: Critical conditions that may cause application failure

### Request Context Integration

When used with BootifyJS's request context middleware, logs automatically include request-specific information like request ID, trace ID, user ID, and more.

### Multiple Transport Options

Send logs to multiple destinations simultaneously:

- **Console**: Standard output for development
- **File**: Write logs to files
- **ClickHouse**: High-performance columnar database for log analytics
- **PostHog**: Product analytics and session replay platform

### Specialized Log Types

The logging module supports different log types for different purposes:

- **Application Logs**: General application logging
- **Access Logs**: HTTP request/response logging
- **Audit Logs**: Security and compliance audit trails
- **Event Logs**: Business event tracking
- **Span Logs**: Distributed tracing spans

## Quick Start

### Basic Usage

```typescript
import { Service, Autowired } from "bootifyjs/core";
import { Logger } from "bootifyjs/logging";

@Service()
export class UserService {
  constructor(@Autowired() private logger: Logger) {}

  async createUser(userData: any) {
    this.logger.info("Creating new user", { email: userData.email });

    try {
      const user = await this.saveUser(userData);
      this.logger.debug("User created successfully", { userId: user.id });
      return user;
    } catch (error) {
      this.logger.error("Failed to create user", error, {
        email: userData.email,
      });
      throw error;
    }
  }
}
```

### Configuration

Configure logging through environment variables:

```env
# Log level (trace, debug, info, warn, error, fatal)
LOG_LEVEL=info

# Service name for log identification
SERVICE_NAME=my-api

# ClickHouse logging (optional)
CLICKHOUSE_ENABLED=true
CLICKHOUSE_URL=http://clickhouse:8123
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=password
CLICKHOUSE_DB=logs

# PostHog logging (optional)
POSTHOG_LOGGING_ENABLED=true
POSTHOG_API_KEY=your-api-key
POSTHOG_HOST=https://us.i.posthog.com
```

## Architecture

The logging module is built on several key components:

### Logger Service

The main `Logger` class provides the primary logging interface. It's automatically available through dependency injection.

### Logger Provider

The `loggerFactory` creates and configures the underlying Pino logger instance with transports and options.

### Request Context Mixin

Automatically includes request context information in all logs when available through AsyncLocalStorage.

### Transports

Pluggable transport modules send logs to different destinations:

- **Console Transport**: Built-in Pino transport
- **ClickHouse Transport**: Custom transport for ClickHouse database
- **PostHog Transport**: Custom transport for PostHog analytics

## Use Cases

### Development

Use debug and trace levels to understand application flow:

```typescript
this.logger.debug("Processing payment", {
  paymentId: payment.id,
  amount: payment.amount,
});
```

### Production Monitoring

Track important events and errors:

```typescript
this.logger.info("Payment processed", {
  paymentId: payment.id,
  status: "success",
});

this.logger.error("Payment failed", error, {
  paymentId: payment.id,
  reason: error.message,
});
```

### Audit Trails

Create compliance-ready audit logs:

```typescript
this.logger.audit({
  action: "user.delete",
  resource: "User",
  resourceId: userId,
  userId: currentUser.id,
  username: currentUser.username,
});
```

### Performance Tracking

Log performance metrics:

```typescript
const startTime = Date.now();
// ... operation ...
const duration = Date.now() - startTime;

this.logger.info("Operation completed", {
  operation: "data-export",
  duration,
  recordCount: records.length,
});
```

## Next Steps

- [Basic Usage](./basic-usage.md) - Learn the core logging methods
- [Context Logging](./context-logging.md) - Understand request context integration
- [Transports](./transports.md) - Configure ClickHouse and PostHog transports
