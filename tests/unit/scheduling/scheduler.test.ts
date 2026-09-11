import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SchedulerService } from '../../../src/scheduling/scheduler.service'
import { Scheduled, SCHEDULED_METADATA_KEY } from '../../../src/scheduling/scheduled.decorator'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(console, 'debug').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('@Scheduled decorator', () => {
  it('stores metadata with defaults on the class', () => {
    class Jobs {
      @Scheduled('0 0 * * *')
      daily() {}
    }

    const meta = Reflect.getMetadata(SCHEDULED_METADATA_KEY, Jobs) as any[]
    expect(meta).toHaveLength(1)
    expect(meta[0]).toMatchObject({
      methodName: 'daily',
      options: { cron: '0 0 * * *', name: 'daily', enabled: true, preventOverlap: false, runOnInit: false, maxRetries: 0 },
    })
  })

  it('accepts an options object and derives the job name', () => {
    class Jobs {
      @Scheduled({ interval: 1000, name: 'custom-name', preventOverlap: true })
      tick() {}
    }

    const meta = Reflect.getMetadata(SCHEDULED_METADATA_KEY, Jobs) as any[]
    expect(meta[0].options).toMatchObject({ interval: 1000, name: 'custom-name', preventOverlap: true })
  })
})

describe('SchedulerService', () => {
  it('discovers and runs interval jobs from an explicit component list', async () => {
    const handler = vi.fn()

    class Ticker {
      @Scheduled({ interval: 50 })
      tick() {
        handler()
      }
    }

    const scheduler = new SchedulerService()
    await scheduler.start([Ticker])

    expect(scheduler.getStats().totalJobs).toBe(1)
    expect(scheduler.getJobStatus('Ticker.tick')?.status).toBe('idle')

    await vi.advanceTimersByTimeAsync(160)
    expect(handler.mock.calls.length).toBeGreaterThanOrEqual(3)

    await scheduler.stop()
  })

  it('tracks runCount and averageDuration', async () => {
    class Counting {
      public ran = 0

      @Scheduled({ interval: 50 })
      count() {
        this.ran++
      }
    }

    const instance = new Counting()
    const scheduler = new SchedulerService()
    // inject the exact instance the scheduler should invoke
    vi.spyOn(scheduler as any, 'discoverJobs').mockImplementation(function (this: any) {
      const meta = Reflect.getMetadata(SCHEDULED_METADATA_KEY, Counting)
      this.jobs.set('Counting.count', {
        metadata: meta[0],
        instance,
        status: { name: 'Counting.count', status: 'idle', runCount: 0, errorCount: 0 },
        isRunning: false,
        durations: [],
      })
    })
    await scheduler.start()

    await vi.advanceTimersByTimeAsync(120)
    expect(instance.ran).toBeGreaterThanOrEqual(2)

    const status = scheduler.getJobStatus('Counting.count')!
    expect(status.runCount).toBe(instance.ran)
    expect(status.averageDuration).toBeGreaterThanOrEqual(0)

    await scheduler.stop()
  })

  it('prevents overlapping executions when configured', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))

    class SlowJob {
      public started = 0

      @Scheduled({ interval: 10, preventOverlap: true })
      async slow() {
        this.started++
        await gate
      }
    }

    const scheduler = new SchedulerService()
    await scheduler.start([SlowJob])

    await vi.advanceTimersByTimeAsync(30)
    expect(scheduler.getJobStatus('SlowJob.slow')?.status).toBe('running')

    release()
    await vi.advanceTimersByTimeAsync(1)
    await scheduler.stop()
  })

  it('retries failed jobs and fires the onJobError hook when exhausted', async () => {
    const jobErrors: string[] = []
    let attempts = 0

    class RetryJob {
      @Scheduled({ interval: 60_000, maxRetries: 1, retryDelay: 10 })
      async flaky() {
        attempts++
        throw new Error('always fails')
      }
    }

    const scheduler = new SchedulerService()
    scheduler.onJobError = (jobName, error) => jobErrors.push(`${jobName}:${error.message}`)

    await scheduler.start([RetryJob])

    const run = scheduler.trigger('RetryJob.flaky')
    await vi.advanceTimersByTimeAsync(100) // flush the retryDelay
    await run

    expect(attempts).toBe(2) // initial + 1 retry
    expect(jobErrors).toEqual(['RetryJob.flaky:always fails'])
    expect(scheduler.getJobStatus('RetryJob.flaky')?.errorCount).toBe(1)
    expect(scheduler.getJobStatus('RetryJob.flaky')?.status).toBe('error')

    await scheduler.stop()
  })

  it('enable/disable control job scheduling', async () => {
    const handler = vi.fn()

    class ToggleJob {
      @Scheduled({ interval: 20 })
      tick() {
        handler()
      }
    }

    const scheduler = new SchedulerService()
    await scheduler.start([ToggleJob])

    scheduler.disable('ToggleJob.tick')
    expect(scheduler.getJobStatus('ToggleJob.tick')?.status).toBe('disabled')

    await vi.advanceTimersByTimeAsync(100)
    expect(handler).not.toHaveBeenCalled()

    scheduler.enable('ToggleJob.tick')
    await vi.advanceTimersByTimeAsync(100)
    expect(handler.mock.calls.length).toBeGreaterThanOrEqual(1)

    await scheduler.stop()
  })

  it('trigger(name) runs a job on demand', async () => {
    const handler = vi.fn()

    class OnDemand {
      @Scheduled({ interval: 60_000, name: 'manual' })
      run() {
        handler()
      }
    }

    const scheduler = new SchedulerService()
    await scheduler.start([OnDemand])

    await scheduler.trigger('OnDemand.manual')
    expect(handler).toHaveBeenCalledTimes(1)

    await expect(scheduler.trigger('missing.job')).rejects.toThrow(/not found/)
    await scheduler.stop()
  })

  it('stop() clears jobs and allows a fresh start', async () => {
    class Idempotent {
      @Scheduled({ interval: 20 })
      tick() {}
    }

    const scheduler = new SchedulerService()
    await scheduler.start([Idempotent])
    expect(scheduler.getStats().totalJobs).toBe(1)

    await scheduler.stop()
    expect(scheduler.getStats().totalJobs).toBe(0)

    // start again after stop (fresh discovery)
    await scheduler.start([Idempotent])
    expect(scheduler.getStats().totalJobs).toBe(1)
    await scheduler.stop()
  })

  it('start() is idempotent while running', async () => {
    class Once {
      @Scheduled({ interval: 60_000 })
      tick() {}
    }

    const scheduler = new SchedulerService()
    await scheduler.start([Once])
    await scheduler.start([Once]) // warns, does not double-register

    expect(scheduler.getStats().totalJobs).toBe(1)
    await scheduler.dispose() // dispose alias works
    expect(scheduler.getStats().totalJobs).toBe(0)
  })

  it('disabled jobs (enabled: false) never run', async () => {
    const handler = vi.fn()

    class DisabledJob {
      @Scheduled({ interval: 20, enabled: false })
      tick() {
        handler()
      }
    }

    const scheduler = new SchedulerService()
    await scheduler.start([DisabledJob])

    expect(scheduler.getStats().disabledJobs).toBe(1)
    await vi.advanceTimersByTimeAsync(100)
    expect(handler).not.toHaveBeenCalled()
    await scheduler.stop()
  })
})
