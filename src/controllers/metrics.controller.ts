import { Controller, Get, Query } from '../core/decorators';
import { LoggingMetricsService } from '../logging/metrics/logging-metrics.service';
import { Logger } from '../logging';

@Controller('/metrics')
@Logger('MetricsController')
export class MetricsController {
  private metricsService: LoggingMetricsService;
  
  constructor() {
    this.metricsService = LoggingMetricsService.getInstance();
  }
  
  @Get('/')
  getMetrics() {
    return {
      metrics: this.metricsService.getMetrics(),
      timestamp: new Date().toISOString()
    };
  }
  
  @Get('/http')
  getHttpMetrics() {
    const metrics = this.metricsService.getMetrics();
    return {
      httpMetrics: metrics.httpRequests,
      timestamp: new Date().toISOString()
    };
  }
  
  @Get('/events')
  getEventMetrics() {
    const metrics = this.metricsService.getMetrics();
    return {
      eventMetrics: metrics.events,
      timestamp: new Date().toISOString()
    };
  }
  
  @Get('/audits')
  getAuditMetrics() {
    const metrics = this.metricsService.getMetrics();
    return {
      auditMetrics: metrics.audits,
      timestamp: new Date().toISOString()
    };
  }
  
  @Get('/latency')
  getLatencyMetrics(@Query('path') path?: string) {
    const metrics = this.metricsService.getMetrics();
    
    if (path) {
      const pathMetrics = this.metricsService.getPathLatencyMetrics(path);
      return {
        path,
        metrics: pathMetrics || { message: 'No metrics available for this path' },
        timestamp: new Date().toISOString()
      };
    }
    
    return {
      overallLatency: metrics.httpRequests.latency,
      byPath: this.metricsService.getMetrics().httpRequests.byPath,
      timestamp: new Date().toISOString()
    };
  }
  
  @Get('/controllers')
  getControllerMetrics() {
    const controllerMetrics = this.metricsService.getControllerMethodLatencyMetrics();
    return {
      controllerMetrics,
      timestamp: new Date().toISOString()
    };
  }
  
  @Get('/reset')
  resetMetrics() {
    this.metricsService.resetMetrics();
    return {
      message: 'Metrics reset successfully',
      timestamp: new Date().toISOString()
    };
  }
}