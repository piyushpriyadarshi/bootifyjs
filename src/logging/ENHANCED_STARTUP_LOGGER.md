# Enhanced Startup Logger

A powerful, colorful, and feature-rich startup logger for Bootify applications with performance monitoring, health checks, and multiple output modes.

## Features

✅ **Color-coded output** - Visual feedback with ANSI colors  
✅ **Performance warnings** - Identify slow components automatically  
✅ **Startup modes** - Silent, Normal, Verbose, Debug, JSON  
✅ **Component categorization** - Group by type (core, middleware, plugin, etc.)  
✅ **Health check integration** - Verify services after startup  
✅ **Structured logging** - JSON mode for log aggregation  
✅ **Timing metrics** - Track initialization time for each component  
✅ **Better error messages** - Suggestions for common errors  
✅ **Memory tracking** - Monitor memory usage per component  
✅ **Configuration validation** - Catch errors early

## Quick Start

### Using with BootifyApp

```typescript
import { createBootify } from "bootify";

const { app, start, startupLogger } = await createBootify()
  .setPort(8080)
  .useControllers([HealthController, UserController])
  .build();

await start();
```

The enhanced logger is used automatically!

### Manual Usage

```typescript
import { initializeEnhancedLogging, ComponentCategory } from "bootify/logging";

const { logger, startupLogger } = await initializeEnhancedLogging();

// Log component initialization
startupLogger.logComponentStart("Database", ComponentCategory.DATABASE);
await initializeDatabase();
startupLogger.logComponentComplete("Database");

// Log startup complete
startupLogger.logStartupComplete();
await startupLogger.logStartupSummary(8080, "localhost");
```

## Startup Modes

Control output verbosity with the `STARTUP_MODE` environment variable:

### Silent Mode

```bash
STARTUP_MODE=silent npm start
```

**Output:** Minimal - only server URL

### Normal Mode (Default)

```bash
npm start
```

**Output:** Standard - banner, component status, summary

### Verbose Mode

```bash
STARTUP_MODE=verbose npm start
```

**Output:** Detailed - includes component breakdown by category

### Debug Mode

```bash
STARTUP_MODE=debug npm start
```

**Output:** Maximum detail - includes memory deltas, stack traces

### JSON Mode

```bash
STARTUP_MODE=json npm start
```

**Output:** Machine-readable JSON for log aggregation

## Component Categories

Categorize components for better organization:

```typescript
import { ComponentCategory } from "bootify/logging";

// Available categories:
ComponentCategory.CORE; // 🔧 Core framework components
ComponentCategory.MIDDLEWARE; // 🔀 Middleware
ComponentCategory.PLUGIN; // 🔌 Fastify plugins
ComponentCategory.CONTROLLER; // 🎮 Controllers
ComponentCategory.SERVICE; // ⚙️ Services
ComponentCategory.DATABASE; // 💾 Database connections
ComponentCategory.CACHE; // 📦 Cache systems
ComponentCategory.EXTERNAL; // 🌐 External services
```

### Example

```typescript
startupLogger.logComponentStart("Redis", ComponentCategory.CACHE);
await redis.connect();
startupLogger.logComponentComplete("Redis");

startupLogger.logComponentStart("PostgreSQL", ComponentCategory.DATABASE);
await db.connect();
startupLogger.logComponentComplete("PostgreSQL");
```

## Performance Monitoring

### Automatic Warnings

Components taking longer than the threshold trigger warnings:

```bash
⚠️  Performance Warning: Database took 1250ms to initialize (threshold: 1000ms)
```

### Configure Thresholds

```bash
# Warn if component takes > 500ms
STARTUP_PERF_THRESHOLD=500

# Warn if total startup > 3000ms
SLOW_STARTUP_THRESHOLD=3000
```

### Example Output

```
✅ Redis initialized (45ms)
✅ API Routes initialized (123ms)
⚠️  Database initialized (1250ms)  # Warning - slow!
```

## Health Checks

Register health checks to verify services after startup:

```typescript
// Register health checks
startupLogger.registerHealthCheck("database", async () => {
  try {
    await db.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
});

startupLogger.registerHealthCheck("redis", async () => {
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
});

// Health checks run automatically in logStartupSummary()
await startupLogger.logStartupSummary(8080, "localhost");
```

### Disable Health Checks

