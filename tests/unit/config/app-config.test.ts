import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { BootifyStateError } from '../../../src/core/errors'
import { AppConfig, defineConfig, getConfig, isSensitiveKey, useConfig } from '../../../src/config/AppConfig'
import { ConfigValidationError } from '../../../src/config/errors'
import { applyEnv } from '../../helpers/env'

let restoreEnv: () => void

beforeEach(() => {
  restoreEnv = applyEnv({ CONFIG_DEBUG: 'false' })
  AppConfig.reset()
})

afterEach(() => {
  restoreEnv()
})

describe('AppConfig', () => {
  it('merges framework defaults with the user schema', () => {
    AppConfig.initialize(defineConfig({ APP_NAME: z.string().default('test-app') }))

    expect(AppConfig.getInstance().get('APP_NAME')).toBe('test-app')
    expect(AppConfig.getInstance().get('SERVER_PORT')).toBe(4000)
    expect(['development', 'production', 'test']).toContain(
      AppConfig.getInstance().get('NODE_ENV')
    )
  })

  it('parses boolean env values correctly (CONFIG_DEBUG=false is false)', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    AppConfig.initialize(defineConfig({}))
    expect(AppConfig.getInstance().get('CONFIG_DEBUG')).toBe(false)

    const restore = applyEnv({ CONFIG_DEBUG: undefined })
    try {
      AppConfig.reset()
      AppConfig.initialize(defineConfig({}))
      expect(AppConfig.getInstance().get('CONFIG_DEBUG')).toBe(true)
    } finally {
      restore()
      debugSpy.mockRestore()
      logSpy.mockRestore()
    }
  })

  it('prefers environment values over schema defaults', () => {
    const restore = applyEnv({ APP_NAME: 'from-env' })
    try {
      AppConfig.initialize(defineConfig({ APP_NAME: z.string().default('test-app') }))
      expect(AppConfig.getInstance().get('APP_NAME')).toBe('from-env')
    } finally {
      restore()
    }
  })

  it('getAll returns the full merged config', () => {
    AppConfig.initialize(defineConfig({}))
    const all = AppConfig.getInstance().getAll()
    expect(all).toHaveProperty('SERVER_HOST', 'localhost')
    expect(all).toHaveProperty('SERVICE_NAME', 'bootifyjs-app')
  })

  it('getSchema returns the merged zod schema', () => {
    const schema = defineConfig({ APP_NAME: z.string().default('x') })
    AppConfig.initialize(schema)
    expect(AppConfig.getInstance().getSchema()).toBeDefined()
  })

  it('throws ConfigValidationError (not process.exit) on validation failure', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as any)
    try {
      AppConfig.initialize(defineConfig({ REQUIRED_VAR: z.string() }))
      throw new Error('should not reach here')
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigValidationError)
      const configErr = err as ConfigValidationError
      expect(configErr.issues.length).toBeGreaterThan(0)
      expect(configErr.issues[0].path).toContain('REQUIRED_VAR')
      expect(exitSpy).not.toHaveBeenCalled()
    } finally {
      exitSpy.mockRestore()
    }
  })

  it('reset() enables clean re-initialization', () => {
    AppConfig.initialize(defineConfig({ APP_NAME: z.string().default('first') }))
    expect(AppConfig.getInstance().get('APP_NAME')).toBe('first')

    AppConfig.reset()
    AppConfig.initialize(defineConfig({ APP_NAME: z.string().default('second') }))
    expect(AppConfig.getInstance().get('APP_NAME')).toBe('second')
  })

  it('getInstance without initialization throws BootifyStateError', () => {
    expect(() => AppConfig.getInstance()).toThrow(BootifyStateError)
  })

  it('redacts sensitive keys when logging the config', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const restore = applyEnv({ CONFIG_DEBUG: 'true', DATABASE_URL: 'postgres://secret', API_TOKEN: 'tok' })
    try {
      AppConfig.initialize(
        defineConfig({
          DATABASE_URL: z.string().default('postgres://secret'),
          API_TOKEN: z.string().default('tok'),
          APP_NAME: z.string().default('visible'),
        })
      )

      const logged = logSpy.mock.calls.map((c) => JSON.stringify(c)).join('\n')
      expect(logged).toContain('*****')
      expect(logged).not.toContain('postgres://secret')
      expect(logged).toContain('visible')
    } finally {
      restore()
      logSpy.mockRestore()
    }
  })
})

describe('isSensitiveKey', () => {
  it('matches sensitive fragments case-insensitively', () => {
    expect(isSensitiveKey('MY_PASSWORD')).toBe(true)
    expect(isSensitiveKey('api_token')).toBe(true)
    expect(isSensitiveKey('DATABASE_URL')).toBe(true)
    expect(isSensitiveKey('SECRET_KEY')).toBe(true)
    expect(isSensitiveKey('clickhouse_password')).toBe(true)
  })

  it('does not flag ordinary keys', () => {
    expect(isSensitiveKey('SERVER_PORT')).toBe(false)
    expect(isSensitiveKey('NODE_ENV')).toBe(false)
    expect(isSensitiveKey('LOG_LEVEL')).toBe(false)
  })
})

describe('config DX helpers', () => {
  it('defineConfig returns a zod object and useConfig initializes the singleton', () => {
    const schema = defineConfig({ APP_NAME: z.string().default('dx') })
    expect(schema).toBeInstanceOf(z.ZodObject)

    useConfig(schema)
    expect(getConfig().get('APP_NAME')).toBe('dx')
  })

  it('getConfig throws BootifyStateError before initialization', () => {
    expect(() => getConfig()).toThrow(BootifyStateError)
  })
})
