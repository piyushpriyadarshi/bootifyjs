/**
 * BootifyJS Scheduling Module
 * 
 * Provides @Scheduled decorator for cron jobs and interval-based task execution.
 * 
 * @example
 * import { Service, Scheduled, SchedulerService } from 'bootifyjs'
 * 
 * @Service()
 * class CleanupService {
 *   @Scheduled('0 0 * * *')  // Daily at midnight
 *   async dailyCleanup() {
 *     console.log('Running cleanup...')
 *   }
 * 
 *   @Scheduled({ interval: 60000, preventOverlap: true })
 *   async healthCheck() {
 *     console.log('Health check...')
 *   }
 * }
 */

export * from './scheduled.decorator'
export * from './scheduler.service'
export * from './scheduler.types'

