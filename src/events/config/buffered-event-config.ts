import { EventPriority } from '../shared-buffer';

/**
 * Configuration for buffered event processing system
 */
export interface BufferedEventConfig {
  /** Enable/disable buffered event processing */
  enabled: boolean;
  
  /** Number of worker threads to spawn */
  workerCount: number;
  
  /** Maximum number of events in queue */
  maxQueueSize: number;
  
  /** Maximum memory allocation in MB */
  maxMemoryMB: number;
  
  /** Maximum size per event in bytes */
  maxEventSize: number;
  
  /** Maximum retry attempts before moving to DLQ */
  retryAttempts: number;
  
  /** Retry delays in milliseconds (exponential backoff) */
  retryDelays: number[];
  
  /** Priority configuration */
  priorities: {
    critical: number;
    normal: number;
    low: number;
  };
  
  /** Memory limits */
  memoryLimits: MemoryLimits;
  
  /** Performance limits */
  performanceLimits: PerformanceLimits;
  
  /** Reliability limits */
  reliabilityLimits: ReliabilityLimits;
  
  /** Monitoring configuration */
  monitoring: MonitoringConfig;
  
  /** Fallback to synchronous processing if workers fail */
  fallbackToSync: boolean;
}

/**
 * Memory constraint configuration
 */
export interface MemoryLimits {
  /** Maximum events in buffer */
  maxQueueSize: number;
  
  /** Maximum size per event in bytes */
  maxEventSize: number;
  
  /** Total memory allocation in MB */
  totalMemoryMB: number;
  
  /** Per-worker heap limit in MB */
  workerHeapMB: number;
}

/**
 * Performance constraint configuration
 */
export interface PerformanceLimits {
  /** Maximum input rate (events/sec) */
  maxInputRate: number;
  
  /** Target processing rate (events/sec) */
  targetProcessingRate: number;
  
  /** Maximum CPU usage on main thread (%) */
  maxMainThreadImpact: number;
  
  /** Maximum queue latency for 95th percentile (ms) */
  maxQueueLatency: number;
}

/**
 * Reliability constraint configuration
 */
export interface ReliabilityLimits {
  /** Maximum retry attempts before DLQ */
  maxRetryAttempts: number;
  
  /** Delay before restarting failed worker (ms) */
  workerRestartDelay: number;
  
  /** Interval between health checks (ms) */
  healthCheckInterval: number;
  
  /** Timeout for graceful shutdown (ms) */
  gracefulShutdownTimeout: number;
}

/**
 * Monitoring and metrics configuration
 */
export interface MonitoringConfig {
  /** Enable metrics collection */
  enabled: boolean;
  
  /** Metrics collection interval (ms) */
  metricsInterval: number;
  
  /** Enable health monitoring */
  healthMonitoring: boolean;
  
  /** Health check interval (ms) */
  healthCheckInterval: number;
  
  /** Alert thresholds */
  alertThresholds: AlertThresholds;
}

/**
 * Alert threshold configuration
 */
export interface AlertThresholds {
  /** Queue depth warning threshold */
  queueDepthWarning: number;
  
  /** Processing rate degradation threshold (events/sec) */
  processingRateMin: number;
  
  /** Maximum failed workers before alert */
  maxFailedWorkers: number;
  
  /** Dead letter queue size alert threshold */
  dlqSizeAlert: number;
  
  /** Main thread CPU usage alert threshold (%) */
  mainThreadCpuAlert: number;
}

/**
 * Default configuration for buffered event processing
 */
export const defaultBufferedEventConfig: BufferedEventConfig = {
  enabled: true,
  workerCount: 5,
  maxQueueSize: 10000,
  maxMemoryMB: 50,
  maxEventSize: 5120, // 5KB
  retryAttempts: 3,
  retryDelays: [1000, 2000, 4000], // 1s, 2s, 4s
  priorities: {
    critical: 3,
    normal: 2,
    low: 1
  },
  memoryLimits: {
    maxQueueSize: 10000,
    maxEventSize: 5120,
    totalMemoryMB: 50,
    workerHeapMB: 100
  },
  performanceLimits: {
    maxInputRate: 1000,
    targetProcessingRate: 500,
    maxMainThreadImpact: 5,
    maxQueueLatency: 100
  },
  reliabilityLimits: {
    maxRetryAttempts: 3,
    workerRestartDelay: 1000,
    healthCheckInterval: 5000,
    gracefulShutdownTimeout: 10000
  },
  monitoring: {
    enabled: true,
    metricsInterval: 1000,
    healthMonitoring: true,
    healthCheckInterval: 5000,
    alertThresholds: {
      queueDepthWarning: 8000,
      processingRateMin: 0, // Set to 0 to prevent alerts when no events are being processed
      maxFailedWorkers: 1,
      dlqSizeAlert: 100,
      mainThreadCpuAlert: 10
    }
  },
  fallbackToSync: true
};

