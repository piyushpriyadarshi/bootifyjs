import { EventMetrics, WorkerStatus, BottleneckReport, OptimizationHint } from '../metrics/event-metrics';
import { BufferedEventConfig, AlertThresholds } from '../config/buffered-event-config';
import { EventMetricsCollector } from '../metrics/event-metrics';

/**
 * Health check result
 */
export interface HealthCheckResult {
  status: 'healthy' | 'warning' | 'critical';
  timestamp: number;
  checks: HealthCheck[];
  overallScore: number; // 0-100
  recommendations: string[];
}

/**
 * Individual health check
 */
export interface HealthCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  value: number;
  threshold: number;
  message: string;
  impact: 'low' | 'medium' | 'high';
}

/**
 * Alert information
 */
export interface Alert {
  id: string;
  type: 'queue_depth' | 'processing_rate' | 'worker_failure' | 'memory_usage' | 'error_rate';
  severity: 'warning' | 'critical';
  message: string;
  timestamp: number;
  metrics: Partial<EventMetrics>;
  acknowledged: boolean;
}

/**
 * System health trends
 */
export interface HealthTrends {
  queueDepthTrend: 'increasing' | 'decreasing' | 'stable';
  processingRateTrend: 'increasing' | 'decreasing' | 'stable';
  errorRateTrend: 'increasing' | 'decreasing' | 'stable';
  memoryUsageTrend: 'increasing' | 'decreasing' | 'stable';
  overallTrend: 'improving' | 'degrading' | 'stable';
}

/**
 * Event system health monitor
 */
export class EventSystemHealthMonitor {
  private config: BufferedEventConfig;
  private metricsCollector: EventMetricsCollector;
  private alerts: Alert[] = [];
  private maxAlertsHistory = 100;
  private lastHealthCheck?: HealthCheckResult;

