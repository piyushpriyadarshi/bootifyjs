import { Middleware } from '../../core/middleware';
import { LoggerService } from '../core/logger.service';
import { LogContextService } from '../core/log-context.service';
import { RequestLoggingOptions } from '../types/logging.types';
import { LoggingMetricsService } from '../metrics/logging-metrics.service';

export const createRequestLoggingMiddleware = (options: RequestLoggingOptions = {}): Middleware => {
  return async (req, res, next) => {
    const logger = LoggerService.getInstance();
    const metricsService = LoggingMetricsService.getInstance();
    const startTime = Date.now();
    const context = LogContextService.getContext();

    // Skip logging for certain paths
    if (options.skipPaths?.some(path => req.url?.startsWith(path))) {
      await next();
      return;
    }

    const requestData: any = {
      component: 'HTTP',
      method: req.method,
      url: req.url,
      userAgent: req.headers['user-agent'],
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress
    };

    if (options.logHeaders && logger.getConfig().logHeaders) {
      requestData.headers = req.headers;
    }

    if (options.logQuery && req.url?.includes('?')) {
      try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        requestData.query = Object.fromEntries(url.searchParams);
      } catch (error) {
        // Ignore URL parsing errors
      }
    }

    logger.debug('HTTP Request started', requestData);

    // Override res.end to log response
    const originalEnd = res.end;
    res.end = function (chunk?: any, encoding?: any) {
      const duration = Date.now() - startTime;
      const responseData: any = {
        component: 'HTTP',
        logType: 'http',
        statusCode: res.statusCode,
        duration,
        contentLength: res.getHeader('content-length')
      };

      // Extract path without query parameters for metrics
      const path = req.url?.split('?')[0] || '/';
      
      // Track metrics
      metricsService.trackHttpRequest(
        req.method || 'UNKNOWN',
        path,
        res.statusCode,
        duration
      );

      // Log slow requests
      if (options.slowThreshold && duration > options.slowThreshold) {
        logger.warn('Slow HTTP Request', {
          ...requestData,
          ...responseData,
          slow: true
        });
      } else {
        const level = res.statusCode >= 400 ? 'warn' : 'info';
        logger[level]('HTTP Request completed', {
          ...requestData,
          ...responseData
        });
      }

      // Log performance metrics
      if (context && logger.getConfig().enablePerformanceLogs) {
        logger.performance({
          operation: `${req.method} ${path}`,
          duration,
          metadata: {
            statusCode: res.statusCode,
            contentLength: res.getHeader('content-length'),
            path
          }
        });
      }

      return originalEnd.call(this, chunk, encoding);
    };

    await next();
  };
};