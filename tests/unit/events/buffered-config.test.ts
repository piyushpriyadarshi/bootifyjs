import { describe, expect, it } from 'vitest'
import {
  BufferedEventConfigLoader,
  BufferedEventConfigValidator,
  defaultBufferedEventConfig,
  PriorityHelper,
} from '../../../src/events/config/buffered-event-config'

describe('BufferedEventConfigValidator', () => {
  it('accepts the default configuration', () => {
    expect(BufferedEventConfigValidator.validate(defaultBufferedEventConfig)).toEqual([])
  })

  it('rejects out-of-range workerCount', () => {
    const errors = BufferedEventConfigValidator.validate({ workerCount: 0 })
    expect(errors.some((e) => e.includes('workerCount'))).toBe(true)
  })

  it('rejects too-small queue, event size and memory', () => {
    const errors = BufferedEventConfigValidator.validate({
      maxQueueSize: 10,
      maxEventSize: 100,
      maxMemoryMB: 1,
    })
    expect(errors.some((e) => e.includes('maxQueueSize'))).toBe(true)
    expect(errors.some((e) => e.includes('maxEventSize'))).toBe(true)
    expect(errors.some((e) => e.includes('maxMemoryMB'))).toBe(true)
  })

  it('rejects invalid retry settings', () => {
    const errors = BufferedEventConfigValidator.validate({
      retryAttempts: 99,
      retryDelays: [50, 2000, 4000],
    })
    expect(errors.some((e) => e.includes('retryAttempts'))).toBe(true)
    expect(errors.some((e) => e.includes('retry delays'))).toBe(true)
  })

  it('mergeWithDefaults deep-merges nested config sections', () => {
    const merged = BufferedEventConfigValidator.mergeWithDefaults({
      workerCount: 2,
      monitoring: { metricsInterval: 5000 },
    })

    expect(merged.workerCount).toBe(2)
    expect(merged.monitoring.metricsInterval).toBe(5000)
    expect(merged.monitoring.enabled).toBe(true) // default preserved
    expect(merged.memoryLimits.maxQueueSize).toBe(
      defaultBufferedEventConfig.memoryLimits.maxQueueSize
    )
  })

  it('mergeWithDefaults deep-merges alert thresholds without losing defaults', () => {
    const merged = BufferedEventConfigValidator.mergeWithDefaults({
      monitoring: {
        enabled: true,
        metricsInterval: 1000,
        healthMonitoring: true,
        healthCheckInterval: 5000,
        alertThresholds: { dlqSizeAlert: 5 },
      },
    })
    expect(merged.monitoring.alertThresholds.dlqSizeAlert).toBe(5)
    expect(merged.monitoring.alertThresholds.maxFailedWorkers).toBe(
      defaultBufferedEventConfig.monitoring.alertThresholds.maxFailedWorkers
    )
  })
})

describe('BufferedEventConfigLoader.fromEnvironment', () => {
  it('returns an empty config when no env vars are set', () => {
    expect(BufferedEventConfigLoader.fromEnvironment({})).toEqual({})
  })

  it('reads typed values from the injected env (no process.env access)', () => {
    const config = BufferedEventConfigLoader.fromEnvironment({
      BUFFERED_EVENTS_ENABLED: 'true',
      BUFFERED_EVENTS_WORKER_COUNT: '8',
      BUFFERED_EVENTS_MAX_QUEUE_SIZE: '5000',
      BUFFERED_EVENTS_MAX_MEMORY_MB: '64',
      BUFFERED_EVENTS_RETRY_ATTEMPTS: '2',
    })

    expect(config).toEqual({
      enabled: true,
      workerCount: 8,
      maxQueueSize: 5000,
      maxMemoryMB: 64,
      retryAttempts: 2,
    })
  })

  it('parses "false" as disabled', () => {
    const config = BufferedEventConfigLoader.fromEnvironment({
      BUFFERED_EVENTS_ENABLED: 'false',
    })
    expect(config.enabled).toBe(false)
  })
})

describe('PriorityHelper', () => {
  it('maps priority names to configured numeric values', () => {
    expect(PriorityHelper.getPriorityValue('critical', defaultBufferedEventConfig)).toBe(3)
    expect(PriorityHelper.getPriorityValue('normal', defaultBufferedEventConfig)).toBe(2)
    expect(PriorityHelper.getPriorityValue('low', defaultBufferedEventConfig)).toBe(1)
  })

  it('compares as a descending-priority comparator (higher first)', () => {
    // negative -> a is processed before b
    expect(PriorityHelper.comparePriorities('critical', 'normal', defaultBufferedEventConfig)).toBeLessThan(0)
    expect(PriorityHelper.comparePriorities('normal', 'low', defaultBufferedEventConfig)).toBeLessThan(0)
    expect(PriorityHelper.comparePriorities('low', 'critical', defaultBufferedEventConfig)).toBeGreaterThan(0)
    expect(PriorityHelper.comparePriorities('normal', 'normal', defaultBufferedEventConfig)).toBe(0)
  })

  it('validates priority names', () => {
    expect(PriorityHelper.isValidPriority('critical')).toBe(true)
    expect(PriorityHelper.isValidPriority('urgent')).toBe(false)
  })
})
