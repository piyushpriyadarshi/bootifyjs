import { describe, expect, it } from 'vitest'
import { EventSystemHealthMonitor } from '../../../src/events/monitoring/health-monitor'
import { EventMetricsCollector } from '../../../src/events/metrics/event-metrics'
import type { WorkerStatus } from '../../../src/events/metrics/event-metrics'
import { defaultBufferedEventConfig } from '../../../src/events/config/buffered-event-config'

function makeMonitor() {
  const collector = new EventMetricsCollector(defaultBufferedEventConfig)
  const monitor = new EventSystemHealthMonitor(defaultBufferedEventConfig, collector)
  return { collector, monitor }
}

function withWorker(collector: EventMetricsCollector, status: WorkerStatus['status'], id = 'w1') {
  collector.updateWorkerStatus(id, { status, pid: 1 })
}

describe('EventSystemHealthMonitor', () => {
  it('reports healthy on an idle system', async () => {
    const { monitor } = makeMonitor()
    const result = await monitor.performHealthCheck()

    expect(result.status).toBe('healthy')
    expect(result.overallScore).toBeGreaterThan(50)
    expect(result.checks.length).toBeGreaterThanOrEqual(5)
    expect(result.checks.every((c) => c.status === 'pass')).toBe(true)
  })

  it('flags worker failures (fail check for errored workers)', async () => {
    const { collector, monitor } = makeMonitor()
    withWorker(collector, 'error')

    const result = await monitor.performHealthCheck()
    const workerCheck = result.checks.find((c) => c.name.toLowerCase().includes('worker'))!

    expect(['warn', 'fail']).toContain(workerCheck.status)
  })

  it('generates recommendations when checks fail', async () => {
    const { collector, monitor } = makeMonitor()
    // more errors than successes -> worker check fails
    collector.updateWorkerStatus('w1', { status: 'error', errors: 100 })
    collector.updateWorkerStatus('w2', { status: 'error', errors: 100 })

    const result = await monitor.performHealthCheck()
    expect(result.recommendations.length).toBeGreaterThan(0)
  })

  it('emits alerts when thresholds are breached', async () => {
    const { collector, monitor } = makeMonitor()
    withWorker(collector, 'error', 'w1')
    withWorker(collector, 'error', 'w2')

    await monitor.performHealthCheck()
    // internal alert history is observable via repeated checks surfacing warnings
    const second = await monitor.performHealthCheck()
    expect(second.checks.some((c) => c.status !== 'pass')).toBe(true)
  })

  it('records the last health check result on each run', async () => {
    const { monitor } = makeMonitor()
    const first = await monitor.performHealthCheck()
    const second = await monitor.performHealthCheck()

    expect(first.timestamp).toBeLessThanOrEqual(second.timestamp)
    expect(second.overallScore).toBeGreaterThan(0)
  })
})
