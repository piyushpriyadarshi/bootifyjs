/**
 * Scheduled Tasks Service
 * 
 * Demonstrates @Scheduled decorator usage for background jobs.
 */
import { Service } from '../../core/decorators'
import { getLogger } from '../../logging'
import { Scheduled } from '../../scheduling'

@Service()
export class ScheduledTasksService {
    private healthCheckCount = 0
    private cleanupCount = 0

    /**
     * Health check - runs every 30 seconds
     */
    @Scheduled({ interval: 30000, runOnInit: true, name: 'health-check' })
    async performHealthCheck() {
        this.healthCheckCount++
        const memUsage = process.memoryUsage()
        const heapMB = (memUsage.heapUsed / 1024 / 1024).toFixed(2)

        const logger = getLogger()
        logger.info('Health check completed', {
            checkNumber: this.healthCheckCount,
            memoryMB: heapMB,
            uptimeSeconds: Math.floor(process.uptime()),
        })
    }

    /**
     * Cleanup task - runs every 5 minutes with overlap prevention
     */
    @Scheduled({
        interval: 300000, // 5 minutes
        preventOverlap: true,
        name: 'cleanup'
    })
    async cleanupExpiredData() {
        this.cleanupCount++
        const logger = getLogger()

        logger.info('Starting cleanup task', { cleanupNumber: this.cleanupCount })

        // Simulate cleanup work
        await new Promise(resolve => setTimeout(resolve, 1000))

        logger.info('Cleanup task completed', { cleanupNumber: this.cleanupCount })
    }

    /**
     * Stats reporter - runs every minute
     */
    @Scheduled({ interval: 60000, name: 'stats-reporter' })
    async reportStats() {
        const logger = getLogger()
        logger.info('Scheduled tasks stats', {
            healthChecks: this.healthCheckCount,
            cleanups: this.cleanupCount,
        })
    }
}
