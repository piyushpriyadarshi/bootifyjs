import { container } from '../core'
import { Logger } from './core/logger'
import { LOGGER_TOKEN, loggerFactory } from './core/logger.provider'
import { StartupLoggerService } from './core/startup.logger'

export async function intitializeLogging(): Promise<{
  logger: Logger
  startupLogger: StartupLoggerService
}> {
  console.log('🔄 Bootstrapping Logging System...')

  console.log('NODE_ENV', process.env.NODE_ENV)

  // First, ensure the config service itself is registered as a component.
  // Our @Service decorator already handles this.

  // Now, register the factory that DEPENDS on the config service.
  container.register(LOGGER_TOKEN, { useFactory: loggerFactory })

  console.log('✅ Logging System bootstrapped successfully!\n')
  return {
    logger: container.resolve<Logger>(Logger),
    startupLogger: container.resolve<StartupLoggerService>(StartupLoggerService),
  }
}

// export const logger = container.resolve<pino.Logger>(LOGGER_TOKEN)
export * from './core/decorators'
export * from './core/logger'

