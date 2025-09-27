import { EventEmitter } from 'events';
import { SharedEventBuffer, PriorityEvent, EventPriority } from './shared-buffer';
import { WorkerManager } from './worker/worker-manager';
import { EventMetricsCollector } from './metrics/event-metrics';
import { EventSystemHealthMonitor } from './monitoring/health-monitor';
import { RetryHandler } from './retry/retry-handler';
import { BufferedEventConfig, BufferedEventConfigLoader, BufferedEventConfigValidator } from './config/buffered-event-config';
import { IEventHandler } from './event.types';

/**
 * Simple logger implementation
 */
class Logger {
  constructor(private context: string) {}
  
  log(message: string, data?: any): void {
    console.log(`[${this.context}] ${message}`, data || '');
  }
  
  warn(message: string, data?: any): void {
    console.warn(`[${this.context}] ${message}`, data || '');
  }
  
  error(message: string, error?: any): void {
    console.error(`[${this.context}] ${message}`, error || '');
  }
}

/**
 * Event processing result
 */
export interface EventProcessingResult {
  success: boolean;
  eventId: string;
  processingTime?: number;
  error?: string;
  retryCount?: number;
}

/**
 * Buffered event bus service options
 */
export interface BufferedEventBusOptions {
  config?: Partial<BufferedEventConfig>;
  fallbackToSync?: boolean;
  enableMetrics?: boolean;
  enableHealthMonitoring?: boolean;
}

/**
 * Main service for buffered event processing
 * Provides thread-safe, high-performance event processing with worker threads
 */
export class BufferedEventBusService extends EventEmitter {
  private readonly logger = new Logger(BufferedEventBusService.name);
  
  private config: BufferedEventConfig;
  private sharedBuffer!: SharedEventBuffer;
  private workerManager!: WorkerManager;
  private metricsCollector!: EventMetricsCollector;
  private healthMonitor!: EventSystemHealthMonitor;
  private retryHandler!: RetryHandler;
  
  private handlers: Map<string, IEventHandler> = new Map();
  private isInitialized = false;
  private isShuttingDown = false;
  
  // Fallback processing
  private fallbackToSync: boolean;
  private syncProcessingQueue: PriorityEvent[] = [];
  private syncProcessingInterval?: NodeJS.Timeout;
  
  // Metrics and monitoring
  private metricsInterval?: NodeJS.Timeout;
  private healthCheckInterval?: NodeJS.Timeout;
  
  constructor(options: BufferedEventBusOptions = {}) {
    super();
    
    // Load and validate configuration
    const userConfig = options.config || {};
    const envConfig = BufferedEventConfigLoader.fromEnvironment();
    const mergedConfig = { ...userConfig, ...envConfig };
    
    const validationErrors = BufferedEventConfigValidator.validate(mergedConfig);
    if (validationErrors.length > 0) {
      throw new Error(`Invalid buffered event configuration: ${validationErrors.join(', ')}`);
    }
    
    this.config = BufferedEventConfigValidator.mergeWithDefaults(mergedConfig);
    this.fallbackToSync = options.fallbackToSync ?? this.config.fallbackToSync;
    
    this.logger.log('BufferedEventBusService initialized with configuration', {
      workerCount: this.config.workerCount,
      maxQueueSize: this.config.maxQueueSize,
      maxMemoryMB: this.config.maxMemoryMB,
      fallbackToSync: this.fallbackToSync
    });
  }

  /**
   * Initialize the buffered event bus service
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.warn('Buffered event processing is disabled');
      return;
    }
    
    try {
      await this.initializeComponents();
      this.logger.log('BufferedEventBusService successfully initialized');
    } catch (error) {
      this.logger.error('Failed to initialize BufferedEventBusService', error);
      
      if (this.fallbackToSync) {
        this.logger.warn('Falling back to synchronous event processing');
        this.startSyncProcessing();
      } else {
        throw error;
      }
    }
  }

  /**
   * Initialize all components
   */
  private async initializeComponents(): Promise<void> {
    this.logger.log('Initializing buffered event processing components');
    
    // Initialize shared buffer
    this.sharedBuffer = new SharedEventBuffer({
      maxEvents: this.config.maxQueueSize,
      maxEventSize: this.config.maxEventSize,
      totalMemoryMB: this.config.maxMemoryMB
    });
    
    // Initialize metrics collector
    this.metricsCollector = new EventMetricsCollector(this.config);
    
    // Initialize retry handler
    this.retryHandler = new RetryHandler(this.config);
    
    // Initialize worker manager
    this.workerManager = new WorkerManager(
      this.config,
      this.sharedBuffer.getSharedBuffer(),
      this.metricsCollector
    );
    
    // Initialize health monitor
    this.healthMonitor = new EventSystemHealthMonitor(
      this.config,
      this.metricsCollector
    );
    
    // Setup event handlers
    this.setupEventHandlers();
    
    // Initialize worker pool
    await this.workerManager.initialize();
    
    // Start monitoring
    this.startMonitoring();
    
    this.isInitialized = true;
    this.emit('initialized');
  }