```bash
ENABLE_HEALTH_CHECK=false npm start
```

## Error Handling

### Better Error Messages

The logger provides helpful suggestions for common errors:

```
❌ Database initialization failed
   Error: connect ECONNREFUSED 127.0.0.1:5432
   💡 Suggestion: Check if the service is running and the connection details are correct
```

### Common Error Suggestions

- **ECONNREFUSED** → Check if service is running
- **EADDRINUSE** → Port already in use, try different port
- **Module not found** → Run `npm install`
- **Permission denied** → Check file permissions
- **Timeout** → Increase timeout or check network
- **Authentication failed** → Verify credentials

### Debug Mode Stack Traces

```bash
STARTUP_MODE=debug npm start
```

Shows stack traces for errors:

```
❌ Database initialization failed
   Error: Connection timeout
   💡 Suggestion: Increase timeout value or check network connectivity
   Stack:
      at Database.connect (/app/db.ts:45:12)
      at async main (/app/index.ts:23:5)
```

## Color Output

### Automatic Color Detection

Colors are automatically disabled in:

- CI environments (`CI=true`)
- When `NO_COLOR` is set
- Non-TTY terminals

### Force Disable Colors

```bash
NO_COLOR=1 npm start
```

### Color Scheme

- 🟢 **Green** - Success
- 🟡 **Yellow** - Warnings
- 🔴 **Red** - Errors
- 🔵 **Cyan** - Info
- ⚪ **Gray** - Details

## Structured Logging (JSON Mode)

Perfect for log aggregation systems (ELK, Splunk, DataDog):

```bash
STARTUP_MODE=json npm start
```

### Example Output

```json
{"event":"component_start","name":"Database","category":"database","startTime":1705123456789}
{"event":"component_complete","name":"Database","category":"database","duration":145}
{"event":"startup_complete","duration":1234,"components":[...]}
{"event":"startup_summary","duration":1234,"port":8080,"health":"healthy"}
```

## Startup Summary

### Normal Mode Output

```
🚀 BootifyJS Application Started Successfully
────────────────────────────────────────────────────────────
⏱️  Total startup time: 1234ms
🔧 Environment: production
📦 Node.js: v20.10.0
💾 Memory usage: 45.23 MB / 128.00 MB
🌐 Server: http://localhost:8080
📚 API Docs: http://localhost:8080/api-docs
✅ Health: healthy
📊 Components: 12 initialized
────────────────────────────────────────────────────────────
```

### Verbose Mode - Component Breakdown

```
📊 Component Breakdown:
────────────────────────────────────────────────────────────

🔧 CORE
  ✅ Request Context              15ms
  ✅ Error Handler                 8ms

🔌 PLUGIN
  ✅ Cookie Parser                45ms
  ✅ Swagger                      123ms

🎮 CONTROLLER
  ✅ Health Controller            12ms
  ✅ User Controller              23ms
  ✅ Product Controller           18ms

💾 DATABASE
  ⚠️  PostgreSQL                  1250ms

📦 CACHE
  ✅ Redis                        45ms

────────────────────────────────────────────────────────────
```

## Configuration

### Environment Variables

```bash
# Startup mode
STARTUP_MODE=normal|silent|verbose|debug|json

# Performance thresholds
STARTUP_PERF_THRESHOLD=1000        # Component threshold (ms)
SLOW_STARTUP_THRESHOLD=5000        # Total startup threshold (ms)

# Features
ENABLE_HEALTH_CHECK=true           # Run health checks
VALIDATE_CONFIG=true               # Validate configuration

# Colors
NO_COLOR=1                         # Disable colors
CI=true                            # Auto-disables colors
```

### Programmatic Configuration

```typescript
const { startupLogger } = await initializeEnhancedLogging();

// Change mode
startupLogger.setMode(StartupMode.VERBOSE);

// Register health checks
startupLogger.registerHealthCheck("api", async () => {
  // Check if API is responding
  return true;
});
```

## Best Practices

### 1. Use Appropriate Categories

```typescript
// ✅ Good
startupLogger.logComponentStart("PostgreSQL", ComponentCategory.DATABASE);
startupLogger.logComponentStart("UserController", ComponentCategory.CONTROLLER);

// ❌ Bad
startupLogger.logComponentStart("PostgreSQL", ComponentCategory.CORE);
```

### 2. Always Complete or Fail

