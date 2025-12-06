/**
 * Scheduled Tasks Service
 * 
 * Demonstrates @Scheduled decorator usage for background jobs.
 */
import { Service } from '../../core/decorators'
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
        console.log(`[HealthCheck #${this.healthCheckCount}] Memory: ${heapMB}MB, Uptime: ${process.uptime().toFixed(0)}s`)
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
        console.log(`[Cleanup #${this.cleanupCount}] Running expired data cleanup...`)
        // Simulate cleanup work
        await new Promise(resolve => setTimeout(resolve, 1000))
        console.log(`[Cleanup #${this.cleanupCount}] Cleanup complete`)
    }

    /**
     * Stats reporter - runs every minute
     */
    @Scheduled({ interval: 60000, name: 'stats-reporter' })
    async reportStats() {
        console.log(`[Stats] Health checks: ${this.healthCheckCount}, Cleanups: ${this.cleanupCount}`)
    }
}
