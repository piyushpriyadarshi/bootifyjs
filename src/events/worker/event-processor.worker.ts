import { parentPort, workerData } from 'worker_threads';
import { SharedEventBuffer, PriorityEvent } from '../shared-buffer';
import { IEventHandler } from '../event.types';
import { RetryHandler, RetryableEvent } from '../retry/retry-handler';
import { BufferedEventConfig } from '../config/buffered-event-config';
import { WorkerStatus } from '../metrics/event-metrics';

/**
 * Message types for worker communication
 */
type WorkerMessage = 
  | { type: 'init'; config: BufferedEventConfig; sharedBuffer: SharedArrayBuffer }
  | { type: 'register_handler'; eventType: string; handlerCode: string }
  | { type: 'shutdown' }
  | { type: 'health_check' }
  | { type: 'get_stats' };

type WorkerResponse = 
  | { type: 'ready' }
  | { type: 'event_processed'; eventType: string; processingTime: number; success: boolean }
  | { type: 'error'; error: string; eventType?: string }
  | { type: 'health_status'; status: WorkerStatus }
  | { type: 'stats'; stats: WorkerStats }
  | { type: 'shutdown_complete' };

/**
 * Worker statistics
 */
interface WorkerStats {
  eventsProcessed: number;
  eventsSucceeded: number;
  eventsFailed: number;
  averageProcessingTime: number;
  uptime: number;
  memoryUsage: NodeJS.MemoryUsage;
}

/**
 * Event processor worker implementation
 */
class EventProcessorWorker {
  private workerId: string;
  private config!: BufferedEventConfig;
  private buffer!: SharedEventBuffer;
  private retryHandler!: RetryHandler;
  private handlers: Map<string, IEventHandler> = new Map();
  private isRunning = false;
  private isShuttingDown = false;
  
  // Statistics
  private eventsProcessed = 0;
  private eventsSucceeded = 0;
  private eventsFailed = 0;
  private processingTimes: number[] = [];
  private startTime = Date.now();
  private lastActivity = Date.now();
  
  // Health monitoring
  private healthCheckInterval?: NodeJS.Timeout;
  private processingLoop?: Promise<void>;

  constructor() {
    this.workerId = `worker_${process.pid}_${Date.now()}`;
    this.setupMessageHandling();
  }