```typescript
// ✅ Good
startupLogger.logComponentStart("Database", ComponentCategory.DATABASE);
try {
  await db.connect();
  startupLogger.logComponentComplete("Database");
} catch (error) {
  startupLogger.logComponentFailed("Database", error);
}

// ❌ Bad - never completes
startupLogger.logComponentStart("Database", ComponentCategory.DATABASE);
await db.connect();
// Missing logComponentComplete!
```

### 3. Use Silent Mode in Tests

```typescript
// In test setup
process.env.STARTUP_MODE = "silent";
```

### 4. Use JSON Mode in Production

```bash
# In production
STARTUP_MODE=json npm start | pino-pretty
```

### 5. Register Health Checks

```typescript
// Always verify critical services
startupLogger.registerHealthCheck("database", async () => {
  return await db.isHealthy();
});

startupLogger.registerHealthCheck("cache", async () => {
  return await cache.ping();
});
```

## Examples

### Complete Example

```typescript
import { createBootify, ComponentCategory } from "bootify";

const { app, start, startupLogger } = await createBootify()
  .setPort(8080)

  // Initialize database
  .beforeStart(async () => {
    startupLogger.logComponentStart("PostgreSQL", ComponentCategory.DATABASE);
    try {
      await db.connect();
      startupLogger.logComponentComplete("PostgreSQL");

      // Register health check
      startupLogger.registerHealthCheck("database", async () => {
        try {
          await db.query("SELECT 1");
          return true;
        } catch {
          return false;
        }
      });
    } catch (error) {
      startupLogger.logComponentFailed("PostgreSQL", error);
      throw error;
    }
  })

  // Initialize Redis
  .beforeStart(async () => {
    startupLogger.logComponentStart("Redis", ComponentCategory.CACHE);
    try {
      await redis.connect();
      startupLogger.logComponentComplete("Redis");

      startupLogger.registerHealthCheck("redis", async () => {
        try {
          await redis.ping();
          return true;
        } catch {
          return false;
        }
      });
    } catch (error) {
      startupLogger.logComponentFailed("Redis", error);
      throw error;
    }
  })

  .useControllers([HealthController, UserController])
  .build();

await start();
```

### CI/CD Example

```yaml
# .github/workflows/deploy.yml
- name: Start Application
  env:
    STARTUP_MODE: json
    NO_COLOR: 1
  run: npm start
```

### Development Example

```bash
# package.json
{
  "scripts": {
    "dev": "STARTUP_MODE=verbose nodemon",
    "dev:debug": "STARTUP_MODE=debug nodemon",
    "dev:silent": "STARTUP_MODE=silent nodemon"
  }
}
```

## Troubleshooting

### Colors Not Showing

- Check if running in TTY: `process.stdout.isTTY`
- Ensure `NO_COLOR` is not set
- Ensure `CI` is not set

### Performance Warnings

- Optimize slow components
- Consider lazy loading
- Increase thresholds if acceptable

### Health Checks Failing

- Verify services are running
- Check network connectivity
- Review service configuration

## Migration from Old Logger

### Before

```typescript
const { startupLogger } = await intitializeLogging();

startupLogger.logComponentStart("Database");
await db.connect();
startupLogger.logComponentComplete("Database");
```

### After

```typescript
const { startupLogger } = await initializeEnhancedLogging();

startupLogger.logComponentStart("Database", ComponentCategory.DATABASE);
await db.connect();
startupLogger.logComponentComplete("Database");
```

**Changes:**

- Use `initializeEnhancedLogging()` instead of `intitializeLogging()`
- Add `ComponentCategory` parameter (optional but recommended)
- Everything else works the same!

## API Reference

### Methods

- `logStartupBanner()` - Show startup banner
- `logComponentStart(name, category?, details?)` - Start component initialization
- `logComponentComplete(name, details?)` - Complete component initialization
- `logComponentFailed(name, error, details?)` - Component initialization failed
- `logStartupComplete()` - Startup completed
- `logStartupSummary(port?, host?)` - Show startup summary
- `registerHealthCheck(name, check)` - Register health check
- `setMode(mode)` - Change startup mode

### Types

- `StartupMode` - Silent, Normal, Verbose, Debug, JSON
- `ComponentCategory` - Core, Middleware, Plugin, Controller, Service, Database, Cache, External

---

**Enjoy better startup logging! 🚀**
