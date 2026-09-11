import { describe, expect, it, vi } from 'vitest'
import { EventMetricsCollector } from '../../../src/events/metrics/event-metrics'
import { defaultBufferedEventConfig } from '../../../src/events/config/buffered-event-config'
import type { WorkerStatus } from '../../../src/events/metrics/event-metrics'

function makeCollector() {
  return new EventMetricsCollector(defaultBufferedEventConfig)
}

const zeroRetryStats = {
  totalRetries: 0,
  successfulRetries: 0,
  failedRetries: 0,
  deadLetterCount: 0,
  averageRetryDelay: 0,
}

describe('EventMetricsCollector', () => {
  it('counts enqueued, processed and dropped events', () => {
    const collector = makeCollector()

    collector.recordEventEnqueued('normal')
    collector.recordEventEnqueued('critical')
    collector.recordEventProcessed(25, 5)
    collector.recordEventDropped()

    const metrics = collector.collectMetrics(0, { critical: 0, normal: 0, low: 0 }, 0, zeroRetryStats, 0)

    expect(metrics.eventsEnqueued).toBe(2)
    expect(metrics.eventsProcessed).toBe(1)
    expect(metrics.eventsDropped).toBe(1)
  })

  it('computes average and p95 processing times', () => {
    const collector = makeCollector()
    const times = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    for (const t of times) collector.recordEventProcessed(t, 1)

    const metrics = collector.collectMetrics(0, { critical: 0, normal: 0, low: 0 }, 0, zeroRetryStats, 0)

    expect(metrics.performance.averageProcessingTime).toBe(55)
    // p95 of the sorted list with 10 samples -> index ceil(0.95*10)-1 = 9 -> 100
    expect(metrics.performance.p95ProcessingTime).toBe(100)
  })

  it('tracks worker statuses (active vs failed)', () => {
    const collector = makeCollector()
    const running: Partial<WorkerStatus> = { status: 'running', pid: 1 }
    const errored: Partial<WorkerStatus> = { status: 'error', pid: 2 }

    collector.updateWorkerStatus('w1', running)
    collector.updateWorkerStatus('w2', errored)

    expect(collector.getWorkerCount()).toEqual({ active: 1, failed: 1, total: 2 })

    const metrics = collector.collectMetrics(0, { critical: 0, normal: 0, low: 0 }, 0, zeroRetryStats, 0)
    expect(metrics.activeWorkers).toBe(1)
    expect(metrics.failedWorkers).toBe(1)
  })

  it('removeWorker drops tracking entries', () => {
    const collector = makeCollector()
    collector.updateWorkerStatus('w1', { status: 'running' })
    collector.removeWorker('w1')
    expect(collector.getWorkerCount().total).toBe(0)
  })

  it('computes queue utilization against the configured max', () => {
    const collector = makeCollector()
    const metrics = collector.collectMetrics(
      defaultBufferedEventConfig.maxQueueSize / 4,
      { critical: 0, normal: 0, low: 0 },
      0,
      zeroRetryStats,
      0
    )
    expect(metrics.queueUtilization).toBeCloseTo(25)
  })

  it('calculates error rate from retry failures', () => {
    const collector = makeCollector()
    collector.recordEventProcessed(10, 0)
    collector.recordEventProcessed(10, 0)
    collector.recordEventProcessed(10, 0)

    const metrics = collector.collectMetrics(0, { critical: 0, normal: 0, low: 0 }, 0, { ...zeroRetryStats, failedRetries: 1 }, 1)
    expect(metrics.errorRate).toBeCloseTo((1 / 4) * 100)
    expect(metrics.deadLetterQueueSize).toBe(1)
  })

  it('maintains bounded metrics history and supports reset', () => {
    const collector = makeCollector()
    for (let i = 0; i < 5; i++) {
      collector.collectMetrics(i, { critical: 0, normal: 0, low: 0 }, 0, zeroRetryStats, 0)
    }

    expect(collector.getMetricsHistory()).toHaveLength(5)
    expect(collector.getMetricsHistory(2)).toHaveLength(2)

    collector.resetCounters()
    collector.clearHistory()
    expect(collector.getMetricsHistory()).toHaveLength(0)

    const metrics = collector.collectMetrics(0, { critical: 0, normal: 0, low: 0 }, 0, zeroRetryStats, 0)
    expect(metrics.eventsProcessed).toBe(0)
  })

  it('computes processing rate between collection points', async () => {
    const collector = makeCollector()
    collector.recordEventProcessed(1, 0)
    collector.collectMetrics(0, { critical: 0, normal: 0, low: 0 }, 0, zeroRetryStats, 0)

    // simulate 2 seconds elapsing with 10 more processed events
    const future = Date.now() + 2000
    const spy = vi.spyOn(Date, 'now').mockReturnValue(future)
    for (let i = 0; i < 10; i++) collector.recordEventProcessed(1, 0)
    const metrics = collector.collectMetrics(0, { critical: 0, normal: 0, low: 0 }, 0, zeroRetryStats, 0)
    spy.mockRestore()

    // 10 events over a simulated 2s window
    expect(metrics.processingRate).toBeCloseTo(5, 0)
  })
})
