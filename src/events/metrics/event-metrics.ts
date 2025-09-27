import { EventPriority } from '../shared-buffer';
import { BufferedEventConfig } from '../config/buffered-event-config';
import { RetryStats } from '../retry/retry-handler';

/**
 * Worker status information
 */
export interface WorkerStatus {
  id: string;
  pid: number;
  status: 'running' | 'idle' | 'error' | 'restarting';
  eventsProcessed: number;
  lastActivity: number;
  memoryUsage: number;
  cpuUsage: number;
  errors: number;
  uptime: number;
}

/**
 * Queue metrics by priority
 */
export interface PriorityQueueMetrics {
  critical: number;
  normal: number;
  low: number;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  /** Average processing time per event (ms) */
  averageProcessingTime: number;
  
  /** 95th percentile processing time (ms) */
  p95ProcessingTime: number;
  
  /** Queue latency (time from enqueue to dequeue) */
  averageQueueLatency: number;
  
  /** Throughput metrics */
  inputRate: number; // events/sec
  processingRate: number; // events/sec
  
  /** Main thread impact */
  mainThreadCpuUsage: number;
  mainThreadMemoryUsage: number;
}

/**
 * Comprehensive event system metrics
 */
export interface EventMetrics {
  /** Timestamp of metrics collection */
  timestamp: number;
  
  /** Queue metrics */
  queueDepth: number;
  queueDepthByPriority: PriorityQueueMetrics;
  queueUtilization: number; // percentage
  
  /** Throughput metrics */
  eventsEnqueued: number;
  eventsProcessed: number;
  eventsDropped: number;
  processingRate: number; // events/sec
  
  /** Performance metrics */
  performance: PerformanceMetrics;
  
  /** Worker health */
  activeWorkers: number;
  failedWorkers: number;
  workerStatuses: WorkerStatus[];
  
  /** Error metrics */
  errorRate: number;
  deadLetterQueueSize: number;
  retryStats: RetryStats;
  
  /** Resource usage */
  memoryUsage: number; // bytes
  totalMemoryAllocated: number; // bytes
  memoryUtilization: number; // percentage
}

/**
 * Bottleneck detection report
 */
export interface BottleneckReport {
  detected: boolean;
  type: 'queue_full' | 'slow_processing' | 'worker_failure' | 'memory_pressure' | 'none';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  recommendations: string[];
  metrics: Partial<EventMetrics>;
}

/**
 * Optimization hints
 */
export interface OptimizationHint {
  type: 'scale_workers' | 'increase_memory' | 'optimize_handlers' | 'adjust_priorities';
  priority: 'low' | 'medium' | 'high';
  description: string;
  expectedImpact: string;
  implementation: string;
}

/**
 * Time-series data point
 */
interface MetricsDataPoint {
  timestamp: number;
  value: number;
}

/**
 * Event metrics collector and analyzer
 */
export class EventMetricsCollector {
  private config: BufferedEventConfig;
  private metricsHistory: EventMetrics[] = [];
  private maxHistorySize = 1000;
  
  // Counters
  private eventsEnqueued = 0;
  private eventsProcessed = 0;
  private eventsDropped = 0;
  private processingTimes: number[] = [];
  private queueLatencies: number[] = [];
  
  // Worker tracking
  private workerStatuses: Map<string, WorkerStatus> = new Map();
  
  // Performance tracking
  private lastMetricsTime = Date.now();
  private lastEventsProcessed = 0;
  
  constructor(config: BufferedEventConfig) {
    this.config = config;
  }

  /**
   * Record event enqueued
   */
  recordEventEnqueued(priority: EventPriority = 'normal'): void {
    this.eventsEnqueued++;
  }

  /**
   * Record event processed
   */
  recordEventProcessed(processingTime: number, queueLatency: number): void {
    this.eventsProcessed++;
    this.processingTimes.push(processingTime);
    this.queueLatencies.push(queueLatency);
    
    // Keep only recent processing times (last 1000)
    if (this.processingTimes.length > 1000) {
      this.processingTimes.shift();
    }
    
    if (this.queueLatencies.length > 1000) {
      this.queueLatencies.shift();
    }
  }

  /**
   * Record event dropped
   */
  recordEventDropped(): void {
    this.eventsDropped++;
  }

  /**
   * Update worker status
   */
  updateWorkerStatus(workerId: string, status: Partial<WorkerStatus>): void {
    const existing = this.workerStatuses.get(workerId) || {
      id: workerId,
      pid: 0,
      status: 'idle',
      eventsProcessed: 0,
      lastActivity: Date.now(),
      memoryUsage: 0,
      cpuUsage: 0,
      errors: 0,
      uptime: 0
    };
    
    this.workerStatuses.set(workerId, { ...existing, ...status });
  }