/**
 * Configuration validator
 */
export class BufferedEventConfigValidator {
  /**
   * Validate configuration and return errors if any
   */
  static validate(config: Partial<BufferedEventConfig>): string[] {
    const errors: string[] = [];

    if (config.workerCount && (config.workerCount < 1 || config.workerCount > 20)) {
      errors.push('workerCount must be between 1 and 20');
    }

    if (config.maxQueueSize && config.maxQueueSize < 100) {
      errors.push('maxQueueSize must be at least 100');
    }

    if (config.maxEventSize && config.maxEventSize < 1024) {
      errors.push('maxEventSize must be at least 1KB');
    }

    if (config.maxMemoryMB && config.maxMemoryMB < 10) {
      errors.push('maxMemoryMB must be at least 10MB');
    }

    if (config.retryAttempts && (config.retryAttempts < 0 || config.retryAttempts > 10)) {
      errors.push('retryAttempts must be between 0 and 10');
    }

    if (config.retryDelays && config.retryDelays.some(delay => delay < 100)) {
      errors.push('All retry delays must be at least 100ms');
    }

    return errors;
  }

  /**
   * Merge user config with defaults
   */
  static mergeWithDefaults(userConfig: Partial<BufferedEventConfig>): BufferedEventConfig {
    return {
      ...defaultBufferedEventConfig,
      ...userConfig,
      memoryLimits: {
        ...defaultBufferedEventConfig.memoryLimits,
        ...userConfig.memoryLimits
      },
      performanceLimits: {
        ...defaultBufferedEventConfig.performanceLimits,
        ...userConfig.performanceLimits
      },
      reliabilityLimits: {
        ...defaultBufferedEventConfig.reliabilityLimits,
        ...userConfig.reliabilityLimits
      },
      monitoring: {
        ...defaultBufferedEventConfig.monitoring,
        ...userConfig.monitoring,
        alertThresholds: {
          ...defaultBufferedEventConfig.monitoring.alertThresholds,
          ...userConfig.monitoring?.alertThresholds
        }
      }
    };
  }
}

/**
 * Environment-based configuration loader
 */
export class BufferedEventConfigLoader {
  /**
   * Load configuration from environment variables
   */
  static fromEnvironment(): Partial<BufferedEventConfig> {
    const config: Partial<BufferedEventConfig> = {};

    if (process.env.BUFFERED_EVENTS_ENABLED) {
      config.enabled = process.env.BUFFERED_EVENTS_ENABLED === 'true';
    }

    if (process.env.BUFFERED_EVENTS_WORKER_COUNT) {
      config.workerCount = parseInt(process.env.BUFFERED_EVENTS_WORKER_COUNT, 10);
    }

    if (process.env.BUFFERED_EVENTS_MAX_QUEUE_SIZE) {
      config.maxQueueSize = parseInt(process.env.BUFFERED_EVENTS_MAX_QUEUE_SIZE, 10);
    }

    if (process.env.BUFFERED_EVENTS_MAX_MEMORY_MB) {
      config.maxMemoryMB = parseInt(process.env.BUFFERED_EVENTS_MAX_MEMORY_MB, 10);
    }

    if (process.env.BUFFERED_EVENTS_RETRY_ATTEMPTS) {
      config.retryAttempts = parseInt(process.env.BUFFERED_EVENTS_RETRY_ATTEMPTS, 10);
    }

    return config;
  }

  /**
   * Load configuration from file
   */
  static fromFile(filePath: string): Partial<BufferedEventConfig> {
    try {
      const fs = require('fs');
      const configData = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(configData);
    } catch (error) {
      console.warn(`Failed to load buffered event config from ${filePath}:`, error);
      return {};
    }
  }
}

/**
 * Priority helper functions
 */
export class PriorityHelper {
  /**
   * Get numeric priority value
   */
  static getPriorityValue(priority: EventPriority, config: BufferedEventConfig): number {
    return config.priorities[priority] || config.priorities.normal;
  }

  /**
   * Compare priorities (higher number = higher priority)
   */
  static comparePriorities(a: EventPriority, b: EventPriority, config: BufferedEventConfig): number {
    const priorityA = this.getPriorityValue(a, config);
    const priorityB = this.getPriorityValue(b, config);
    return priorityB - priorityA; // Higher priority first
  }

  /**
   * Check if priority is valid
   */
  static isValidPriority(priority: string): priority is EventPriority {
    return ['critical', 'normal', 'low'].includes(priority);
  }
}