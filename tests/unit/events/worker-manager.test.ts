import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock worker_threads before importing the manager. The hoisted state object
// lets tests inspect every FakeWorker created by the code under test.
const state = vi.hoisted(() => ({ instances: [] as any[] }))

vi.mock('node:worker_threads', async () => {
  const { EventEmitter } = await import('events')
  class FakeWorker extends EventEmitter {
    threadId: number
    postMessage: any
    terminate: any
    constructor() {
      super()
      this.threadId = state.instances.length + 1
      this.postMessage = vi.fn()
      this.terminate = vi.fn().mockResolvedValue(0)
      state.instances.push(this)
    }
  }
  return { Worker: FakeWorker }
})

import { WorkerManager, ManagedWorker } from '../../../src/events/worker/worker-manager'
import { defaultBufferedEventConfig } from '../../../src/events/config/buffered-event-config'
import { SharedEventBuffer } from '../../../src/events/shared-buffer'
import { EventMetricsCollector } from '../../../src/events/metrics/event-metrics'

describe('WorkerManager (worker_threads mocked)', () => {
  const buffer = new SharedEventBuffer({ maxEvents: 100, maxEventSize: 2048, totalMemoryMB: 1 })
  const metrics = new EventMetricsCollector(defaultBufferedEventConfig)

  beforeEach(() => {
    state.instances.length = 0
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  function makeManager(workerCount = 2, processorsModule?: string) {
    const manager = new WorkerManager(
      { ...defaultBufferedEventConfig, workerCount, monitoring: { ...defaultBufferedEventConfig.monitoring, healthCheckInterval: 60_000 } },
      buffer.getSharedBuffer(),
      metrics,
      processorsModule
    )
    return { manager }
  }

  it('spawns the configured number of workers and sends init with config', async () => {
    const { manager } = makeManager(2, '/abs/path/processors.js')

    const initPromise = manager.initialize()
    for (const w of state.instances) w.emit('message', { type: 'ready' })
    await initPromise

    expect(state.instances).toHaveLength(2)
    const initMessages = state.instances.map((w) =>
      w.postMessage.mock.calls.find((c: any[]) => c[0]?.type === 'init')?.[0]
    )
    expect(initMessages[0].type).toBe('init')
    expect(initMessages[0].config.workerCount).toBe(2)
  })

  it('rejects initialization when workers never become ready (timeout)', async () => {
    const { manager } = makeManager(1)
    vi.useFakeTimers()

    const settled = manager.initialize().catch((e) => e)
    await vi.advanceTimersByTimeAsync(11_000)
    const error = await settled

    vi.useRealTimers()
    expect(error.message).toMatch(/failed to initialize within timeout/)
    expect(state.instances).toHaveLength(1)
  })

  it('tracks worker statistics from health messages', async () => {
    const { manager } = makeManager(1)
    const initPromise = manager.initialize()
    state.instances[0].emit('message', { type: 'ready' })
    await initPromise

    state.instances[0].emit('message', {
      type: 'health_status',
      status: { id: 'worker_0', pid: 1, status: 'running', eventsProcessed: 5, lastActivity: Date.now(), memoryUsage: 0, cpuUsage: 0, errors: 0, uptime: 100 },
    })

    expect(manager.getWorkerStatuses()).toHaveLength(1)
    expect(manager.getHealthyWorkerCount()).toBe(1)
  })

  it('shuts down all workers', async () => {
    const { manager } = makeManager(2)
    const initPromise = manager.initialize()
    for (const w of state.instances) w.emit('message', { type: 'ready' })
    await initPromise

    const shutdownPromise = manager.shutdown()
    for (const w of state.instances) w.emit('message', { type: 'shutdown_complete' })
    await shutdownPromise

    expect(manager.getStatistics().totalWorkers).toBe(0)
  })

  it('restarts workers that exit unexpectedly', async () => {
    const { manager } = makeManager(1)
    const initPromise = manager.initialize()
    state.instances[0].emit('message', { type: 'ready' })
    await initPromise
    expect(state.instances).toHaveLength(1)

    const restart = manager['handleWorkerExit']('worker_0', 1)
    // the dying worker acknowledges graceful shutdown
    state.instances[0].emit('message', { type: 'shutdown_complete' })
    // the replacement worker must become ready for restart to resolve
    await vi.waitFor(() => {
      if (state.instances.length < 2) throw new Error('not restarted yet')
      state.instances[1].emit('message', { type: 'ready' })
    })
    await restart

    expect(state.instances.length).toBe(2)
    expect(manager.getStatistics().totalWorkers).toBe(1)
  })

  it('scales the pool up and down', async () => {
    const { manager } = makeManager(1)
    const initPromise = manager.initialize()
    state.instances[0].emit('message', { type: 'ready' })
    await initPromise

    const upPromise = manager.scaleWorkers(3)
    for (const w of state.instances) {
      if (w !== state.instances[0]) w.emit('message', { type: 'ready' })
    }
    await upPromise
    expect(manager.getStatistics().totalWorkers).toBe(3)

    const downPromise = manager.scaleWorkers(1)
    for (const w of state.instances) w.emit('message', { type: 'shutdown_complete' })
    await downPromise
    expect(manager.getStatistics().totalWorkers).toBe(1)
  })
})

describe('ManagedWorker message protocol', () => {
  it('transitions to running on ready and counts events/errors', () => {
    const worker = new ManagedWorker(
      'w-test',
      '/fake/worker.js',
      defaultBufferedEventConfig,
      new SharedEventBuffer({ maxEvents: 10, maxEventSize: 1024, totalMemoryMB: 1 }).getSharedBuffer(),
      '/abs/processors.js'
    )

    const processed = vi.fn()
    worker.on('event_processed', processed)

    worker.worker.emit('message', { type: 'ready' })
    expect(worker.status).toBe('running')

    worker.worker.emit('message', { type: 'event_processed', eventType: 'x', processingTime: 5, success: true })
    expect(worker.eventsProcessed).toBe(1)
    expect(processed).toHaveBeenCalled()

    worker.worker.emit('message', { type: 'error', error: 'bad' })
    expect(worker.errors).toBe(1)

    const health = worker.getHealthStatus()
    expect(health).toMatchObject({ id: 'w-test', status: 'running', eventsProcessed: 1, errors: 1 })
  })
})
