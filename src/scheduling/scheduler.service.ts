/**
 * SchedulerService - Manages scheduled job execution
 */
import { registeredComponents } from '../core/component-registry'
import { Service } from '../core/decorators'
import { container } from '../core/di-container'
import { getLogger, ILogger } from '../logging'
import { SCHEDULED_METADATA_KEY } from './scheduled.decorator'
import { JobStatus, ScheduledJobMetadata, SchedulerStats } from './scheduler.types'

interface ManagedJob {
    metadata: ScheduledJobMetadata
    instance: any
    status: JobStatus
    timer?: NodeJS.Timeout
    cronJob?: any // node-cron ScheduledTask
    isRunning: boolean
    durations: number[]
}

@Service()
export class SchedulerService {
    private jobs = new Map<string, ManagedJob>()
    private isStarted = false
    private nodeCron: any = null

    private get logger(): ILogger {
        try {
            return getLogger()
        } catch {
            // Fallback to console if logger not initialized
            return {
                info: (msg: string, ctx?: any) => console.log(`[Scheduler] ${msg}`, ctx || ''),
                warn: (msg: string, ctx?: any) => console.warn(`[Scheduler] ${msg}`, ctx || ''),
                error: (msg: string, err?: Error, ctx?: any) => console.error(`[Scheduler] ${msg}`, err, ctx || ''),
                debug: (msg: string, ctx?: any) => console.debug(`[Scheduler] ${msg}`, ctx || ''),
            } as ILogger
        }
    }

    /**
     * Initialize and start all scheduled jobs
     */
    async start(): Promise<void> {
        if (this.isStarted) {
            this.logger.warn('Scheduler already started')
            return
        }

        // Try to load node-cron
        try {
            this.nodeCron = await import('node-cron')
        } catch {
            this.logger.warn('node-cron not installed. Cron expressions will not work. Install with: npm install node-cron')
        }

        // Discover all scheduled jobs from registered components
        this.discoverJobs()

        // Start all jobs
        Array.from(this.jobs.entries()).forEach(([_name, job]) => {
            this.startJob(job)
        })

        this.isStarted = true
        this.logger.info('Scheduler started', { totalJobs: this.jobs.size })
    }

    /**
     * Stop all scheduled jobs gracefully
     */
    async stop(): Promise<void> {
        if (!this.isStarted) return

        this.logger.info('Stopping all scheduled jobs...')

        const stopPromises: Promise<void>[] = []

        Array.from(this.jobs.entries()).forEach(([_name, job]) => {
            // Stop timers
            if (job.timer) {
                clearInterval(job.timer)
                clearTimeout(job.timer)
            }

            // Stop cron jobs
            if (job.cronJob?.stop) {
                job.cronJob.stop()
            }

            // Wait for running jobs to complete
            if (job.isRunning) {
                stopPromises.push(
                    new Promise((resolve) => {
                        const checkInterval = setInterval(() => {
                            if (!job.isRunning) {
                                clearInterval(checkInterval)
                                resolve()
                            }
                        }, 100)
                        // Timeout after 30 seconds
                        setTimeout(() => {
                            clearInterval(checkInterval)
                            resolve()
                        }, 30000)
                    })
                )
            }
        })

        await Promise.all(stopPromises)
        this.jobs.clear()
        this.isStarted = false
        this.logger.info('All scheduled jobs stopped')
    }

    /**
     * Manually trigger a job by name
     */
    async trigger(jobName: string): Promise<void> {
        const job = this.jobs.get(jobName)
        if (!job) {
            throw new Error(`[Scheduler] Job '${jobName}' not found`)
        }
        await this.executeJob(job)
    }

    /**
     * Enable a job
     */
    enable(jobName: string): void {
        const job = this.jobs.get(jobName)
        if (!job) {
            throw new Error(`[Scheduler] Job '${jobName}' not found`)
        }
        job.metadata.options.enabled = true
        job.status.status = 'idle'
        this.startJob(job)
        this.logger.info('Job enabled', { jobName })
    }

    /**
     * Disable a job
     */
    disable(jobName: string): void {
        const job = this.jobs.get(jobName)
        if (!job) {
            throw new Error(`[Scheduler] Job '${jobName}' not found`)
        }
        job.metadata.options.enabled = false
        job.status.status = 'disabled'

        if (job.timer) {
            clearInterval(job.timer)
            clearTimeout(job.timer)
        }
        if (job.cronJob?.stop) {
            job.cronJob.stop()
        }
        this.logger.info('Job disabled', { jobName })
    }

    /**
     * Get status of all jobs
     */
    getStats(): SchedulerStats {
        const jobs = Array.from(this.jobs.values()).map(j => ({ ...j.status }))
        return {
            totalJobs: jobs.length,
            runningJobs: jobs.filter(j => j.status === 'running').length,
            disabledJobs: jobs.filter(j => j.status === 'disabled').length,
            jobs,
        }
    }

    /**
     * Get status of a specific job
     */
    getJobStatus(jobName: string): JobStatus | undefined {
        return this.jobs.get(jobName)?.status
    }