  /**
   * Collect current metrics
   */
  collectMetrics(
    queueDepth: number,
    queueDepthByPriority: PriorityQueueMetrics,
    memoryUsage: number,
    retryStats: RetryStats,
    deadLetterQueueSize: number
  ): EventMetrics {
    const now = Date.now();
    const timeDelta = (now - this.lastMetricsTime) / 1000; // seconds
    
    // Calculate processing rate
    const eventsProcessedDelta = this.eventsProcessed - this.lastEventsProcessed;
    const processingRate = timeDelta > 0 ? eventsProcessedDelta / timeDelta : 0;
    
    // Calculate performance metrics
    const performance = this.calculatePerformanceMetrics();
    
    // Count active/failed workers
    const workerStatuses = Array.from(this.workerStatuses.values());
    const activeWorkers = workerStatuses.filter(w => w.status === 'running' || w.status === 'idle').length;
    const failedWorkers = workerStatuses.filter(w => w.status === 'error').length;
    
    // Calculate error rate
    const totalEvents = this.eventsProcessed + retryStats.failedRetries;
    const errorRate = totalEvents > 0 ? (retryStats.failedRetries / totalEvents) * 100 : 0;
    
    // Calculate memory utilization
    const totalMemoryAllocated = this.config.maxMemoryMB * 1024 * 1024; // Convert to bytes
    const memoryUtilization = (memoryUsage / totalMemoryAllocated) * 100;
    
    const metrics: EventMetrics = {
      timestamp: now,
      queueDepth,
      queueDepthByPriority,
      queueUtilization: (queueDepth / this.config.maxQueueSize) * 100,
      eventsEnqueued: this.eventsEnqueued,
      eventsProcessed: this.eventsProcessed,
      eventsDropped: this.eventsDropped,
      processingRate,
      performance,
      activeWorkers,
      failedWorkers,
      workerStatuses,
      errorRate,
      deadLetterQueueSize,
      retryStats,
      memoryUsage,
      totalMemoryAllocated,
      memoryUtilization
    };
    
    // Store in history
    this.metricsHistory.push(metrics);
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory.shift();
    }
    
    // Update tracking variables
    this.lastMetricsTime = now;
    this.lastEventsProcessed = this.eventsProcessed;
    
    return metrics;
  }

  /**
   * Calculate performance metrics
   */
  private calculatePerformanceMetrics(): PerformanceMetrics {
    const averageProcessingTime = this.processingTimes.length > 0 
      ? this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length
      : 0;
    
    const p95ProcessingTime = this.calculatePercentile(this.processingTimes, 95);
    
    const averageQueueLatency = this.queueLatencies.length > 0
      ? this.queueLatencies.reduce((sum, latency) => sum + latency, 0) / this.queueLatencies.length
      : 0;
    
    // Calculate rates based on recent history
    const recentMetrics = this.metricsHistory.slice(-10); // Last 10 data points
    const inputRate = this.calculateRate(recentMetrics, 'eventsEnqueued');
    const processingRate = this.calculateRate(recentMetrics, 'eventsProcessed');
    
    return {
      averageProcessingTime,
      p95ProcessingTime,
      averageQueueLatency,
      inputRate,
      processingRate,
      mainThreadCpuUsage: this.estimateMainThreadCpuUsage(),
      mainThreadMemoryUsage: process.memoryUsage().heapUsed
    };
  }

  /**
   * Calculate percentile from array of numbers
   */
  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Calculate rate from metrics history
   */
  private calculateRate(metrics: EventMetrics[], field: keyof EventMetrics): number {
    if (metrics.length < 2) return 0;
    
    const latest = metrics[metrics.length - 1];
    const previous = metrics[0];
    const timeDelta = (latest.timestamp - previous.timestamp) / 1000; // seconds
    
    if (timeDelta <= 0) return 0;
    
    const valueDelta = (latest[field] as number) - (previous[field] as number);
    return valueDelta / timeDelta;
  }

  /**
   * Estimate main thread CPU usage (simplified)
   */
  private estimateMainThreadCpuUsage(): number {
    // This is a simplified estimation
    // In a real implementation, you might use process.cpuUsage()
    const queueOperationsPerSecond = this.eventsEnqueued / (Date.now() / 1000);
    const estimatedCpuUsage = Math.min(queueOperationsPerSecond * 0.001, 5); // Cap at 5%
    return estimatedCpuUsage;
  }

  /**
   * Get queue depth by priority
   */
  getQueueDepthByPriority(): PriorityQueueMetrics {
    // This would be implemented by the SharedEventBuffer
    // For now, return a placeholder
    return {
      critical: 0,
      normal: 0,
      low: 0
    };
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(limit?: number): EventMetrics[] {
    const history = [...this.metricsHistory];
    return limit ? history.slice(-limit) : history;
  }

  /**
   * Reset counters
   */
  resetCounters(): void {
    this.eventsEnqueued = 0;
    this.eventsProcessed = 0;
    this.eventsDropped = 0;
    this.processingTimes.length = 0;
    this.queueLatencies.length = 0;
    this.lastEventsProcessed = 0;
  }

  /**
   * Clear metrics history
   */
  clearHistory(): void {
    this.metricsHistory.length = 0;
  }

  /**
   * Get current worker count
   */
  getWorkerCount(): { active: number; failed: number; total: number } {
    const statuses = Array.from(this.workerStatuses.values());
    const active = statuses.filter(w => w.status === 'running' || w.status === 'idle').length;
    const failed = statuses.filter(w => w.status === 'error').length;
    
    return {
      active,
      failed,
      total: statuses.length
    };
  }

  /**
   * Remove worker from tracking
   */
  removeWorker(workerId: string): void {
    this.workerStatuses.delete(workerId);
  }
}