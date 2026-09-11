import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConsoleTransport } from '../../../src/logging/core/transports/console.transport'
import type { LogEntry } from '../../../src/logging/core/interfaces'

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    level: 'info',
    message: 'hello',
    timestamp: new Date('2026-01-15T10:30:00.000Z'),
    context: { userId: 'u1' },
    ...overrides,
  }
}

const spies: any[] = []

afterEach(() => {
  for (const s of spies) s.mockRestore()
  spies.length = 0
})

function captureStd(): { stdout: string[]; stderr: string[] } {
  const stdout: string[] = []
  const stderr: string[] = []
  spies.push(
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: any) => {
      stdout.push(String(chunk))
      return true
    }) as any),
    vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: any) => {
      stderr.push(String(chunk))
      return true
    }) as any)
  )
  return { stdout, stderr }
}

describe('ConsoleTransport', () => {
  it('writes pretty output with timestamp, level label and context', () => {
    const { stdout } = captureStd()
    const transport = new ConsoleTransport({ prettyPrint: true, colorize: false })

    transport.write(entry())

    expect(stdout).toHaveLength(1)
    expect(stdout[0]).toContain('2026-01-15T10:30:00.000Z')
    expect(stdout[0]).toContain('INFO')
    expect(stdout[0]).toContain('hello')
    expect(stdout[0]).toContain('"userId":"u1"')
  })

  it('routes error and fatal levels to stderr, others to stdout', () => {
    const { stdout, stderr } = captureStd()
    const transport = new ConsoleTransport({ prettyPrint: false })

    transport.write(entry({ level: 'error' }))
    transport.write(entry({ level: 'fatal' }))
    transport.write(entry({ level: 'info' }))

    expect(stderr).toHaveLength(2)
    expect(stdout).toHaveLength(1)
  })

  it('emits machine-readable JSON when prettyPrint is off', () => {
    const { stdout } = captureStd()
    const transport = new ConsoleTransport({ prettyPrint: false })

    transport.write(entry())
    const parsed = JSON.parse(stdout[0].trim())

    expect(parsed).toMatchObject({
      timestamp: '2026-01-15T10:30:00.000Z',
      level: 'info',
      message: 'hello',
      userId: 'u1',
    })
  })

  it('spreads context at the top level in JSON mode', () => {
    const { stdout } = captureStd()
    const transport = new ConsoleTransport({ prettyPrint: false })
    transport.write(entry({ context: { requestId: 'r-1', nested: { a: 1 } } }))

    const parsed = JSON.parse(stdout[0].trim())
    expect(parsed.requestId).toBe('r-1')
    expect(parsed.nested).toEqual({ a: 1 })
  })

  it('serializes error message and stack in JSON mode', () => {
    const { stderr } = captureStd()
    const transport = new ConsoleTransport({ prettyPrint: false })
    const err = new Error('kaboom')

    transport.write(entry({ level: 'error', error: err }))
    const parsed = JSON.parse(stderr[0].trim())
    expect(parsed.error.message).toBe('kaboom')
    expect(parsed.error.stack).toContain('kaboom')
  })

  it('includes the error stack in pretty mode', () => {
    const { stderr } = captureStd()
    const transport = new ConsoleTransport({ prettyPrint: true, colorize: false })
    const err = new Error('kaboom')

    transport.write(entry({ level: 'error', error: err }))
    expect(stderr[0]).toContain(err.stack!.split('\n')[0])
  })

  it('supports unix timestamps in pretty mode', () => {
    const { stdout } = captureStd()
    const transport = new ConsoleTransport({
      prettyPrint: true,
      colorize: false,
      timestampFormat: 'unix',
    })

    transport.write(entry())
    expect(stdout[0]).toContain('1768473000000')
  })

  it('omits the context section when none provided (pretty mode)', () => {
    const { stdout } = captureStd()
    const transport = new ConsoleTransport({ prettyPrint: true, colorize: false })
    transport.write(entry({ context: undefined }))

    expect(stdout[0]).toBe('[2026-01-15T10:30:00.000Z] INFO  hello\n')
  })
})
