# BootifyJS Logging Module

A flexible, extensible logging system using **Builder** and **Strategy** patterns that allows users to customize every aspect of logging.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      LoggerBuilder                          │
│  (Builder Pattern - Fluent configuration API)               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        ILogger                              │
│  (Strategy Pattern - Swappable implementations)             │
├─────────────────────────────────────────────────────────────┤
│  • BaseLogger (default)                                     │
│  • PinoAdapter (high-performance)                           │
│  • Custom implementations                                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     ILogTransport[]                         │
│  (Strategy Pattern - Multiple destinations)                 │
├─────────────────────────────────────────────────────────────┤
│  • ConsoleTransport (default)                               │
│  • FileTransport                                            │
│  • PostHogTransport                                         │
│  • Custom transports                                        │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Basic Usage

```typescript
import { createLogger } from "bootifyjs/logging";

const logger = createLogger()
  .setLevel("debug")
  .setServiceName("my-api")
  .build();

logger.info("Server started", { port: 3000 });
logger.error("Something failed", new Error("Oops"), { userId: "123" });
```

### With Request Context

```typescript
import { createLogger, RequestContextProvider } from "bootifyjs/logging";

const logger = createLogger()
  .setServiceName("my-api")
  .addContextProvider(new RequestContextProvider())
  .build();

// Logs will automatically include requestId, userId, etc.
logger.info("Processing request");
```

## Customization

### Custom Transport

Send logs to any destination by implementing `ILogTransport`:

```typescript
import { ILogTransport, LogEntry } from "bootifyjs/logging";

class DatadogTransport implements ILogTransport {
  readonly name = "datadog";

  constructor(private apiKey: string) {}

  async write(entry: LogEntry): Promise<void> {
    await fetch("https://http-intake.logs.datadoghq.com/v1/input", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "DD-API-KEY": this.apiKey,
      },
      body: JSON.stringify({
        message: entry.message,
        level: entry.level,
        timestamp: entry.timestamp.toISOString(),
        ...entry.context,
      }),
    });
  }

  async flush(): Promise<void> {
    // Flush any buffered logs
  }
}

// Use it
createLogger()
  .addTransport(new DatadogTransport(process.env.DD_API_KEY!))
  .build();
```

### Custom Context Provider

Add dynamic context to all logs:

```typescript
import { IContextProvider, LogContext } from "bootifyjs/logging";

class TenantContextProvider implements IContextProvider {
  getContext(): LogContext {
    // Get tenant from async local storage or wherever
    return {
      tenantId: getCurrentTenant()?.id,
      tenantName: getCurrentTenant()?.name,
    };
  }
}

createLogger().addContextProvider(new TenantContextProvider()).build();
```

### Custom Logger Implementation

Replace the entire logging implementation:

```typescript
import { ILogger, LogContext } from "bootifyjs/logging";

class WinstonLogger implements ILogger {
  private winston: any;

  constructor() {
    this.winston = require("winston").createLogger({
      // Winston config
    });
  }

  info(message: string, context?: LogContext): void {
    this.winston.info(message, context);
  }

  error(message: string, error?: Error, context?: LogContext): void {
    this.winston.error(message, { error, ...context });
  }

  // ... implement other methods

  child(bindings: LogContext): ILogger {
    const child = new WinstonLogger();
    // Configure child logger
    return child;
  }
}

// Use it
createLogger().useCustomLogger(WinstonLogger);
```

### Using Pino (High Performance)

```typescript
import { createLogger, PinoAdapter } from "bootifyjs/logging";
import path from "path";

// Simple Pino setup
const logger = createLogger().useCustomLogger(
  () =>
    new PinoAdapter({
      level: "info",
      serviceName: "my-api",
      prettyPrint: process.env.NODE_ENV !== "production",
    })
);

// Advanced Pino with custom transports
const logger = createLogger().useCustomLogger(
  () =>
    new PinoAdapter({
      level: "info",
      transports: [
        { target: "pino/file", options: {} },
        {
          target: path.join(__dirname, "my-transport.js"),
          options: { apiKey: "..." },
        },
      ],
    })
);
```

## Console Transport Options

```typescript
import { createLogger } from "bootifyjs/logging";

createLogger()
  .configureConsole({
    colorize: true, // Enable colors (auto-detected by default)
    prettyPrint: true, // Human-readable format
    timestampFormat: "iso", // 'iso' | 'unix' | 'locale'
  })
  .build();
```

## Log Levels

| Level | Value | Use Case                |
| ----- | ----- | ----------------------- |
| trace | 10    | Very detailed debugging |
| debug | 20    | Debugging information   |
| info  | 30    | General information     |
| warn  | 40    | Warning conditions      |
| error | 50    | Error conditions        |
| fatal | 60    | Critical failures       |

## Integration with BootifyApp

```typescript
import { createBootify } from 'bootifyjs'
import { createLogger, RequestContextProvider } from 'bootifyjs/logging'

// Configure logger before app starts
createLogger()
  .setLevel(process.env.LOG_LEVEL as any ?? 'info')
  .setServiceName('my-api')
  .addContextProvider(new RequestContextProvider())
  .setBaseContext({
    environment: process.env.NODE_ENV,
    version: process.env.APP_VERSION,
  })
  .build()

// Start app
await createBootify()
  .setPort(3000)
  .useControllers([...])
  .start()
```

## Graceful Shutdown

```typescript
import { getLogger } from "bootifyjs/logging";

process.on("SIGTERM", async () => {
  const logger = getLogger();
  if ("flush" in logger) {
    await (logger as any).flush();
  }
  if ("close" in logger) {
    await (logger as any).close();
  }
  process.exit(0);
});
```

## Best Practices

1. **Use structured logging** - Pass context objects instead of string interpolation

   ```typescript
   // Good
   logger.info("User logged in", { userId, email });

   // Avoid
   logger.info(`User ${userId} (${email}) logged in`);
   ```

2. **Use child loggers** for request-scoped logging

   ```typescript
   const requestLogger = logger.child({ requestId, userId });
   requestLogger.info("Processing payment");
   ```

3. **Configure log level via environment**

   ```typescript
   createLogger()
     .setLevel((process.env.LOG_LEVEL as LogLevel) ?? "info")
     .build();
   ```

4. **Use different transports per environment**

   ```typescript
   const builder = createLogger().setServiceName("my-api");

   if (process.env.NODE_ENV === "production") {
     builder.disableConsole();
     builder.addTransport(new CloudWatchTransport());
   }

   builder.build();
   ```