    private discoverJobs(): void {
        const components = Array.from(registeredComponents)

        for (let i = 0; i < components.length; i++) {
            const componentClass = components[i]
            const scheduledMethods: ScheduledJobMetadata[] =
                Reflect.getMetadata(SCHEDULED_METADATA_KEY, componentClass) || []

            if (scheduledMethods.length === 0) continue

            // Resolve the instance from DI container
            let instance: any
            try {
                instance = container.resolve(componentClass)
            } catch (error) {
                this.logger.error(`Failed to resolve component`, error as Error, { component: componentClass.name })
                continue
            }

            for (let j = 0; j < scheduledMethods.length; j++) {
                const metadata = scheduledMethods[j]
                const jobName = `${componentClass.name}.${metadata.options.name}`

                if (this.jobs.has(jobName)) {
                    this.logger.warn('Duplicate job name', { jobName })
                    continue
                }

                this.jobs.set(jobName, {
                    metadata,
                    instance,
                    status: {
                        name: jobName,
                        status: metadata.options.enabled ? 'idle' : 'disabled',
                        runCount: 0,
                        errorCount: 0,
                    },
                    isRunning: false,
                    durations: [],
                })

                this.logger.debug('Registered scheduled job', { jobName })
            }
        }
    }


    private startJob(job: ManagedJob): void {
        const { options } = job.metadata

        if (!options.enabled) {
            job.status.status = 'disabled'
            return
        }

        // Run on init if specified
        if (options.runOnInit) {
            setImmediate(() => this.executeJob(job))
        }

        // Setup cron schedule
        if (options.cron) {
            if (!this.nodeCron) {
                this.logger.error('Cannot start cron job: node-cron not installed', undefined, { jobName: job.status.name })
                return
            }

            const cronOptions: any = {}
            if (options.timezone) {
                cronOptions.timezone = options.timezone
            }

            try {
                job.cronJob = this.nodeCron.schedule(options.cron, () => {
                    this.executeJob(job)
                }, cronOptions)

                // Calculate next run
                job.status.nextRun = this.getNextCronRun(options.cron)
            } catch (error: any) {
                this.logger.error('Invalid cron expression', error, { jobName: job.status.name })
                job.status.status = 'error'
                job.status.lastError = error.message
            }
        }

        // Setup interval
        if (options.interval) {
            job.timer = setInterval(() => {
                this.executeJob(job)
            }, options.interval)

            job.status.nextRun = new Date(Date.now() + options.interval)
        }

        // Setup fixed delay (runs after previous execution completes)
        if (options.fixedDelay && !options.interval && !options.cron) {
            const runWithDelay = async () => {
                await this.executeJob(job)
                if (job.metadata.options.enabled) {
                    job.timer = setTimeout(runWithDelay, options.fixedDelay!)
                    job.status.nextRun = new Date(Date.now() + options.fixedDelay!)
                }
            }
            job.timer = setTimeout(runWithDelay, options.fixedDelay)
            job.status.nextRun = new Date(Date.now() + options.fixedDelay)
        }
    }

    private async executeJob(job: ManagedJob): Promise<void> {
        const { options, methodName } = job.metadata

        // Check if job is enabled
        if (!options.enabled) return

        // Prevent overlap if configured
        if (options.preventOverlap && job.isRunning) {
            this.logger.debug('Skipping job - previous execution still running', { jobName: job.status.name })
            return
        }

        job.isRunning = true
        job.status.status = 'running'
        const startTime = Date.now()

        let attempt = 0
        const maxAttempts = (options.maxRetries || 0) + 1

        while (attempt < maxAttempts) {
            try {
                attempt++
                await job.instance[methodName]()

                // Success
                const duration = Date.now() - startTime
                job.durations.push(duration)
                if (job.durations.length > 100) job.durations.shift() // Keep last 100

                job.status.lastRun = new Date()
                job.status.runCount++
                job.status.averageDuration = job.durations.reduce((a, b) => a + b, 0) / job.durations.length
                job.status.status = 'idle'
                job.status.lastError = undefined

                // Update next run time
                if (options.cron) {
                    job.status.nextRun = this.getNextCronRun(options.cron)
                } else if (options.interval) {
                    job.status.nextRun = new Date(Date.now() + options.interval)
                }

                break // Exit retry loop on success
            } catch (error: any) {
                this.logger.error('Job execution failed', error, {
                    jobName: job.status.name,
                    attempt,
                    maxAttempts
                })

                if (attempt >= maxAttempts) {
                    job.status.errorCount++
                    job.status.lastError = error.message
                    job.status.status = 'error'
                } else {
                    // Wait before retry
                    await new Promise(resolve => setTimeout(resolve, options.retryDelay || 1000))
                }
            }
        }

        job.isRunning = false

        // Reset status to idle if not in error state
        if (job.status.status === 'running') {
            job.status.status = 'idle'
        }
    }

    private getNextCronRun(cronExpression: string): Date | undefined {
        // Simple approximation - for accurate next run, would need cron-parser
        // This is a placeholder that returns undefined
        // Users can install cron-parser for accurate next run times
        return undefined
    }
}
