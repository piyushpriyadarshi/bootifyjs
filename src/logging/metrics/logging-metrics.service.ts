import { LoggingMetrics } from '../types/logging.types';
import { LoggerService } from '../core/logger.service';
import { Logger } from '../decorators/log.decorator';

@Logger('LoggingMetricsService')
export class LoggingMetricsService {
  private static instance: LoggingMetricsService;
  private logger!: LoggerService;
  
  private metrics: LoggingMetrics = {
    httpRequests: {
      total: 0,
      byStatusCode: {},
      byMethod: {},
      byPath: {},
      latency: {
        min: Number.MAX_VALUE,
        max: 0,
        avg: 0
      }
    },
    events: {
      total: 0,
      byType: {},
      byStatus: {}
    },
    audits: {
      total: 0,
      byAction: {},
      byResource: {}
    }
  };
  
  private totalLatency = 0;
  private requestCount = 0;
  
  private constructor() {}
  
  static getInstance(): LoggingMetricsService {
    if (!LoggingMetricsService.instance) {
      LoggingMetricsService.instance = new LoggingMetricsService();
    }
    return LoggingMetricsService.instance;
  }
  
  /**
   * Track HTTP request metrics
   */
  trackHttpRequest(method: string, path: string, statusCode: number, latency: number): void {
    // Update total requests
    this.metrics.httpRequests.total++;
    
    // Update by status code
    this.metrics.httpRequests.byStatusCode[statusCode] = 
      (this.metrics.httpRequests.byStatusCode[statusCode] || 0) + 1;
    
    // Update by method
    this.metrics.httpRequests.byMethod[method] = 
      (this.metrics.httpRequests.byMethod[method] || 0) + 1;
    
    // Update by path
    this.metrics.httpRequests.byPath[path] = 
      (this.metrics.httpRequests.byPath[path] || 0) + 1;
    
    // Update latency metrics
    if (latency < this.metrics.httpRequests.latency.min) {
      this.metrics.httpRequests.latency.min = latency;
    }
    
    if (latency > this.metrics.httpRequests.latency.max) {
      this.metrics.httpRequests.latency.max = latency;
    }
    
    this.totalLatency += latency;
    this.requestCount++;
    this.metrics.httpRequests.latency.avg = this.totalLatency / this.requestCount;
    
    // Log slow requests
    if (latency > 1000) {
      this.logger.warn('Slow HTTP request detected', {
        method,
        path,
        statusCode,
        latency,
        component: 'LoggingMetrics'
      });
    }
  }
  
  /**
   * Track event metrics
   */
  trackEvent(eventType: string, eventName: string, status: string): void {
    // Update total events
    this.metrics.events.total++;
    
    // Update by type
    this.metrics.events.byType[eventType] = 
      (this.metrics.events.byType[eventType] || 0) + 1;
    
    // Update by status
    this.metrics.events.byStatus[status] = 
      (this.metrics.events.byStatus[status] || 0) + 1;
  }
  
  /**
   * Track audit metrics
   */
  trackAudit(action: string, resource: string): void {
    // Update total audits
    this.metrics.audits.total++;
    
    // Update by action
    this.metrics.audits.byAction[action] = 
      (this.metrics.audits.byAction[action] || 0) + 1;
    
    // Update by resource
    this.metrics.audits.byResource[resource] = 
      (this.metrics.audits.byResource[resource] || 0) + 1;
  }
  
  /**
   * Get current metrics
   */
  getMetrics(): LoggingMetrics {
    return { ...this.metrics };
  }
  
  /**
   * Get HTTP latency metrics for a specific path
   */
  getPathLatencyMetrics(path: string): { count: number; min: number; max: number; avg: number } | null {
    // This would require additional tracking per path
    // For now, return null or implement a more detailed tracking mechanism
    return null;
  }
  
  /**
   * Get controller method latency metrics
   */
  getControllerMethodLatencyMetrics(): Record<string, { count: number; min: number; max: number; avg: number }> {
    // This would require tracking per controller method
    // For now, return an empty object or implement a more detailed tracking mechanism
    return {};
  }
  
  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      httpRequests: {
        total: 0,
        byStatusCode: {},
        byMethod: {},
        byPath: {},
        latency: {
          min: Number.MAX_VALUE,
          max: 0,
          avg: 0
        }
      },
      events: {
        total: 0,
        byType: {},
        byStatus: {}
      },
      audits: {
        total: 0,
        byAction: {},
        byResource: {}
      }
    };
    
    this.totalLatency = 0;
    this.requestCount = 0;
    
    this.logger.info('Metrics reset', { component: 'LoggingMetrics' });
  }
}