  /**
   * Setup message handling with main thread
   */
  private setupMessageHandling(): void {
    if (!parentPort) {
      throw new Error('Worker must be run in worker thread context');
    }

    parentPort.on('message', async (message: WorkerMessage) => {
      try {
        await this.handleMessage(message);
      } catch (error) {
        this.sendError(`Failed to handle message: ${error}`);
      }
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error(`[Worker ${this.workerId}] Uncaught exception:`, error);
      this.sendError(`Uncaught exception: ${error.message}`);
      process.exit(1);
    });

    // Handle unhandled rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error(`[Worker ${this.workerId}] Unhandled rejection:`, reason);
      this.sendError(`Unhandled rejection: ${reason}`);
    });
  }

  /**
   * Handle messages from main thread
   */
  private async handleMessage(message: WorkerMessage): Promise<void> {
    switch (message.type) {
      case 'init':
        await this.initialize(message.config, message.sharedBuffer);
        break;
        
      case 'register_handler':
        this.registerHandler(message.eventType, message.handlerCode);
        break;
        
      case 'shutdown':
        await this.shutdown();
        break;
        
      case 'health_check':
        this.sendHealthStatus();
        break;
        
      case 'get_stats':
        this.sendStats();
        break;
        
      default:
        this.sendError(`Unknown message type: ${(message as any).type}`);
    }
  }

  /**
   * Initialize worker with configuration and shared buffer
   */
  private async initialize(config: BufferedEventConfig, sharedBuffer: SharedArrayBuffer): Promise<void> {
    this.config = config;
    this.buffer = new SharedEventBuffer({
      maxEvents: config.maxQueueSize,
      maxEventSize: config.maxEventSize,
      totalMemoryMB: config.maxMemoryMB
    });
    
    // Initialize buffer with existing shared memory
    (this.buffer as any).buffer = sharedBuffer;
    
    this.retryHandler = new RetryHandler(config);
    
    // Start health monitoring
    this.startHealthMonitoring();
    
    // Start processing loop
    this.isRunning = true;
    this.processingLoop = this.startProcessingLoop();
    
    this.sendMessage({ type: 'ready' });
    console.log(`[Worker ${this.workerId}] Initialized and ready`);
  }

  /**
   * Register event handler
   */
  private registerHandler(eventType: string, handlerCode: string): void {
    try {
      // Create handler from code (simplified - in production, use safer evaluation)
      const handlerFunction = new Function('event', handlerCode);
      const handler: IEventHandler = {
        handle: async (event: PriorityEvent) => {
          return handlerFunction(event);
        }
      };
      
      this.handlers.set(eventType, handler);
      console.log(`[Worker ${this.workerId}] Registered handler for event type: ${eventType}`);
    } catch (error) {
      this.sendError(`Failed to register handler for ${eventType}: ${error}`);
    }
  }

  /**
   * Start the main event processing loop
   */
  private async startProcessingLoop(): Promise<void> {
    console.log(`[Worker ${this.workerId}] Starting processing loop`);
    
    while (this.isRunning && !this.isShuttingDown) {
      try {
        const event = this.buffer.dequeue();
        
        if (event) {
          await this.processEvent(event);
          this.lastActivity = Date.now();
        } else {
          // No events available, sleep briefly to prevent busy waiting
          await this.sleep(10);
        }
      } catch (error) {
        console.error(`[Worker ${this.workerId}] Error in processing loop:`, error);
        this.sendError(`Processing loop error: ${error}`);
        
        // Brief pause before continuing to prevent error loops
        await this.sleep(100);
      }
    }
    
    console.log(`[Worker ${this.workerId}] Processing loop stopped`);
  }

  /**
   * Process a single event
   */
  private async processEvent(event: PriorityEvent): Promise<void> {
    const startTime = Date.now();
    let success = false;
    
    try {
      const handler = this.handlers.get(event.type);
      
      if (!handler) {
        throw new Error(`No handler registered for event type: ${event.type}`);
      }
      
      // Process event with retry logic
      await this.retryHandler.handleWithRetry(event, handler);
      
      success = true;
      this.eventsSucceeded++;
      
    } catch (error) {
      success = false;
      this.eventsFailed++;
      console.error(`[Worker ${this.workerId}] Failed to process event ${event.type}:`, error);
      
      this.sendMessage({
        type: 'error',
        error: `Event processing failed: ${error}`,
        eventType: event.type
      });
    } finally {
      const processingTime = Date.now() - startTime;
      this.eventsProcessed++;
      this.processingTimes.push(processingTime);
      
      // Keep only recent processing times
      if (this.processingTimes.length > 100) {
        this.processingTimes.shift();
      }
      
      this.sendMessage({
        type: 'event_processed',
        eventType: event.type,
        processingTime,
        success
      });
    }
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      this.sendHealthStatus();
    }, this.config.monitoring.healthCheckInterval);
  }

  /**
   * Send health status to main thread
   */
  private sendHealthStatus(): void {
    const memoryUsage = process.memoryUsage();
    const uptime = Date.now() - this.startTime;
    const timeSinceLastActivity = Date.now() - this.lastActivity;
    
    let status: WorkerStatus['status'] = 'running';
    
    if (this.isShuttingDown) {
      status = 'restarting';
    } else if (timeSinceLastActivity > 30000) { // 30 seconds
      status = 'idle';
    } else if (this.eventsFailed > this.eventsSucceeded && this.eventsProcessed > 10) {
      status = 'error';
    }
    
    const healthStatus: WorkerStatus = {
      id: this.workerId,
      pid: process.pid,
      status,
      eventsProcessed: this.eventsProcessed,
      lastActivity: this.lastActivity,
      memoryUsage: memoryUsage.heapUsed,
      cpuUsage: 0, // Simplified - would need more complex calculation
      errors: this.eventsFailed,
      uptime
    };
    
    this.sendMessage({ type: 'health_status', status: healthStatus });
  }

  /**
   * Send worker statistics
   */
  private sendStats(): void {
    const averageProcessingTime = this.processingTimes.length > 0
      ? this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length
      : 0;
    
    const stats: WorkerStats = {
      eventsProcessed: this.eventsProcessed,
      eventsSucceeded: this.eventsSucceeded,
      eventsFailed: this.eventsFailed,
      averageProcessingTime,
      uptime: Date.now() - this.startTime,
      memoryUsage: process.memoryUsage()
    };
    
    this.sendMessage({ type: 'stats', stats });
  }

  /**
   * Shutdown worker gracefully
   */
  private async shutdown(): Promise<void> {
    console.log(`[Worker ${this.workerId}] Starting graceful shutdown`);
    this.isShuttingDown = true;
    this.isRunning = false;
    
    // Clear health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    // Wait for processing loop to finish
    if (this.processingLoop) {
      try {
        await Promise.race([
          this.processingLoop,
          this.sleep(this.config.reliabilityLimits.gracefulShutdownTimeout)
        ]);
      } catch (error) {
        console.error(`[Worker ${this.workerId}] Error during shutdown:`, error);
      }
    }
    
    this.sendMessage({ type: 'shutdown_complete' });
    console.log(`[Worker ${this.workerId}] Shutdown complete`);
    
    // Exit process
    process.exit(0);
  }

  /**
   * Send message to main thread
   */
  private sendMessage(message: WorkerResponse): void {
    if (parentPort) {
      parentPort.postMessage(message);
    }
  }

  /**
   * Send error message to main thread
   */
  private sendError(error: string): void {
    this.sendMessage({ type: 'error', error });
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Initialize worker when script is loaded
if (require.main === module) {
  new EventProcessorWorker();
}

export { EventProcessorWorker };