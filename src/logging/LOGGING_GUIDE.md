# BootifyJS Logging Module

A flexible, extensible logging system using **Builder** and **Strategy** patterns. The core module has **NO external logging library dependencies** - users provide their own logger implementations.

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
│  (Strategy Pattern - User provides implementation)          │
├─────────────────────────────────────────────────────────────┤
│  • BaseLogger (built-in, no external deps)                  │
│  • User's PinoAdapter                                       │
│  • User's WinstonAdapter                                    │
│  • Any custom implementation                                │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Option 1: Use Built-in BaseLogger (No External Dependencies)

```typescript
import { createLogger } from "bootifyjs/logging";

const logger = createLogger()
  .setLevel("debug")
  .setServiceName("my-api")
  .configureConsole({ colorize: true, prettyPrint: true })
  .build();

logger.info("Server started", { port: 3000 });
```

### Option 2: Use Your Own Logger (Pino, Winston, etc.)

Create an adapter that implements `ILogger`:

```typescript
// my-pino-adapter.ts
import pino from "pino";
import { ILogger, LogContext } from "bootifyjs/logging";

export class MyPinoAdapter implements ILogger {
  private logger: pino.Logger;

  constructor(options: { level?: string; prettyPrint?: boolean } = {}) {
    this.logger = pino({
      level: options.level ?? "info",
      transport: options.prettyPrint
        ? {
            target: "pino-pretty",
            options: { colorize: true },
          }
        : undefined,
    });
  }

  trace(message: string, context?: LogContext): void {
    this.logger.trace(context ?? {}, message);
  }

  debug(message: string, context?: LogContext): void {
    this.logger.debug(context ?? {}, message);
  }

  info(message: string, context?: LogContext): void {
    this.logger.info(context ?? {}, message);
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(context ?? {}, message);
  }

  error(message: string, error?: Error, context?: LogContext): void {
    this.logger.error({ ...context, err: error }, message);
  }

  fatal(message: string, error?: Error, context?: LogContext): void {
    this.logger.fatal({ ...context, err: error }, message);
  }

  child(bindings: LogContext): ILogger {
    const child = new MyPinoAdapter();
    (child as any).logger = this.logger.child(bindings);
    return child;
  }
}
```

Then use it:

```typescript
import { createLogger } from "bootifyjs/logging";
import { MyPinoAdapter } from "./my-pino-adapter";

createLogger()
  .use(new MyPinoAdapter({ level: "debug", prettyPrint: true }))
  .build();
```

## ILogger Interface

Any logger you provide must implement this interface:

```typescript
interface ILogger {
  trace(message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: Error, context?: LogContext): void;
  fatal(message: string, error?: Error, context?: LogContext): void;
  child(bindings: LogContext): ILogger;
}

type LogContext = Record<string, any>;
```

## Using with BootifyApp

```typescript
import { createBootify } from "bootifyjs";
import { MyPinoAdapter } from "./my-pino-adapter";

createBootify()
  .setServiceName("my-api")
  .useLogger((builder) =>
    builder.use(
      new MyPinoAdapter({
        level: process.env.LOG_LEVEL || "info",
        prettyPrint: process.env.NODE_ENV !== "production",
      })
    )
  )
  .start();
```

## Custom Transports (for BaseLogger)

If using the built-in BaseLogger, you can add custom transports:

```typescript
import { ILogTransport, LogEntry, createLogger } from "bootifyjs/logging";

class DatadogTransport implements ILogTransport {
  readonly name = "datadog";

  async write(entry: LogEntry): Promise<void> {
    await fetch("https://http-intake.logs.datadoghq.com/v1/input", {
      method: "POST",
      headers: { "DD-API-KEY": process.env.DD_API_KEY! },
      body: JSON.stringify({
        message: entry.message,
        level: entry.level,
        ...entry.context,
      }),
    });
  }
}

createLogger().addTransport(new DatadogTransport()).build();
```

## Getting the Logger

```typescript
import { getLogger } from "bootifyjs/logging";

// After createLogger().build() or createBootify().build()
const logger = getLogger();
logger.info("Hello world");
```

## Log Levels

| Level | Use Case                |
| ----- | ----------------------- |
| trace | Very detailed debugging |
| debug | Debugging information   |
| info  | General information     |
| warn  | Warning conditions      |
| error | Error conditions        |
| fatal | Critical failures       |

## Best Practices

1. **Create your own adapter** - Don't expect the framework to provide adapters for every logging library
2. **Use structured logging** - Pass context objects instead of string interpolation
3. **Use child loggers** for request-scoped logging
4. **Configure via environment** - `LOG_LEVEL`, `NODE_ENV`, etc.
