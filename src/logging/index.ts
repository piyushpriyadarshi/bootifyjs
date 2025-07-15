export { LoggerService } from './core/logger.service';
export { LogContextService } from './core/log-context.service';
export { StartupLoggerService } from './core/startup-logger.service';
export { LoggingConfigService } from './config/logging.config';
export { contextMiddleware } from './middleware/context.middleware';
export { createRequestLoggingMiddleware } from './middleware/request-logging.middleware';
export { Log, Logger } from './decorators/log.decorator';
export { Audit } from './decorators/audit.decorator';
export { LoggingMetricsService } from './metrics/logging-metrics.service';
export * from './types/logging.types';

// Import the classes for use in configureLogging
import { LoggingConfigService } from './config/logging.config';
import { LoggerService } from './core/logger.service';
import { StartupLoggerService } from './core/startup-logger.service';
import { LoggingMetricsService } from './metrics/logging-metrics.service';

// Auto-configure logging
export async function configureLogging() {
  const config = await LoggingConfigService.createConfig();
  const logger = LoggerService.getInstance(config);
  const startupLogger = StartupLoggerService.getInstance(logger);
  const metricsService = LoggingMetricsService.getInstance();
  
  return { logger, startupLogger, metricsService, config };
}