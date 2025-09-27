import { Worker } from 'worker_threads';
import * as path from 'path';
import { EventEmitter } from 'events';
import { BufferedEventConfig } from '../config/buffered-event-config';
import { WorkerStatus, EventMetricsCollector } from '../metrics/event-metrics';
import { IEventHandler } from '../event.types';
import { PriorityEvent } from '../shared-buffer';

/**
 * Worker thread wrapper with communication and lifecycle management
 */
class ManagedWorker extends EventEmitter {
  public readonly id: string;
  public readonly worker: Worker;
  public status: WorkerStatus['status'] = 'idle';
  public lastActivity = Date.now();
  public eventsProcessed = 0;
  public errors = 0;
  private isShuttingDown = false;
  private healthCheckTimeout?: NodeJS.Timeout;
  private startTime = Date.now();

  constructor(
    id: string,
    workerScript: string,
    config: BufferedEventConfig,
    sharedBuffer: SharedArrayBuffer
  ) {
    super();
    this.id = id;
    
    // Create worker thread with ts-node support
    this.worker = new Worker(workerScript, {
      workerData: { workerId: id },
      execArgv: ['--require', 'ts-node/register']
    });
    
    this.setupWorkerCommunication();
    this.initializeWorker(config, sharedBuffer);
  }

  /**
   * Setup communication with worker thread
   */
  private setupWorkerCommunication(): void {
    this.worker.on('message', (message: any) => {
      this.handleWorkerMessage(message);
    });

    this.worker.on('error', (error) => {
      console.error(`[Worker ${this.id}] Error:`, error);
      this.status = 'error';
      this.errors++;
      this.emit('error', error);
    });

    this.worker.on('exit', (code) => {
      console.log(`[Worker ${this.id}] Exited with code ${code}`);
      this.status = 'idle';
      this.emit('exit', code);
    });
  }

  /**
   * Handle messages from worker thread
   */
  private handleWorkerMessage(message: any): void {
    switch (message.type) {
      case 'ready':
        this.status = 'running';
        this.emit('ready');
        break;
        
      case 'event_processed':
        this.eventsProcessed++;
        this.lastActivity = Date.now();
        this.emit('event_processed', message);
        break;
        
      case 'error':
        this.errors++;
        this.emit('worker_error', message.error, message.eventType);
        break;
        
      case 'health_status':
        this.updateStatus(message.status);
        this.emit('health_status', message.status);
        break;
        
      case 'stats':
        this.emit('stats', message.stats);
        break;
        
      case 'shutdown_complete':
        this.status = 'idle';
        this.emit('shutdown_complete');
        break;
    }
  }

  /**
   * Initialize worker with configuration
   */
  private initializeWorker(config: BufferedEventConfig, sharedBuffer: SharedArrayBuffer): void {
    this.worker.postMessage({
      type: 'init',
      config,
      sharedBuffer
    });
  }

  /**
   * Register event handler in worker
   */
  public registerHandler(eventType: string, handler: IEventHandler): void {
    // Convert handler to serializable code (simplified approach)
    const handlerCode = handler.handle.toString();
    
    this.worker.postMessage({
      type: 'register_handler',
      eventType,
      handlerCode
    });
  }

  /**
   * Update worker status
   */
  private updateStatus(status: WorkerStatus): void {
    this.status = status.status;
    this.eventsProcessed = status.eventsProcessed;
    this.lastActivity = status.lastActivity;
    this.errors = status.errors;
  }

  /**
   * Request health check from worker
   */
  public requestHealthCheck(): void {
    this.worker.postMessage({ type: 'health_check' });
  }

  /**
   * Request statistics from worker
   */
  public requestStats(): void {
    this.worker.postMessage({ type: 'get_stats' });
  }