  /**
   * Setup event handlers for worker manager and health monitor
   */
  private setupEventHandlers(): void {
    // Worker manager events
    this.workerManager.on('worker_restart_failed', (workerId, error) => {
      this.logger.error(`Worker ${workerId} restart failed`, error);
      this.emit('worker_error', { workerId, error });
    });
    
    // Health monitor would emit events if it extended EventEmitter
    // For now, we'll handle this through periodic checks
  }

  /**
   * Handle detected bottlenecks with auto-scaling
   */
  private async handleBottleneck(report: any): Promise<void> {
    if (report.type === 'slow_processing' && report.severity === 'high') {
      const currentWorkers = this.workerManager.getHealthyWorkerCount();
      const maxWorkers = Math.min(currentWorkers * 2, this.config.workerCount * 2);
      
      if (currentWorkers < maxWorkers) {
        this.logger.log(`Scaling up workers from ${currentWorkers} to ${maxWorkers}`);
        await this.workerManager.scaleWorkers(maxWorkers);
      }
    }
  }

  /**
   * Start monitoring intervals
   */
  private startMonitoring(): void {
    if (this.config.monitoring.enabled) {
      // Metrics collection
      this.metricsInterval = setInterval(() => {
        this.collectAndEmitMetrics();
      }, this.config.monitoring.metricsInterval);
      
      // Health monitoring
      if (this.config.monitoring.healthMonitoring) {
        this.healthCheckInterval = setInterval(() => {
          this.performHealthCheck();
        }, this.config.monitoring.healthCheckInterval);
      }
    }
  }

  /**
   * Collect metrics and emit events
   */
  private collectAndEmitMetrics(): void {
    try {
      const queueMetrics = this.sharedBuffer.getStats();
      const retryStats = this.retryHandler.getRetryStats();
      const deadLetterQueueSize = this.retryHandler.getDeadLetterQueue().length;
      
      const metrics = this.metricsCollector.collectMetrics(
        queueMetrics.size,
        { critical: 0, normal: 0, low: 0 }, // Priority breakdown not available from current stats
        0, // Memory usage not available from current stats
        retryStats,
        deadLetterQueueSize
      );
      
      this.emit('metrics', metrics);
    } catch (error) {
      this.logger.error('Failed to collect metrics', error);
    }
  }

  /**
   * Perform health check
   */
  private async performHealthCheck(): Promise<void> {
    try {
      const healthResult = await this.healthMonitor.performHealthCheck();
      this.emit('health_check', healthResult);
      
      if (healthResult.status !== 'healthy') {
        this.logger.warn('Health check failed', healthResult);
      }
    } catch (error) {
      this.logger.error('Health check failed', error);
    }
  }

  /**
   * Register an event handler
   */
  public registerHandler(eventType: string, handler: IEventHandler): void {
    this.handlers.set(eventType, handler);
    
    if (this.isInitialized && this.workerManager) {
      this.workerManager.registerHandler(eventType, handler);
    }
    
    this.logger.log(`Registered handler for event type: ${eventType}`);
  }

  /**
   * Unregister an event handler
   */
  public unregisterHandler(eventType: string): void {
    this.handlers.delete(eventType);
    this.logger.log(`Unregistered handler for event type: ${eventType}`);
  }

