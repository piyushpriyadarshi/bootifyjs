# @Scheduled - Background Job Scheduling

The `@Scheduled` decorator provides a simple way to run background tasks on a schedule using cron expressions or intervals.

## Installation

```bash
# node-cron is optional but required for cron expressions
npm install node-cron
```

## Quick Start

```typescript
import { Service, Scheduled } from "bootifyjs";

@Service()
class CleanupService {
  // Run daily at midnight
  @Scheduled("0 0 * * *")
  async dailyCleanup() {
    console.log("Running cleanup...");
  }

  // Run every 5 minutes with overlap prevention
  @Scheduled({ cron: "*/5 * * * *", preventOverlap: true })
  async healthCheck() {
    console.log("Health check...");
  }

  // Run every 60 seconds, starting immediately
  @Scheduled({ interval: 60000, runOnInit: true })
  async syncData() {
    console.log("Syncing...");
  }
}
```

## Configuration Options

| Option           | Type    | Default     | Description                                    |
| ---------------- | ------- | ----------- | ---------------------------------------------- |
| `cron`           | string  | -           | Cron expression (e.g., `'0 * * * *'`)          |
| `interval`       | number  | -           | Interval in milliseconds                       |
| `fixedDelay`     | number  | -           | Delay after completion before next run         |
| `runOnInit`      | boolean | `false`     | Run immediately on startup                     |
| `preventOverlap` | boolean | `false`     | Skip if previous execution still running       |
| `name`           | string  | method name | Custom job name                                |
| `timezone`       | string  | -           | Timezone for cron (e.g., `'America/New_York'`) |
| `maxRetries`     | number  | `0`         | Retry count on failure                         |
| `retryDelay`     | number  | `1000`      | Delay between retries (ms)                     |
| `enabled`        | boolean | `true`      | Whether job is enabled                         |

## Cron Expression Format

```
┌────────────── second (0-59) [optional]
│ ┌──────────── minute (0-59)
│ │ ┌────────── hour (0-23)
│ │ │ ┌──────── day of month (1-31)
│ │ │ │ ┌────── month (1-12)
│ │ │ │ │ ┌──── day of week (0-7, 0 and 7 = Sunday)
│ │ │ │ │ │
* * * * * *
```

### Common Patterns

| Expression    | Description        |
| ------------- | ------------------ |
| `* * * * *`   | Every minute       |
| `*/5 * * * *` | Every 5 minutes    |
| `0 * * * *`   | Every hour         |
| `0 0 * * *`   | Daily at midnight  |
| `0 0 * * 0`   | Weekly on Sunday   |
| `0 0 1 * *`   | Monthly on the 1st |

## SchedulerService API

Access the scheduler programmatically:

```typescript
import { SchedulerService, container } from "bootifyjs";

const scheduler = container.resolve(SchedulerService);

// Get all job statuses
const stats = scheduler.getStats();
console.log(stats);
// {
//   totalJobs: 3,
//   runningJobs: 1,
//   disabledJobs: 0,
//   jobs: [...]
// }

// Manually trigger a job
await scheduler.trigger("CleanupService.dailyCleanup");

// Enable/disable jobs
scheduler.disable("CleanupService.dailyCleanup");
scheduler.enable("CleanupService.dailyCleanup");

// Get specific job status
const status = scheduler.getJobStatus("CleanupService.dailyCleanup");
```

## Job Status

Each job tracks:

- `name` - Full job name (ClassName.methodName)
- `status` - `'running'` | `'idle'` | `'disabled'` | `'error'`
- `lastRun` - Last execution timestamp
- `lastError` - Last error message (if any)
- `nextRun` - Next scheduled execution
- `runCount` - Total successful runs
- `errorCount` - Total failed runs
- `averageDuration` - Average execution time (ms)

## REST API Example

```typescript
import { createBootify } from "bootifyjs";

const { app, scheduler } = await createBootify().useScheduler(true).build();

// Status endpoint
app.get("/scheduler/status", () => scheduler?.getStats());

// Trigger endpoint
app.post("/scheduler/trigger/:job", async (req) => {
  const { job } = req.params as { job: string };
  await scheduler?.trigger(job);
  return { triggered: job };
});
```

## Graceful Shutdown

The scheduler automatically handles graceful shutdown:

1. Stops accepting new job executions
2. Waits for running jobs to complete (up to 30s)
3. Cleans up all timers and cron jobs

This happens automatically when the process receives `SIGTERM` or `SIGINT`.

## Best Practices

1. **Use `preventOverlap: true`** for jobs that might run longer than their interval
2. **Add retries** for jobs that call external services
3. **Keep jobs idempotent** - they should be safe to run multiple times
4. **Log job progress** for debugging and monitoring
5. **Use meaningful names** for easier identification in logs

## Without node-cron

If you don't install `node-cron`, you can still use interval-based scheduling:

```typescript
@Scheduled({ interval: 60000 })  // Works without node-cron
async myJob() { }

@Scheduled('0 * * * *')  // Requires node-cron
async cronJob() { }
```