  /**
   * Shutdown worker gracefully
   */
  public async shutdown(timeout = 5000): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }
    
    this.isShuttingDown = true;
    this.status = 'restarting';
    
    return new Promise((resolve, reject) => {
      const shutdownTimeout = setTimeout(() => {
        console.warn(`[Worker ${this.id}] Shutdown timeout, terminating forcefully`);
        this.worker.terminate();
        reject(new Error('Shutdown timeout'));
      }, timeout);
      
      this.once('shutdown_complete', () => {
        clearTimeout(shutdownTimeout);
        resolve();
      });
      
      this.once('exit', () => {
        clearTimeout(shutdownTimeout);
        resolve();
      });
      
      // Send shutdown message
      this.worker.postMessage({ type: 'shutdown' });
    });
  }

  /**
   * Terminate worker immediately
   */
  public terminate(): Promise<number> {
    this.status = 'idle';
    return this.worker.terminate();
  }

  /**
   * Get worker health status
   */
  public getHealthStatus(): WorkerStatus {
    return {
      id: this.id,
      pid: this.worker.threadId,
      status: this.status,
      eventsProcessed: this.eventsProcessed,
      lastActivity: this.lastActivity,
      memoryUsage: 0, // Will be updated by worker
      cpuUsage: 0, // Will be updated by worker
      errors: this.errors,
      uptime: Date.now() - this.startTime
    };
  }
}

/**
 * Worker pool manager for handling multiple worker threads
 */
export class WorkerManager extends EventEmitter {
  private config: BufferedEventConfig;
  private workers: Map<string, ManagedWorker> = new Map();
  private sharedBuffer: SharedArrayBuffer;
  private metricsCollector: EventMetricsCollector;
  private isShuttingDown = false;
  private healthCheckInterval?: NodeJS.Timeout;
  private workerScript: string;

  constructor(
    config: BufferedEventConfig,
    sharedBuffer: SharedArrayBuffer,
    metricsCollector: EventMetricsCollector
  ) {
    super();
    this.config = config;
    this.sharedBuffer = sharedBuffer;
    this.metricsCollector = metricsCollector;
    this.workerScript = path.join(__dirname, 'event-processor.worker.ts');
    
    this.startHealthMonitoring();
  }

  /**
   * Initialize worker pool
   */
  public async initialize(): Promise<void> {
    console.log(`Initializing worker pool with ${this.config.workerCount} workers`);
    
    const workerPromises: Promise<void>[] = [];
    
    for (let i = 0; i < this.config.workerCount; i++) {
      const workerId = `worker_${i}`;
      workerPromises.push(this.createWorker(workerId));
    }
    
    await Promise.all(workerPromises);
    console.log(`Worker pool initialized with ${this.workers.size} workers`);
  }

  /**
   * Create a new worker
   */
  private async createWorker(workerId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const worker = new ManagedWorker(
          workerId,
          this.workerScript,
          this.config,
          this.sharedBuffer
        );
        
        // Setup event handlers
        worker.once('ready', () => {
          console.log(`Worker ${workerId} is ready`);
          resolve();
        });
        
        worker.on('error', (error) => {
          console.error(`Worker ${workerId} error:`, error);
          this.handleWorkerError(workerId, error);
        });
        
        worker.on('exit', (code) => {
          console.log(`Worker ${workerId} exited with code ${code}`);
          this.handleWorkerExit(workerId, code);
        });
        
        worker.on('event_processed', (data) => {
          this.metricsCollector.recordEventProcessed(
            data.processingTime,
            0 // queue latency - would need to be calculated
          );
        });
        
        worker.on('worker_error', (error, eventType) => {
          this.metricsCollector.recordEventDropped();
        });
        
        worker.on('health_status', (status) => {
          this.metricsCollector.updateWorkerStatus(status.id, status);
        });
        
        this.workers.set(workerId, worker);
        
        // Set timeout for worker initialization
        setTimeout(() => {
          if (worker.status !== 'running') {
            reject(new Error(`Worker ${workerId} failed to initialize within timeout`));
          }
        }, 10000); // 10 second timeout
        
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Register event handler across all workers
   */
  public registerHandler(eventType: string, handler: IEventHandler): void {
    console.log(`Registering handler for event type: ${eventType}`);
    
    for (const worker of this.workers.values()) {
      if (worker.status === 'running') {
        worker.registerHandler(eventType, handler);
      }
    }
  }

  /**
   * Handle worker error
   */
  private async handleWorkerError(workerId: string, error: Error): Promise<void> {
    console.error(`Handling error for worker ${workerId}:`, error);
    
    const worker = this.workers.get(workerId);
    if (!worker) return;
    
    // If worker has too many errors, restart it
    if (worker.errors > this.config.reliabilityLimits.maxRetryAttempts) {
      console.log(`Worker ${workerId} has too many errors, restarting`);
      await this.restartWorker(workerId);
    }
  }

  /**
   * Handle worker exit
   */
  private async handleWorkerExit(workerId: string, code: number): Promise<void> {
    console.log(`Worker ${workerId} exited with code ${code}`);
    
    if (!this.isShuttingDown && code !== 0) {
      console.log(`Restarting worker ${workerId} due to unexpected exit`);
      await this.restartWorker(workerId);
    }
  }

  /**
   * Restart a worker
   */
  private async restartWorker(workerId: string): Promise<void> {
    const oldWorker = this.workers.get(workerId);
    if (oldWorker) {
      try {
        await oldWorker.shutdown(3000);
      } catch (error) {
        console.warn(`Failed to shutdown worker ${workerId} gracefully:`, error);
        await oldWorker.terminate();
      }
      this.workers.delete(workerId);
    }
    
    // Create new worker
    try {
      await this.createWorker(workerId);
      console.log(`Worker ${workerId} restarted successfully`);
    } catch (error) {
      console.error(`Failed to restart worker ${workerId}:`, error);
      this.emit('worker_restart_failed', workerId, error);
    }
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.config.monitoring.healthCheckInterval);
  }