  /**
   * Emit an event for processing
   */
  public async emitEvent(
    eventType: string,
    data: any,
    options: {
      priority?: EventPriority;
      timeout?: number;
      retryable?: boolean;
    } = {}
  ): Promise<EventProcessingResult> {
    const eventId = this.generateEventId();
    const priority = options.priority || 'normal';
    const timestamp = Date.now();
    
    const event: PriorityEvent = {
      type: eventType,
      payload: data,
      priority,
      timestamp,
      retryCount: 0,
      correlationId: eventId
    };
    
    try {
      // Check if system is healthy and initialized
      if (!this.isInitialized || this.isShuttingDown) {
        if (this.fallbackToSync) {
          return await this.processSyncEvent(event);
        } else {
          throw new Error('Buffered event system is not available');
        }
      }
      
      // Record event enqueued
      this.metricsCollector.recordEventEnqueued(priority);
      
      // Try to enqueue event
      const enqueued = this.sharedBuffer.enqueue(event);
      
      if (!enqueued) {
        this.metricsCollector.recordEventDropped();
        
        if (this.fallbackToSync) {
          this.logger.warn(`Queue full, processing event ${eventId} synchronously`);
          return await this.processSyncEvent(event);
        } else {
          throw new Error('Event queue is full');
        }
      }
      
      return {
        success: true,
        eventId: event.correlationId || this.generateEventId(),
        processingTime: 0 // Will be updated when processed
      };
      
    } catch (error) {
      this.logger.error(`Failed to emit event ${eventType}`, error);
      
      return {
        success: false,
        eventId,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Process event synchronously as fallback
   */
  private async processSyncEvent(event: PriorityEvent): Promise<EventProcessingResult> {
    const startTime = Date.now();
    
    try {
      const handler = this.handlers.get(event.type);
      
      if (!handler) {
        throw new Error(`No handler registered for event type: ${event.type}`);
      }
      
      await handler.handle(event);
      
      const processingTime = Date.now() - startTime;
      this.metricsCollector.recordEventProcessed(processingTime, 0);
      
      return {
        success: true,
        eventId: event.correlationId || this.generateEventId(),
        processingTime
      };
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.metricsCollector.recordEventDropped();
      
      return {
        success: false,
        eventId: event.correlationId || 'unknown',
        processingTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Start synchronous processing for fallback mode
   */
  private startSyncProcessing(): void {
    if (this.syncProcessingInterval) {
      return;
    }
    
    this.syncProcessingInterval = setInterval(async () => {
      if (this.syncProcessingQueue.length > 0) {
        const event = this.syncProcessingQueue.shift();
        if (event) {
          await this.processSyncEvent(event);
        }
      }
    }, 10); // Process every 10ms
  }

  /**
   * Get current metrics
   */
  public getMetrics(): any {
    if (!this.metricsCollector) {
      return null;
    }
    
    const queueMetrics = this.sharedBuffer?.getStats() || {
      size: 0,
      maxEvents: 0,
      utilization: 0,
      isFull: false,
      isEmpty: true,
      writeIndex: 0,
      readIndex: 0
    };
    
    const retryStats = this.retryHandler?.getRetryStats() || {
      totalRetries: 0,
      successfulRetries: 0,
      failedRetries: 0,
      deadLetterCount: 0,
      averageRetryDelay: 0
    };
    
    const deadLetterQueueSize = this.retryHandler?.getDeadLetterQueue().length || 0;
    
    return this.metricsCollector.collectMetrics(
      queueMetrics.size,
      { critical: 0, normal: 0, low: 0 }, // Priority breakdown not available
      0, // Memory usage not available
      retryStats,
      deadLetterQueueSize
    );
  }

  /**
   * Get health status
   */
  public async getHealthStatus(): Promise<any> {
    if (!this.healthMonitor) {
      return { healthy: false, reason: 'Health monitor not initialized' };
    }
    
    return await this.healthMonitor.performHealthCheck();
  }

  /**
   * Get worker statistics
   */
  public getWorkerStatistics(): any {
    if (!this.workerManager) {
      return null;
    }
    
    return {
      ...this.workerManager.getStatistics(),
      workerStatuses: this.workerManager.getWorkerStatuses()
    };
  }

  /**
   * Scale worker pool
   */
  public async scaleWorkers(targetCount: number): Promise<void> {
    if (!this.workerManager) {
      throw new Error('Worker manager not initialized');
    }
    
    await this.workerManager.scaleWorkers(targetCount);
    this.logger.log(`Scaled worker pool to ${targetCount} workers`);
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }
    
    this.logger.log('Starting graceful shutdown of BufferedEventBusService');
    this.isShuttingDown = true;
    
    // Clear intervals
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    if (this.syncProcessingInterval) {
      clearInterval(this.syncProcessingInterval);
    }
    
    // Shutdown components
    if (this.workerManager) {
      await this.workerManager.shutdown();
    }
    
    this.emit('shutdown');
    this.logger.log('BufferedEventBusService shutdown complete');
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if the service is initialized and ready
   */
  public isReady(): boolean {
    return this.isInitialized && !this.isShuttingDown;
  }

  /**
   * Get configuration
   */
  public getConfig(): BufferedEventConfig {
    return { ...this.config };
  }

  /**
   * Update configuration (requires restart)
   */
  public async updateConfig(newConfig: Partial<BufferedEventConfig>): Promise<void> {
    const validationErrors = BufferedEventConfigValidator.validate(newConfig);
    if (validationErrors.length > 0) {
      throw new Error(`Invalid configuration: ${validationErrors.join(', ')}`);
    }
    
    this.logger.log('Configuration update requested, restarting service');
    
    await this.shutdown();
    this.config = BufferedEventConfigValidator.mergeWithDefaults({
      ...this.config,
      ...newConfig
    });
    
    await this.initializeComponents();
  }
}

export { BufferedEventConfig, EventPriority, PriorityEvent };