  constructor(config: BufferedEventConfig, metricsCollector: EventMetricsCollector) {
    this.config = config;
    this.metricsCollector = metricsCollector;
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(): Promise<HealthCheckResult> {
    const metrics = this.metricsCollector.collectMetrics(
      0, // These would come from actual buffer
      { critical: 0, normal: 0, low: 0 },
      0,
      { totalRetries: 0, successfulRetries: 0, failedRetries: 0, deadLetterCount: 0, averageRetryDelay: 0 },
      0
    );

    const checks: HealthCheck[] = [
      this.checkQueueDepth(metrics),
      this.checkProcessingRate(metrics),
      this.checkWorkerHealth(metrics),
      this.checkMemoryUsage(metrics),
      this.checkErrorRate(metrics),
      this.checkMainThreadImpact(metrics)
    ];

    const overallScore = this.calculateOverallScore(checks);
    const status = this.determineOverallStatus(checks, overallScore);
    const recommendations = this.generateRecommendations(checks, metrics);

    const result: HealthCheckResult = {
      status,
      timestamp: Date.now(),
      checks,
      overallScore,
      recommendations
    };

    this.lastHealthCheck = result;
    this.processAlerts(checks, metrics);

    return result;
  }

  /**
   * Check queue depth health
   */
  private checkQueueDepth(metrics: EventMetrics): HealthCheck {
    const threshold = this.config.monitoring.alertThresholds.queueDepthWarning;
    const utilization = metrics.queueUtilization;
    
    let status: 'pass' | 'warn' | 'fail' = 'pass';
    let message = 'Queue depth is healthy';
    let impact: 'low' | 'medium' | 'high' = 'low';

    if (utilization > 90) {
      status = 'fail';
      message = 'Queue is critically full - events may be dropped';
      impact = 'high';
    } else if (utilization > 70) {
      status = 'warn';
      message = 'Queue depth is high - monitor for potential bottlenecks';
      impact = 'medium';
    }

    return {
      name: 'Queue Depth',
      status,
      value: utilization,
      threshold: 70,
      message,
      impact
    };
  }

  /**
   * Check processing rate health
   */
  private checkProcessingRate(metrics: EventMetrics): HealthCheck {
    const threshold = this.config.monitoring.alertThresholds.processingRateMin;
    const rate = metrics.processingRate;
    
    let status: 'pass' | 'warn' | 'fail' = 'pass';
    let message = 'Processing rate is healthy';
    let impact: 'low' | 'medium' | 'high' = 'low';

    if (rate < threshold * 0.5) {
      status = 'fail';
      message = 'Processing rate is critically low';
      impact = 'high';
    } else if (rate < threshold) {
      status = 'warn';
      message = 'Processing rate is below target';
      impact = 'medium';
    }

    return {
      name: 'Processing Rate',
      status,
      value: rate,
      threshold,
      message,
      impact
    };
  }

  /**
   * Check worker health
   */
  private checkWorkerHealth(metrics: EventMetrics): HealthCheck {
    const failedWorkers = metrics.failedWorkers;
    const totalWorkers = metrics.activeWorkers + failedWorkers;
    const failureRate = totalWorkers > 0 ? (failedWorkers / totalWorkers) * 100 : 0;
    
    let status: 'pass' | 'warn' | 'fail' = 'pass';
    let message = 'All workers are healthy';
    let impact: 'low' | 'medium' | 'high' = 'low';

    if (failureRate > 50) {
      status = 'fail';
      message = 'Majority of workers have failed';
      impact = 'high';
    } else if (failedWorkers > 0) {
      status = 'warn';
      message = `${failedWorkers} worker(s) have failed`;
      impact = 'medium';
    }

    return {
      name: 'Worker Health',
      status,
      value: failureRate,
      threshold: 0,
      message,
      impact
    };
  }

  /**
   * Check memory usage health
   */
  private checkMemoryUsage(metrics: EventMetrics): HealthCheck {
    const utilization = metrics.memoryUtilization;
    
    let status: 'pass' | 'warn' | 'fail' = 'pass';
    let message = 'Memory usage is healthy';
    let impact: 'low' | 'medium' | 'high' = 'low';

    if (utilization > 90) {
      status = 'fail';
      message = 'Memory usage is critically high';
      impact = 'high';
    } else if (utilization > 75) {
      status = 'warn';
      message = 'Memory usage is high';
      impact = 'medium';
    }

    return {
      name: 'Memory Usage',
      status,
      value: utilization,
      threshold: 75,
      message,
      impact
    };
  }

  /**
   * Check error rate health
   */
  private checkErrorRate(metrics: EventMetrics): HealthCheck {
    const errorRate = metrics.errorRate;
    
    let status: 'pass' | 'warn' | 'fail' = 'pass';
    let message = 'Error rate is healthy';
    let impact: 'low' | 'medium' | 'high' = 'low';

    if (errorRate > 10) {
      status = 'fail';
      message = 'Error rate is critically high';
      impact = 'high';
    } else if (errorRate > 5) {
      status = 'warn';
      message = 'Error rate is elevated';
      impact = 'medium';
    }

    return {
      name: 'Error Rate',
      status,
      value: errorRate,
      threshold: 5,
      message,
      impact
    };
  }

  /**
   * Check main thread impact
   */
  private checkMainThreadImpact(metrics: EventMetrics): HealthCheck {
    const cpuUsage = metrics.performance.mainThreadCpuUsage;
    const threshold = this.config.performanceLimits.maxMainThreadImpact;
    
    let status: 'pass' | 'warn' | 'fail' = 'pass';
    let message = 'Main thread impact is minimal';
    let impact: 'low' | 'medium' | 'high' = 'low';

    if (cpuUsage > threshold * 2) {
      status = 'fail';
      message = 'Main thread is heavily impacted';
      impact = 'high';
    } else if (cpuUsage > threshold) {
      status = 'warn';
      message = 'Main thread impact is above target';
      impact = 'medium';
    }

    return {
      name: 'Main Thread Impact',
      status,
      value: cpuUsage,
      threshold,
      message,
      impact
    };
  }

  /**
   * Calculate overall health score
   */
  private calculateOverallScore(checks: HealthCheck[]): number {
    let totalScore = 0;
    let totalWeight = 0;

    for (const check of checks) {
      let score = 100;
      let weight = 1;

      // Adjust score based on status
      if (check.status === 'warn') {
        score = 70;
      } else if (check.status === 'fail') {
        score = 30;
      }

      // Adjust weight based on impact
      if (check.impact === 'high') {
        weight = 3;
      } else if (check.impact === 'medium') {
        weight = 2;
      }

      totalScore += score * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 100;
  }

  /**
   * Determine overall status
   */
  private determineOverallStatus(
    checks: HealthCheck[], 
    score: number
  ): 'healthy' | 'warning' | 'critical' {
    const hasFailures = checks.some(check => check.status === 'fail');
    const hasWarnings = checks.some(check => check.status === 'warn');
    const hasHighImpactIssues = checks.some(check => 
      (check.status === 'fail' || check.status === 'warn') && check.impact === 'high'
    );

    if (hasFailures || hasHighImpactIssues || score < 50) {
      return 'critical';
    } else if (hasWarnings || score < 80) {
      return 'warning';
    } else {
      return 'healthy';
    }
  }

  /**
   * Generate recommendations based on health checks
   */
  private generateRecommendations(checks: HealthCheck[], metrics: EventMetrics): string[] {
    const recommendations: string[] = [];

    for (const check of checks) {
      if (check.status === 'fail' || check.status === 'warn') {
        switch (check.name) {
          case 'Queue Depth':
            recommendations.push('Consider increasing worker count or optimizing event handlers');
            break;
          case 'Processing Rate':
            recommendations.push('Review event handler performance and consider scaling workers');
            break;
          case 'Worker Health':
            recommendations.push('Investigate worker failures and restart failed workers');
            break;
          case 'Memory Usage':
            recommendations.push('Consider increasing memory limits or reducing queue size');
            break;
          case 'Error Rate':
            recommendations.push('Review event handlers for errors and improve error handling');
            break;
          case 'Main Thread Impact':
            recommendations.push('Optimize event enqueuing logic to reduce main thread overhead');
            break;
        }
      }
    }

    return recommendations;
  }

  /**
   * Process alerts based on health checks
   */
  private processAlerts(checks: HealthCheck[], metrics: EventMetrics): void {
    for (const check of checks) {
      if (check.status === 'fail' || (check.status === 'warn' && check.impact === 'high')) {
        const alertType = this.mapCheckToAlertType(check.name);
        const severity = check.status === 'fail' ? 'critical' : 'warning';
        
        this.createAlert(alertType, severity, check.message, metrics);
      }
    }
  }

  /**
   * Map health check name to alert type
   */
  private mapCheckToAlertType(checkName: string): Alert['type'] {
    switch (checkName) {
      case 'Queue Depth': return 'queue_depth';
      case 'Processing Rate': return 'processing_rate';
      case 'Worker Health': return 'worker_failure';
      case 'Memory Usage': return 'memory_usage';
      case 'Error Rate': return 'error_rate';
      default: return 'queue_depth';
    }
  }

  /**
   * Create new alert
   */
  private createAlert(
    type: Alert['type'], 
    severity: Alert['severity'], 
    message: string, 
    metrics: EventMetrics
  ): void {
    const alert: Alert = {
      id: `${type}_${Date.now()}`,
      type,
      severity,
      message,
      timestamp: Date.now(),
      metrics: {
        queueDepth: metrics.queueDepth,
        processingRate: metrics.processingRate,
        errorRate: metrics.errorRate,
        memoryUtilization: metrics.memoryUtilization
      },
      acknowledged: false
    };

    this.alerts.push(alert);
    
    // Limit alerts history
    if (this.alerts.length > this.maxAlertsHistory) {
      this.alerts.shift();
    }

    console.warn(`[EventSystem Alert] ${severity.toUpperCase()}: ${message}`);
  }

  /**
   * Detect bottlenecks in the system
   */
  detectBottlenecks(): BottleneckReport {
    if (!this.lastHealthCheck) {
      return {
        detected: false,
        type: 'none',
        severity: 'low',
        description: 'No health check data available',
        recommendations: [],
        metrics: {}
      };
    }

    const criticalChecks = this.lastHealthCheck.checks.filter(c => c.status === 'fail');
    const warningChecks = this.lastHealthCheck.checks.filter(c => c.status === 'warn');

    if (criticalChecks.length === 0 && warningChecks.length === 0) {
      return {
        detected: false,
        type: 'none',
        severity: 'low',
        description: 'No bottlenecks detected',
        recommendations: [],
        metrics: {}
      };
    }

    // Determine primary bottleneck
    const primaryIssue = criticalChecks[0] || warningChecks[0];
    const type = this.mapCheckToBottleneckType(primaryIssue.name);
    const severity = criticalChecks.length > 0 ? 'critical' : 'medium';

    return {
      detected: true,
      type,
      severity,
      description: primaryIssue.message,
      recommendations: this.lastHealthCheck.recommendations,
      metrics: {}
    };
  }

  /**
   * Map check name to bottleneck type
   */
  private mapCheckToBottleneckType(checkName: string): BottleneckReport['type'] {
    switch (checkName) {
      case 'Queue Depth': return 'queue_full';
      case 'Processing Rate': return 'slow_processing';
      case 'Worker Health': return 'worker_failure';
      case 'Memory Usage': return 'memory_pressure';
      default: return 'slow_processing';
    }
  }

  /**
   * Suggest optimizations
   */
  suggestOptimizations(): OptimizationHint[] {
    const hints: OptimizationHint[] = [];

    if (!this.lastHealthCheck) {
      return hints;
    }

    // Analyze metrics and suggest optimizations
    const metrics = this.metricsCollector.getMetricsHistory(1)[0];
    if (!metrics) return hints;

    // Worker scaling suggestions
    if (metrics.queueUtilization > 70 && metrics.activeWorkers < 10) {
      hints.push({
        type: 'scale_workers',
        priority: 'high',
        description: 'Increase worker count to handle high queue depth',
        expectedImpact: 'Reduce queue latency by 30-50%',
        implementation: 'Increase workerCount in configuration'
      });
    }

    // Memory optimization
    if (metrics.memoryUtilization > 80) {
      hints.push({
        type: 'increase_memory',
        priority: 'medium',
        description: 'Increase memory allocation to prevent bottlenecks',
        expectedImpact: 'Prevent memory-related performance degradation',
        implementation: 'Increase maxMemoryMB in configuration'
      });
    }

    // Handler optimization
    if (metrics.performance.averageProcessingTime > 5000) {
      hints.push({
        type: 'optimize_handlers',
        priority: 'high',
        description: 'Event handlers are taking too long to process',
        expectedImpact: 'Improve processing rate by 2-3x',
        implementation: 'Review and optimize event handler implementations'
      });
    }

    return hints;
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return this.alerts.filter(alert => !alert.acknowledged);
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  /**
   * Get health trends
   */
  getHealthTrends(): HealthTrends {
    const history = this.metricsCollector.getMetricsHistory(10);
    
    if (history.length < 2) {
      return {
        queueDepthTrend: 'stable',
        processingRateTrend: 'stable',
        errorRateTrend: 'stable',
        memoryUsageTrend: 'stable',
        overallTrend: 'stable'
      };
    }

    const recent = history.slice(-3);
    const older = history.slice(0, 3);

    return {
      queueDepthTrend: this.calculateTrend(older, recent, 'queueDepth'),
      processingRateTrend: this.calculateTrend(older, recent, 'processingRate'),
      errorRateTrend: this.calculateTrend(older, recent, 'errorRate'),
      memoryUsageTrend: this.calculateTrend(older, recent, 'memoryUtilization'),
      overallTrend: 'stable' // Simplified for now
    };
  }

  /**
   * Calculate trend for a metric
   */
  private calculateTrend(
    older: EventMetrics[], 
    recent: EventMetrics[], 
    field: keyof EventMetrics
  ): 'increasing' | 'decreasing' | 'stable' {
    const olderAvg = older.reduce((sum, m) => sum + (m[field] as number), 0) / older.length;
    const recentAvg = recent.reduce((sum, m) => sum + (m[field] as number), 0) / recent.length;
    
    const changePercent = ((recentAvg - olderAvg) / olderAvg) * 100;
    
    if (changePercent > 10) return 'increasing';
    if (changePercent < -10) return 'decreasing';
    return 'stable';
  }

  /**
   * Get last health check result
   */
  getLastHealthCheck(): HealthCheckResult | undefined {
    return this.lastHealthCheck;
  }
}