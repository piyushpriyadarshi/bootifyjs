import { PriorityEvent } from '../shared-buffer';
import { IEventHandler } from '../event.types';
import { BufferedEventConfig } from '../config/buffered-event-config';

/**
 * Retry attempt information
 */
export interface RetryAttempt {
  attempt: number;
  timestamp: number;
  error: Error;
  nextRetryAt?: number;
}

/**
 * Event with retry metadata
 */
export interface RetryableEvent extends PriorityEvent {
  retryCount: number;
  retryAttempts: RetryAttempt[];
  maxRetries: number;
  lastError?: Error;
}

/**
 * Dead letter queue entry
 */
export interface DeadLetterEntry {
  event: RetryableEvent;
  finalError: Error;
  timestamp: number;
  totalAttempts: number;
}

/**
 * Retry statistics
 */
export interface RetryStats {
  totalRetries: number;
  successfulRetries: number;
  failedRetries: number;
  deadLetterCount: number;
  averageRetryDelay: number;
}

/**
 * Handles retry logic with exponential backoff for failed events
 */
export class RetryHandler {
  private config: BufferedEventConfig;
  private deadLetterQueue: DeadLetterEntry[] = [];
  private retryStats: RetryStats = {
    totalRetries: 0,
    successfulRetries: 0,
    failedRetries: 0,
    deadLetterCount: 0,
    averageRetryDelay: 0
  };

  constructor(config: BufferedEventConfig) {
    this.config = config;
  }

