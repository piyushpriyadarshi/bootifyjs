export interface LogContext {
  requestId: string;
  userId?: string;
  username?: string;
  traceId?: string;
  spanId?: string;
  correlationId?: string;
  sessionId?: string;
  userAgent?: string;
  ip?: string;
  method?: string;
  url?: string;
  startTime?: number;
  additionalContext?: Record<string, any>;
}

export interface LogPayload {
  message: string;
  [key: string]: any;
}

export interface AuditLogPayload {
  action: string;
  resource: string;
  resourceId?: string;
  resources?: string[];
  details?: any;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  metadata?: Record<string, any>;
  username?: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
  timestamp?: string;
}

export interface EventLogPayload {
  eventName: string;
  eventType: 'business' | 'system' | 'security' | 'performance' | string;
  status: 'success' | 'failure' | 'pending' | 'cancelled';
  duration?: number;
  metadata?: Record<string, any>;
  username?: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
  timestamp?: string;
}

export interface PerformanceLogPayload {
  operation: string;
  duration: number;
  memoryUsage?: NodeJS.MemoryUsage;
  metadata?: Record<string, any>;
}

export interface StartupLogPayload {
  component: string;
  phase: 'starting' | 'completed' | 'failed';
  duration?: number;
  details?: Record<string, any>;
}

export interface LoggingConfig {
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  serviceName: string;
  serviceVersion: string;
  environment: string;
  logHeaders: boolean;
  logStackTrace: boolean;
  enableStartupLogs: boolean;
  enableComponentLogs: boolean;
  enablePerformanceLogs: boolean;
  transports?: any[];
  rotation?: {
    enabled: boolean;
    maxFiles: number;
    maxSize: string;
    datePattern: string;
  };
  correlation?: {
    enabled: boolean;
    headerName: string;
  };
  performance?: {
    enabled: boolean;
    slowThreshold: number;
  };
  clickhouse?: {
    enabled: boolean;
    url: string;
    username?: string;
    password?: string;
    database?: string;
    application?: string;
  };
}

export interface RequestLoggingOptions {
  logBody?: boolean;
  logHeaders?: boolean;
  logQuery?: boolean;
  skipPaths?: string[];
  slowThreshold?: number;
  logLatency?: boolean;
}

export interface ClickHouseTransportOptions {
  url: string;
  username?: string;
  password?: string;
  database?: string;
  application?: string;
  maxBatchSize?: number;
  flushInterval?: number;
  retryDelay?: number;
  maxRetries?: number;
}

export interface LoggingMetrics {
  httpRequests: {
    total: number;
    byStatusCode: Record<number, number>;
    byMethod: Record<string, number>;
    byPath: Record<string, number>;
    latency: {
      min: number;
      max: number;
      avg: number;
    };
  };
  events: {
    total: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
  };
  audits: {
    total: number;
    byAction: Record<string, number>;
    byResource: Record<string, number>;
  };
}