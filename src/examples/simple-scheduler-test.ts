/**
 * Simple Scheduler Test
 * Run with: npx ts-node src/examples/simple-scheduler-test.ts
 */
import 'reflect-metadata'
import { Service } from '../core/decorators'
import { container } from '../core/di-container'
import { Scheduled, SchedulerService } from '../scheduling'

// Register a simple service with scheduled jobs
@Service()
class TestScheduledService {
    private count = 0

    @Scheduled({ interval: 2000, runOnInit: true })
    async everyTwoSeconds() {
        this.count++
        console.log(`[${new Date().toISOString()}] Job executed #${this.count}`)
    }
}

async function main() {
    console.log('Starting Simple Scheduler Test...\n')

    // Get scheduler from DI
    const scheduler = container.resolve<SchedulerService>(SchedulerService)

    // Start the scheduler
    await scheduler.start()

    console.log('\nScheduler Stats:', scheduler.getStats())

    // Let it run for 10 seconds
    console.log('\nRunning for 10 seconds...\n')
    await new Promise(resolve => setTimeout(resolve, 10000))

    // Show final stats
    console.log('\nFinal Stats:', scheduler.getStats())

    // Stop gracefully
    await scheduler.stop()
    console.log('\nTest complete!')
    process.exit(0)
}

main().catch(console.error)
