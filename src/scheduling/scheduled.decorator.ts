/**
 * @Scheduled Decorator
 * 
 * Marks a method to be executed on a schedule using cron expressions or intervals.
 */
import 'reflect-metadata'
import { ScheduledJobMetadata, ScheduledJobOptions } from './scheduler.types'

export const SCHEDULED_METADATA_KEY = 'bootify:scheduled-jobs'

/**
 * Decorator to schedule method execution.
 * 
 * Usage with cron expression:
 *   @Scheduled('0 0 * * *')  // Daily at midnight
 *   async dailyCleanup() { }
 * 
 * Usage with options object:
 *   @Scheduled({ cron: '0 0 * * *', preventOverlap: true })
 *   async healthCheck() { }
 * 
 * Usage with interval:
 *   @Scheduled({ interval: 60000, runOnInit: true })
 *   async syncData() { }
 */
export function Scheduled(cronOrOptions: string | ScheduledJobOptions): MethodDecorator {
    return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        const options: ScheduledJobOptions = typeof cronOrOptions === 'string'
            ? { cron: cronOrOptions }
            : cronOrOptions

        // Get existing scheduled jobs for this class
        const existingJobs: ScheduledJobMetadata[] =
            Reflect.getMetadata(SCHEDULED_METADATA_KEY, target.constructor) || []

        // Add this job
        existingJobs.push({
            methodName: String(propertyKey),
            options: {
                enabled: true,
                preventOverlap: false,
                runOnInit: false,
                maxRetries: 0,
                retryDelay: 1000,
                ...options,
                name: options.name || String(propertyKey),
            },
            target: target.constructor,
        })

        Reflect.defineMetadata(SCHEDULED_METADATA_KEY, existingJobs, target.constructor)

        return descriptor
    }
}
