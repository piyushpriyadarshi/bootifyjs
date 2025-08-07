# Logging Module

The Logging module provides a structured logging system for the Bootify framework, built on top of Pino with additional features for request context tracking and log management.

## Features

- **Structured Logging**: JSON-formatted logs for better parsing
- **Log Levels**: Different log levels for development and production
- **Request Context**: Automatic inclusion of request context in logs
- **Transport Options**: Console, file, and ClickHouse transports
- **Startup Logging**: Special formatting for application startup logs

## Usage

### Basic Logging

```typescript
import { Logger } from 'bootify/logging';
import { Service, Autowired } from 'bootify/core';

@Service()
export class UserService {
  constructor(@Autowired() private logger: Logger) {}
  
  async createUser(userData: any) {
    this.logger.info('Creating new user', { email: userData.email });
    
    try {
      // User creation logic
      const user = { id: 'user-123', ...userData };
      
      this.logger.debug('User created successfully', { userId: user.id });
      return user;
    } catch (error) {
      this.logger.error('Failed to create user', { 
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}
```

### Log Levels

The logger supports the following log levels (in order of increasing severity):

```typescript
import { Logger } from 'bootify/logging';
import { Service, Autowired } from 'bootify/core';

@Service()
export class LogExample {
  constructor(@Autowired() private logger: Logger) {}
  
  demonstrateLevels() {
    this.logger.trace('Detailed debugging information'); // Most verbose
    this.logger.debug('Debugging information');
    this.logger.info('Informational messages');
    this.logger.warn('Warning messages');
    this.logger.error('Error conditions');
    this.logger.fatal('Critical conditions'); // Most severe
  }
}
```

### Logging with Request Context

When used with the request context middleware, logs automatically include request information:

```typescript
import { Controller, Get } from 'bootify/core';
import { Logger } from 'bootify/logging';

@Controller('/api')
export class ApiController {
  constructor(private logger: Logger) {}
  
  @Get('/data')
  getData(request: FastifyRequest) {
    // The log will automatically include request ID, path, and other context
    this.logger.info('Processing data request');
    
    return { data: 'example' };
  }
}
```

Example log output:
```json
{
  "level": "info",
  "time": "2023-05-15T12:34:56.789Z",
  "pid": 1234,
  "hostname": "server",
  "requestId": "req-123",
  "path": "/api/data",
  "method": "GET",
  "message": "Processing data request",
  "service": "bootifyjs-app"
}
```

### Custom Log Formatting

```typescript
import { Logger } from 'bootify/logging';
import { Service, Autowired } from 'bootify/core';

@Service()
export class PaymentService {
  constructor(@Autowired() private logger: Logger) {}
  
  processPayment(paymentData: any) {
    // Create a child logger with additional context
    const paymentLogger = this.logger.child({
      paymentId: paymentData.id,
      amount: paymentData.amount,
      currency: paymentData.currency
    });
    
    paymentLogger.info('Starting payment processing');
    
    // All subsequent logs will include the payment context
    // ...
    
    paymentLogger.info('Payment processed successfully');
  }
}
```

## Configuration

Logging can be configured through environment variables:

```env
# Log level (trace, debug, info, warn, error, fatal)
LOG_LEVEL=debug

# Service name for log identification
SERVICE_NAME=my-api

# ClickHouse logging (optional)
CLICKHOUSE_ENABLED=true
CLICKHOUSE_URL=http://clickhouse:8123
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=password
CLICKHOUSE_DB=logs
```

## API Reference

### Logger Methods

- `trace(msg, ...args)`: Log at trace level
- `debug(msg, ...args)`: Log at debug level
- `info(msg, ...args)`: Log at info level
- `warn(msg, ...args)`: Log at warn level
- `error(msg, ...args)`: Log at error level
- `fatal(msg, ...args)`: Log at fatal level
- `child(bindings)`: Create a child logger with additional context