  /**
   * Handle event with retry logic
   * @param event Event to process
   * @param handler Event handler function
   * @returns Promise that resolves when event is processed or moved to DLQ
   */
  async handleWithRetry(event: PriorityEvent, handler: IEventHandler): Promise<void> {
    const retryableEvent = this.createRetryableEvent(event);
    
    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      try {
        // Update retry count
        retryableEvent.retryCount = attempt;
        
        // Execute handler
        await handler.handle(retryableEvent);
        
        // Success - update stats and return
        if (attempt > 0) {
          this.retryStats.successfulRetries++;
        }
        return;
        
      } catch (error) {
        const retryAttempt: RetryAttempt = {
          attempt,
          timestamp: Date.now(),
          error: error as Error
        };
        
        retryableEvent.retryAttempts.push(retryAttempt);
        retryableEvent.lastError = error as Error;
        this.retryStats.totalRetries++;
        
        // Check if we should retry
        if (attempt < this.config.retryAttempts) {
          const delay = this.calculateRetryDelay(attempt);
          retryAttempt.nextRetryAt = Date.now() + delay;
          
          console.warn(
            `Event ${retryableEvent.type} failed (attempt ${attempt + 1}/${this.config.retryAttempts + 1}). ` +
            `Retrying in ${delay}ms. Error:`, error
          );
          
          await this.delay(delay);
        } else {
          // Max retries exceeded - move to dead letter queue
          this.moveToDeadLetterQueue(retryableEvent, error as Error);
          this.retryStats.failedRetries++;
          
          console.error(
            `Event ${retryableEvent.type} failed after ${this.config.retryAttempts + 1} attempts. ` +
            `Moved to dead letter queue. Final error:`, error
          );
          
          throw new Error(`Event processing failed after ${this.config.retryAttempts + 1} attempts`);
        }
      }
    }
  }

  /**
   * Calculate retry delay using exponential backoff with jitter
   * @param attempt Current attempt number (0-based)
   * @returns Delay in milliseconds
   */
  private calculateRetryDelay(attempt: number): number {
    // Use configured delays if available
    if (attempt < this.config.retryDelays.length) {
      const baseDelay = this.config.retryDelays[attempt];
      // Add jitter (±25% of base delay)
      const jitter = baseDelay * 0.25 * (Math.random() - 0.5);
      return Math.max(100, baseDelay + jitter); // Minimum 100ms
    }
    
    // Fallback to exponential backoff
    const baseDelay = 1000; // 1 second
    const exponentialDelay = baseDelay * Math.pow(2, attempt);
    const maxDelay = 30000; // 30 seconds max
    
    // Add jitter
    const jitter = exponentialDelay * 0.25 * (Math.random() - 0.5);
    
    return Math.min(maxDelay, Math.max(100, exponentialDelay + jitter));
  }

  /**
   * Create retryable event from regular event
   */
  private createRetryableEvent(event: PriorityEvent): RetryableEvent {
    return {
      ...event,
      retryCount: event.retryCount || 0,
      retryAttempts: [],
      maxRetries: this.config.retryAttempts
    };
  }

  /**
   * Move event to dead letter queue
   */
  private moveToDeadLetterQueue(event: RetryableEvent, finalError: Error): void {
    const deadLetterEntry: DeadLetterEntry = {
      event,
      finalError,
      timestamp: Date.now(),
      totalAttempts: event.retryAttempts.length
    };
    
    this.deadLetterQueue.push(deadLetterEntry);
    this.retryStats.deadLetterCount++;
    
    // Limit DLQ size to prevent memory issues
    const maxDLQSize = 1000;
    if (this.deadLetterQueue.length > maxDLQSize) {
      this.deadLetterQueue.shift(); // Remove oldest entry
    }
  }

  /**
   * Get dead letter queue entries
   */
  getDeadLetterQueue(): DeadLetterEntry[] {
    return [...this.deadLetterQueue];
  }

  /**
   * Get retry statistics
   */
  getRetryStats(): RetryStats {
    // Calculate average retry delay
    if (this.retryStats.totalRetries > 0) {
      const totalDelay = this.config.retryDelays.reduce((sum, delay) => sum + delay, 0);
      this.retryStats.averageRetryDelay = totalDelay / this.config.retryDelays.length;
    }
    
    return { ...this.retryStats };
  }

  /**
   * Clear dead letter queue
   */
  clearDeadLetterQueue(): void {
    this.deadLetterQueue.length = 0;
    this.retryStats.deadLetterCount = 0;
  }

  /**
   * Reprocess events from dead letter queue
   * @param handler Event handler to use for reprocessing
   * @param maxEvents Maximum number of events to reprocess
   */
  async reprocessDeadLetterQueue(
    handler: IEventHandler, 
    maxEvents: number = 10
  ): Promise<{ processed: number; failed: number }> {
    const eventsToProcess = this.deadLetterQueue.splice(0, maxEvents);
    let processed = 0;
    let failed = 0;
    
    for (const entry of eventsToProcess) {
      try {
        // Reset retry count for reprocessing
        const event = {
          ...entry.event,
          retryCount: 0,
          retryAttempts: [],
          lastError: undefined
        };
        
        await this.handleWithRetry(event, handler);
        processed++;
        this.retryStats.deadLetterCount--;
      } catch (error) {
        // Put back in DLQ if still failing
        this.deadLetterQueue.push(entry);
        failed++;
        console.error('Failed to reprocess dead letter event:', error);
      }
    }
    
    return { processed, failed };
  }

  /**
   * Check if event should be retried based on error type
   */
  private shouldRetry(error: Error): boolean {
    // Don't retry certain types of errors
    const nonRetryableErrors = [
      'ValidationError',
      'AuthenticationError',
      'AuthorizationError',
      'SyntaxError',
      'TypeError'
    ];
    
    return !nonRetryableErrors.includes(error.constructor.name);
  }

  /**
   * Delay execution for specified milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Reset retry statistics
   */
  resetStats(): void {
    this.retryStats = {
      totalRetries: 0,
      successfulRetries: 0,
      failedRetries: 0,
      deadLetterCount: this.deadLetterQueue.length,
      averageRetryDelay: 0
    };
  }

  /**
   * Get configuration
   */
  getConfig(): BufferedEventConfig {
    return this.config;
  }

  /**
   * Update configuration
   */
  updateConfig(config: BufferedEventConfig): void {
    this.config = config;
  }
}