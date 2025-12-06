/**
 * BootifyJS Scheduling Types
 */

export interface ScheduledJobOptions {
    /** Cron expression (e.g., '0 * * * *' for every hour) */
    cron?: string
    /** Interval in milliseconds */
    interval?: number
    /** Fixed delay in milliseconds (waits after completion before next run) */
    fixedDelay?: number
    /** Run immediately on startup */
    runOnInit?: boolean
    /** Prevent overlapping executions */
    preventOverlap?: boolean
    /** Job name (defaults to method name) */
    name?: string
    /** Timezone for cron expressions */
    timezone?: string
    /** Maximum retries on failure */
    maxRetries?: number
    /** Delay between retries in ms */
    retryDelay?: number
    /** Whether the job is enabled */
    enabled?: boolean
}

export interface ScheduledJobMetadata {
    methodName: string
    options: ScheduledJobOptions
    target: any
}

export interface JobStatus {
    name: string
    status: 'running' | 'idle' | 'disabled' | 'error'
    lastRun?: Date
    lastError?: string
    nextRun?: Date
    runCount: number
    errorCount: number
    averageDuration?: number
}

export interface SchedulerStats {
    totalJobs: number
    runningJobs: number
    disabledJobs: number
    jobs: JobStatus[]
}
