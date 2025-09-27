import { IEvent } from './event.types';

/**
 * Priority levels for events
 */
export type EventPriority = 'critical' | 'normal' | 'low';

/**
 * Extended event interface with priority and metadata
 */
export interface PriorityEvent extends IEvent {
  priority?: EventPriority;
  timestamp?: number;
  retryCount?: number;
}

/**
 * Configuration for shared buffer
 */
export interface SharedBufferConfig {
  maxEvents: number;
  maxEventSize: number;
  totalMemoryMB: number;
}

/**
 * Thread-safe circular buffer for event processing
 * Uses SharedArrayBuffer for zero-copy inter-thread communication
 */
export class SharedEventBuffer {
  private buffer: SharedArrayBuffer;
  private writeIndex: Int32Array;
  private readIndex: Int32Array;
  private eventCount: Int32Array;
  private eventData: Uint8Array;
  private maxEvents: number;
  private maxEventSize: number;
  private eventSlotSize: number;

  constructor(config: SharedBufferConfig = {
    maxEvents: 10000,
    maxEventSize: 5120, // 5KB
    totalMemoryMB: 50
  }) {
    this.maxEvents = config.maxEvents;
    this.maxEventSize = config.maxEventSize;
    
    // Calculate slot size (event size + metadata)
    this.eventSlotSize = this.maxEventSize + 64; // Extra space for metadata
    
    // Calculate total buffer size
    const metadataSize = 12; // 3 Int32 values (writeIndex, readIndex, eventCount)
    const dataSize = this.maxEvents * this.eventSlotSize;
    const totalSize = metadataSize + dataSize;
    
    // Create shared buffer
    this.buffer = new SharedArrayBuffer(totalSize);
    
    // Initialize metadata arrays
    this.writeIndex = new Int32Array(this.buffer, 0, 1);
    this.readIndex = new Int32Array(this.buffer, 4, 1);
    this.eventCount = new Int32Array(this.buffer, 8, 1);
    
    // Initialize event data array
    this.eventData = new Uint8Array(this.buffer, metadataSize);
    
    // Initialize indices
    Atomics.store(this.writeIndex, 0, 0);
    Atomics.store(this.readIndex, 0, 0);
    Atomics.store(this.eventCount, 0, 0);
  }

  /**
   * Enqueue an event to the buffer (thread-safe)
   * @param event Event to enqueue
   * @returns true if successful, false if buffer is full
   */
  enqueue(event: PriorityEvent): boolean {
    // Check if buffer is full
    const currentCount = Atomics.load(this.eventCount, 0);
    if (currentCount >= this.maxEvents) {
      return false; // Buffer full
    }

    // Serialize event
    const serializedEvent = this.serializeEvent(event);
    if (serializedEvent.length > this.maxEventSize) {
      throw new Error(`Event size ${serializedEvent.length} exceeds maximum ${this.maxEventSize}`);
    }

    // Get current write position
    const writePos = Atomics.load(this.writeIndex, 0);
    const slotOffset = writePos * this.eventSlotSize;

    // Write event size first (4 bytes)
    const sizeView = new Int32Array(this.buffer, 12 + slotOffset, 1);
    Atomics.store(sizeView, 0, serializedEvent.length);

    // Write event data
    const eventView = new Uint8Array(this.buffer, 12 + slotOffset + 4, serializedEvent.length);
    eventView.set(serializedEvent);

    // Update write index atomically
    const nextWritePos = (writePos + 1) % this.maxEvents;
    Atomics.store(this.writeIndex, 0, nextWritePos);
    
    // Increment event count
    Atomics.add(this.eventCount, 0, 1);

    return true;
  }

  /**
   * Dequeue an event from the buffer (thread-safe)
   * @returns Event or null if buffer is empty
   */
  dequeue(): PriorityEvent | null {
    // Check if buffer is empty
    const currentCount = Atomics.load(this.eventCount, 0);
    if (currentCount === 0) {
      return null;
    }

    // Get current read position
    const readPos = Atomics.load(this.readIndex, 0);
    const slotOffset = readPos * this.eventSlotSize;

    // Read event size
    const sizeView = new Int32Array(this.buffer, 12 + slotOffset, 1);
    const eventSize = Atomics.load(sizeView, 0);

    if (eventSize === 0 || eventSize > this.maxEventSize) {
      // Invalid event size, skip this slot
      const nextReadPos = (readPos + 1) % this.maxEvents;
      Atomics.store(this.readIndex, 0, nextReadPos);
      Atomics.sub(this.eventCount, 0, 1);
      return null;
    }

    // Read event data
    const eventView = new Uint8Array(this.buffer, 12 + slotOffset + 4, eventSize);
    const eventData = new Uint8Array(eventSize);
    eventData.set(eventView);

    // Update read index atomically
    const nextReadPos = (readPos + 1) % this.maxEvents;
    Atomics.store(this.readIndex, 0, nextReadPos);
    
    // Decrement event count
    Atomics.sub(this.eventCount, 0, 1);

    // Clear the slot
    Atomics.store(sizeView, 0, 0);

    // Deserialize and return event
    return this.deserializeEvent(eventData);
  }

  /**
   * Get current queue size
   */
  size(): number {
    return Atomics.load(this.eventCount, 0);
  }

  /**
   * Check if buffer is full
   */
  isFull(): boolean {
    return this.size() >= this.maxEvents;
  }

  /**
   * Check if buffer is empty
   */
  isEmpty(): boolean {
    return this.size() === 0;
  }

  /**
   * Get buffer utilization percentage
   */
  getUtilization(): number {
    return (this.size() / this.maxEvents) * 100;
  }

  /**
   * Get buffer statistics
   */
  getStats() {
    return {
      size: this.size(),
      maxEvents: this.maxEvents,
      utilization: this.getUtilization(),
      isFull: this.isFull(),
      isEmpty: this.isEmpty(),
      writeIndex: Atomics.load(this.writeIndex, 0),
      readIndex: Atomics.load(this.readIndex, 0)
    };
  }

  /**
   * Serialize event to Uint8Array
   */
  private serializeEvent(event: PriorityEvent): Uint8Array {
    // Add timestamp and priority if not present
    const enrichedEvent = {
      ...event,
      timestamp: event.timestamp || Date.now(),
      priority: event.priority || 'normal',
      retryCount: event.retryCount || 0
    };

    const jsonString = JSON.stringify(enrichedEvent);
    return new TextEncoder().encode(jsonString);
  }

  /**
   * Deserialize event from Uint8Array
   */
  private deserializeEvent(data: Uint8Array): PriorityEvent {
    const jsonString = new TextDecoder().decode(data);
    return JSON.parse(jsonString) as PriorityEvent;
  }

  /**
   * Clear all events from buffer (for testing/debugging)
   */
  clear(): void {
    Atomics.store(this.writeIndex, 0, 0);
    Atomics.store(this.readIndex, 0, 0);
    Atomics.store(this.eventCount, 0, 0);
  }

  /**
   * Get the underlying SharedArrayBuffer (for worker initialization)
   */
  getSharedBuffer(): SharedArrayBuffer {
    return this.buffer;
  }
}