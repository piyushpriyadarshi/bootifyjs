/**
 * @Scheduled Decorator Example
 * 
 * Demonstrates how to use the @Scheduled decorator for background jobs.
 * Run with: npx ts-node src/examples/scheduled-jobs-example.ts
 * 
 * Note: Install node-cron for cron expressions: npm install node-cron
 */
import 'reflect-metadata'
import { Scheduled, Service, createBootify } from '../index'

// Example 1: Simple cron-based cleanup job
@Service()
class CleanupService {
    private cleanupCount = 0

    @Scheduled('*/10 * * * * *')  // Every 10 seconds (for demo)
    async cleanupTempFiles() {
        this.cleanupCount++
        console.log(`[CleanupService] Running temp file cleanup #${this.cleanupCount}`)
        // Simulate cleanup work
        await new Promise(resolve => setTimeout(resolve, 500))
        console.log(`[CleanupService] Cleanup complete`)
    }
}

// Example 2: Interval-based health check with overlap prevention
@Service()
class HealthCheckService {
    private checkCount = 0

    @Scheduled({ interval: 5000, preventOverlap: true, runOnInit: true })
    async performHealthCheck() {
        this.checkCount++
        console.log(`[HealthCheck] Starting health check #${this.checkCount}`)

        // Simulate a slow health check
        await new Promise(resolve => setTimeout(resolve, 2000))

        const status = {
            memory: process.memoryUsage().heapUsed / 1024 / 1024,
            uptime: process.uptime(),
        }
        console.log(`[HealthCheck] Complete - Memory: ${status.memory.toFixed(2)}MB, Uptime: ${status.uptime.toFixed(0)}s`)
    }
}

// Example 3: Job with retries
@Service()
class DataSyncService {
    private syncAttempts = 0

    @Scheduled({
        interval: 15000,
        maxRetries: 2,
        retryDelay: 1000,
        name: 'data-sync'
    })
    async syncExternalData() {
        this.syncAttempts++
        console.log(`[DataSync] Syncing external data (attempt total: ${this.syncAttempts})`)

        // Simulate occasional failures
        if (Math.random() < 0.3) {
            throw new Error('External API temporarily unavailable')
        }

        console.log(`[DataSync] Sync successful`)
    }
}

// Main application
async function main() {
    console.log('Starting Scheduled Jobs Example...\n')

    // Create and start the app
    const bootify = createBootify()
        .setPort(3000)
        .useScheduler(true)

    const { app, start, scheduler } = await bootify.build()

    // Add a simple route to check scheduler status
    app.get('/scheduler/status', async () => {
        return scheduler?.getStats() ?? { error: 'Scheduler not available' }
    })

    // Manual trigger endpoint
    app.post('/scheduler/trigger/:jobName', async (request, reply) => {
        const { jobName } = request.params as { jobName: string }
        try {
            await scheduler?.trigger(jobName)
            return { success: true, message: `Job '${jobName}' triggered` }
        } catch (error: any) {
            reply.status(404)
            return { success: false, error: error.message }
        }
    })

    await start()

    console.log('\n📋 Available endpoints:')
    console.log('  GET  /scheduler/status - View all job statuses')
    console.log('  POST /scheduler/trigger/:jobName - Manually trigger a job')
    console.log('\nExample job names:')
    console.log('  - CleanupService.cleanupTempFiles')
    console.log('  - HealthCheckService.performHealthCheck')
    console.log('  - DataSyncService.data-sync')
}

main().catch(console.error)
