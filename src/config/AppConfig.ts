import { AnyZodObject, z, ZodObject, ZodRawShape, ZodIssue } from 'zod'
import { BootifyStateError } from '../core/errors'
import { ConfigValidationError } from './errors'

// Framework-level configuration schema
const booleanFromEnv = z.preprocess(
  (val) => (val === undefined ? val : String(val).toLowerCase() === 'true'),
  z.boolean()
)

const BaseFrameworkConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SERVER_PORT: z.coerce.number().default(4000),
  SERVER_HOST: z.string().default('localhost'),
  //   LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('debug'),
  // `z.coerce.boolean()` would treat the string 'false' as `true` — parse real
  // boolean env values instead ('false'/'0'/'no' → false, undefined → default).
  CONFIG_DEBUG: booleanFromEnv.default(true),
})

const LoggingConfigSchema = z.object({
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('debug')
    .transform((val, ctx) => {
      // If no explicit LOG_LEVEL is set, use 'info' for production, 'debug' otherwise
      if (val === 'debug' && !process.env.LOG_LEVEL && process.env.NODE_ENV === 'production') {
        return 'info'
      }
      return val
    }),
  SERVICE_NAME: z.string().default('bootifyjs-app'),

  // ClickHouse Configuration
  CLICKHOUSE_ENABLED: z
    .preprocess((val) => String(val).toLowerCase() === 'true', z.boolean())
    .default(true),
  CLICKHOUSE_URL: z.string().url().default('http://localhost:8123'),
  CLICKHOUSE_USER: z.string().default('default'),
  CLICKHOUSE_PASSWORD: z.string().default(''),
  CLICKHOUSE_DB: z.string().default('default'),
})

const FrameworkConfigSchema = BaseFrameworkConfigSchema.merge(LoggingConfigSchema).passthrough()

type FrameworkConfig = z.infer<typeof FrameworkConfigSchema>

/** Keys whose values are redacted when the config is logged. */
const SENSITIVE_KEY_FRAGMENTS = ['password', 'secret', 'key', 'token', 'database_url']

/** Returns true when a config key holds a sensitive value (used for log redaction). */
export function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase()
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => lower.includes(fragment))
}

export class AppConfig<T extends ZodRawShape> {
  private static instance: AppConfig<any>
  private config: FrameworkConfig & z.infer<ZodObject<T>>
  private mergedSchema: AnyZodObject

  private constructor(userSchema?: ZodObject<T>) {
    // Merge framework and user schemas
    this.mergedSchema = FrameworkConfigSchema.merge(userSchema || z.object({})).passthrough()

    // Validate and load configuration
    this.config = this.validateConfig()

    // Optional debug output
    if (this.get('CONFIG_DEBUG')) {
      this.logConfig()
    }
  }

  /**
   * Get the singleton instance of AppConfig
   * @param userSchema Optional user configuration schema (only used on first instantiation)
   * @returns The AppConfig instance
   */
  public static getInstance<T extends ZodRawShape>(userSchema?: ZodObject<T>): AppConfig<T> {
    if (!AppConfig.instance) {
      if (!userSchema) {
        throw new BootifyStateError(
          'AppConfig has not been initialized. Call useConfig(schema) (or AppConfig.initialize) first.'
        )
      }
      AppConfig.instance = new AppConfig(userSchema)
    }
    return AppConfig.instance
  }

  /** Reset the singleton (tests / HMR). The next initialize() starts fresh. */
  public static reset(): void {
    AppConfig.instance = undefined as unknown as AppConfig<any>
  }

  /**
   * Initialize the singleton instance (must be called once before getInstance)
   * @param userSchema User configuration schema
   */
  public static initialize<T extends ZodRawShape>(userSchema: ZodObject<T>): void {
    if (AppConfig.instance) {
      console.warn('AppConfig is already initialized. Reinitializing with new schema.')
    }
    AppConfig.instance = new AppConfig(userSchema)
  }

  private validateConfig(): FrameworkConfig & z.infer<ZodObject<T>> {
    const result = this.mergedSchema.safeParse(process.env)

    if (!result.success) {
      const formattedErrors = result.error.format()
      const errorMessages = Object.entries(formattedErrors)
        .filter(([key]) => key !== '_errors')
        .map(([key, value]) => `- ${key}: ${(value as any)._errors.join(', ')}`)
        .join('\n')

      throw new ConfigValidationError(
        `Configuration validation failed:\n${errorMessages}`,
        result.error.issues as ZodIssue[]
      )
    }

    return result.data as FrameworkConfig & z.infer<ZodObject<T>>
  }

  /**
   * Get a configuration value by key
   * @param key The configuration key to retrieve
   * @returns The configuration value
   */
  get<K extends keyof (FrameworkConfig & z.infer<ZodObject<T>>)>(
    key: K
  ): (FrameworkConfig & z.infer<ZodObject<T>>)[K] {
    const value = this.config[key]

    if (this.config['CONFIG_DEBUG']) {
      console.debug(`Config access: ${String(key)} =>`, value)
    }

    return value
  }

  /**
   * Get the entire configuration object
   * @returns The complete configuration object
   */
  getAll(): FrameworkConfig & z.infer<ZodObject<T>> {
    return { ...this.config }
  }

  /**
   * Get the merged schema for introspection
   * @returns The Zod schema object
   */
  getSchema(): AnyZodObject {
    return this.mergedSchema
  }

  /**
   * Log the current configuration (redacts sensitive fields)
   */
  private logConfig(): void {
    const configToLog = { ...this.config }

    Object.keys(configToLog).forEach((key) => {
      if (isSensitiveKey(key)) {
        configToLog[key as keyof typeof configToLog] = '*****' as any
      }
    })

    console.log('Loaded configuration:', configToLog)
  }
}

/**
 * Typed identity helper for app configuration schemas. Pairs with
 * `useConfig(schema)` / `app.config`.
 */
export function defineConfig<T extends ZodRawShape>(shape: T): ZodObject<T> {
  return z.object(shape)
}

/** Initialize the application config (module-level alias for AppConfig.initialize). */
export function useConfig<T extends ZodRawShape>(schema: ZodObject<T>): void {
  AppConfig.initialize(schema)
}

/** Access the initialized app config. Throws BootifyStateError if useConfig was never called. */
export function getConfig<T extends ZodRawShape>(): AppConfig<T> {
  return AppConfig.getInstance<T>()
}