  /**
   * Perform health checks on all workers
   */
  private performHealthChecks(): void {
    for (const worker of this.workers.values()) {
      if (worker.status === 'running') {
        worker.requestHealthCheck();
      }
    }
  }

  /**
   * Get all worker statuses
   */
  public getWorkerStatuses(): WorkerStatus[] {
    return Array.from(this.workers.values()).map(worker => worker.getHealthStatus());
  }

  /**
   * Get healthy worker count
   */
  public getHealthyWorkerCount(): number {
    return Array.from(this.workers.values())
      .filter(worker => worker.status === 'running').length;
  }

  /**
   * Scale worker pool
   */
  public async scaleWorkers(targetCount: number): Promise<void> {
    const currentCount = this.workers.size;
    
    if (targetCount > currentCount) {
      // Scale up
      const workersToAdd = targetCount - currentCount;
      const promises: Promise<void>[] = [];
      
      for (let i = 0; i < workersToAdd; i++) {
        const workerId = `worker_${currentCount + i}`;
        promises.push(this.createWorker(workerId));
      }
      
      await Promise.all(promises);
      console.log(`Scaled up to ${this.workers.size} workers`);
      
    } else if (targetCount < currentCount) {
      // Scale down
      const workersToRemove = currentCount - targetCount;
      const workerIds = Array.from(this.workers.keys()).slice(-workersToRemove);
      
      const promises = workerIds.map(async (workerId) => {
        const worker = this.workers.get(workerId);
        if (worker) {
          await worker.shutdown();
          this.workers.delete(workerId);
        }
      });
      
      await Promise.all(promises);
      console.log(`Scaled down to ${this.workers.size} workers`);
    }
  }

  /**
   * Shutdown all workers
   */
  public async shutdown(): Promise<void> {
    console.log('Shutting down worker manager');
    this.isShuttingDown = true;
    
    // Clear health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    // Shutdown all workers
    const shutdownPromises = Array.from(this.workers.values()).map(async (worker) => {
      try {
        await worker.shutdown(this.config.reliabilityLimits.gracefulShutdownTimeout);
      } catch (error) {
        console.warn(`Failed to shutdown worker ${worker.id} gracefully:`, error);
        await worker.terminate();
      }
    });
    
    await Promise.all(shutdownPromises);
    this.workers.clear();
    
    console.log('Worker manager shutdown complete');
  }

  /**
   * Get worker manager statistics
   */
  public getStatistics(): {
    totalWorkers: number;
    healthyWorkers: number;
    totalEventsProcessed: number;
    totalErrors: number;
  } {
    const workers = Array.from(this.workers.values());
    
    return {
      totalWorkers: workers.length,
      healthyWorkers: workers.filter(w => w.status === 'running').length,
      totalEventsProcessed: workers.reduce((sum, w) => sum + w.eventsProcessed, 0),
      totalErrors: workers.reduce((sum, w) => sum + w.errors, 0)
    };
  }
}

export { ManagedWorker };