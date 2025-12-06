"use strict";

const build = require("pino-abstract-transport");

module.exports = async function postHogTransport(options) {
  const {
    apiKey,
    host,
    serviceName = "unknown-service",
    instanceId = process.env.INSTANCE_ID || "default",
    config = {},
  } = options;

  if (!apiKey || !host) {
    console.error(
      "[PostHogTransport] `apiKey` and `host` are required. Transport disabled."
    );
    return build(async function (source) {
      for await (const obj of source) {
        // Pass through without processing
      }
    });
  }

  // Configuration with defaults
  const {
    BATCH_SIZE = 50,
    FLUSH_INTERVAL = 2000,
    MAX_RETRIES = 3,
    RETRY_DELAY = 1000,
    RETRY_BACKOFF = 2,
    MAX_BATCH_SIZE_MB = 18, // 18MB safety margin (PostHog limit is 20MB)
  } = config;

  const batchEndpoint = `${host}/batch/`;

  // Metrics tracking
  const metrics = {
    logsReceived: 0,
    logEventsSent: 0,
    apiRequestEventsSent: 0,
    logsDropped: 0,
    batchesSent: 0,
    parseErrors: 0,
    sendErrors: 0,
    retryAttempts: 0,
    totalBatchSizeBytes: 0,
  };

  // Buffer for batching events
  const eventBuffer = [];
  let flushTimer = null;
  let isFlushing = false;

  // Helper function to determine log type
  function determineLogType(log) {
    if (log.logType) return log.logType;
    if (log.component === "HTTP" || log.method) return "http";
    if (log.action) return "audit";
    if (log.eventName) return "event";
    return "application";
  }

  // Helper to extract error details
  function extractErrorDetails(log) {
    const errorObj = log.err || log.error;
    if (!errorObj || typeof errorObj !== "object") return null;

    return {
      message: errorObj.message || "",
      stack: errorObj.stack || "",
      code: errorObj.code || "",
      type: errorObj.type || errorObj.name || "Error",
    };
  }

  // Determine if we should create a log event
  function shouldCreateLogEvent(log) {
    // Don't create log event for access logs
    if (log.logType === "access") {
      return false;
    }
    return true;
  }

  // Determine if we should create an api_request event
  function shouldCreateApiRequestEvent(log) {
    // Only create api_request for access logs
    if (log.logType === "access") {
      return true;
    }

    // Legacy support: also check for HTTP component with method and status
    if (log.component === "HTTP" && log.method && log.statusCode) {
      return true;
    }

    return false;
  }

  // Estimate batch size in bytes
  function estimateBatchSize(events) {
    const batchRequest = {
      api_key: apiKey,
      batch: events,
    };
    const json = JSON.stringify(batchRequest);
    return Buffer.byteLength(json, "utf8");
  }

  // Split events into batches that fit within size limit
  function splitIntoBatches(events, maxSizeBytes) {
    const batches = [];
    let currentBatch = [];
    let currentSize = 0;

    // Rough estimate of base request size
    const baseSize = Buffer.byteLength(
      JSON.stringify({ api_key: apiKey, batch: [] }),
      "utf8"
    );

    for (const event of events) {
      const eventSize = Buffer.byteLength(JSON.stringify(event), "utf8");

      // Check if adding this event would exceed the limit
      if (
        currentSize + eventSize + baseSize > maxSizeBytes &&
        currentBatch.length > 0
      ) {
        // Start new batch
        batches.push(currentBatch);
        currentBatch = [event];
        currentSize = eventSize;
      } else {
        currentBatch.push(event);
        currentSize += eventSize;
      }
    }

    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  // Create individual log event (PostHog batch format)
  function createLogEvent(log) {
    const logType = determineLogType(log);
    const timestamp = log.timestamp || log.time || new Date().toISOString();
    const errorDetails = extractErrorDetails(log);

    return {
      event: "log",
      distinct_id: log.userId || log.username || "system",
      timestamp,
      properties: {
        // Core log properties
        level: log.level || "info",
        message: log.msg || log.message || "",
        log_type: logType,

        // Service context
        service: serviceName,
        instance_id: instanceId,
        environment: process.env.NODE_ENV || "development",

        // Request context
        request_id: log.requestId,
        trace_id: log.traceId,
        span_id: log.spanId,

        // User context
        user_id: log.userId,
        username: log.username,

        // Component/module info
        component: log.component,
        service_name: log.serviceName || serviceName,

        // Additional context
        context: log.context || log.additionalContext || {},

        // Error details (if present)
        ...(errorDetails && {
          error_message: errorDetails.message,
          error_stack: errorDetails.stack,
          error_code: errorDetails.code,
          error_type: errorDetails.type,
          has_error: true,
        }),

        // Audit log specific
        ...(log.action && {
          audit_action: log.action,
          audit_resource: log.resource,
          audit_resource_id: log.resourceId,
        }),

        // Performance metrics
        ...(log.duration && { duration_ms: log.duration }),

        // Timestamp
        timestamp,
      },
    };
  }

  // Create API metrics event (for HTTP access logs)
  function createApiMetricsEvent(log) {
    const timestamp = log.timestamp || log.time || new Date().toISOString();
    const endpoint = `${log.method} ${log.url || log.path}`;
    const isError = log.statusCode >= 400;

    return {
      event: "api_request",
      distinct_id: log.userId || log.username || "anonymous",
      timestamp,
      properties: {
        // Request details
        method: log.method,
        url: log.url || log.path,
        endpoint,
        status_code: log.statusCode,
        response_time_ms: log.responseTime || log.duration,

        // Classification
        is_error: isError,
        is_client_error: log.statusCode >= 400 && log.statusCode < 500,
        is_server_error: log.statusCode >= 500,
        is_success: log.statusCode >= 200 && log.statusCode < 300,

        // Service context
        service: serviceName,
        instance_id: instanceId,
        environment: process.env.NODE_ENV || "development",

        // Request context
        request_id: log.requestId,
        trace_id: log.traceId,

        // Client info
        ip: log.ip,
        user_agent: log.userAgent,

        // User context
        user_id: log.userId,
        username: log.username,

        // Timestamp
        timestamp,
      },
    };
  }

  // Send batch to PostHog using batch API
  async function sendBatchToPostHog(events, retryCount = 0) {
    const batchRequest = {
      api_key: apiKey,
      batch: events,
    };

    try {
      const response = await fetch(batchEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batchRequest),
      });

      if (!response.ok) {
        throw new Error(
          `PostHog batch API error: ${response.status} ${response.statusText}`
        );
      }

      // Success
      const batchSize = estimateBatchSize(events);
      metrics.batchesSent++;
      metrics.totalBatchSizeBytes += batchSize;

      // Count event types
      events.forEach((event) => {
        if (event.event === "log") {
          metrics.logEventsSent++;
        } else if (event.event === "api_request") {
          metrics.apiRequestEventsSent++;
        }
      });

      console.log(
        `[PostHogTransport] Sent batch of ${events.length} events (${(
          batchSize / 1024
        ).toFixed(2)}KB)`
      );
    } catch (error) {
      metrics.sendErrors++;

      if (retryCount < MAX_RETRIES) {
        // Exponential backoff
        const delay = RETRY_DELAY * Math.pow(RETRY_BACKOFF, retryCount);

        console.warn(
          `[PostHogTransport] Batch send failed, retrying in ${delay}ms (attempt ${
            retryCount + 1
          }/${MAX_RETRIES})`,
          error.message
        );

        await new Promise((resolve) => setTimeout(resolve, delay));

        metrics.retryAttempts++;
        return sendBatchToPostHog(events, retryCount + 1);
      } else {
        // Max retries exceeded
        metrics.logsDropped += events.length;
        console.error(
          `[PostHogTransport] Max retries exceeded. Dropping ${events.length} events.`,
          error.message
        );
        throw error;
      }
    }
  }

  // Flush buffered events to PostHog
  async function flushEvents() {
    if (isFlushing || eventBuffer.length === 0) return;

    isFlushing = true;

    try {
      // Extract events from buffer (up to BATCH_SIZE)
      const eventsToSend = eventBuffer.splice(0, BATCH_SIZE);

      if (eventsToSend.length === 0) {
        return;
      }

      // Check if batch size exceeds limit
      const estimatedSize = estimateBatchSize(eventsToSend);
      const maxSizeBytes = MAX_BATCH_SIZE_MB * 1024 * 1024;

      if (estimatedSize > maxSizeBytes) {
        // Split into smaller batches
        console.warn(
          `[PostHogTransport] Batch size (${(
            estimatedSize /
            1024 /
            1024
          ).toFixed(2)}MB) exceeds limit. Splitting...`
        );

        const batches = splitIntoBatches(eventsToSend, maxSizeBytes);

        console.log(
          `[PostHogTransport] Split into ${batches.length} smaller batches`
        );

        // Send each batch
        for (const batch of batches) {
          await sendBatchToPostHog(batch);
        }
      } else {
        // Send as single batch
        await sendBatchToPostHog(eventsToSend);
      }
    } catch (error) {
      console.error("[PostHogTransport] Flush error:", error.message);
    } finally {
      isFlushing = false;
    }
  }

  // Flush all remaining events (for shutdown)
  async function flushAllEvents() {
    console.info(
      `[PostHogTransport] Flushing ${eventBuffer.length} remaining events...`
    );

    while (eventBuffer.length > 0) {
      await flushEvents();
    }
  }

  // Start periodic flushing
  flushTimer = setInterval(flushEvents, FLUSH_INTERVAL);

  console.info(
    `[PostHogTransport] Initialized for ${serviceName} (instance: ${instanceId})`
  );
  console.info(
    `[PostHogTransport] Using batch API (${BATCH_SIZE} events per batch, ${FLUSH_INTERVAL}ms interval)`
  );
  console.info(
    `[PostHogTransport] Access logs (logType='access_log') will create api_request events only`
  );

  return build(
    async function (source) {
      for await (const obj of source) {
        try {
          metrics.logsReceived++;

          // Determine which events to create based on log type
          const createLogEvent_flag = shouldCreateLogEvent(obj);
          const createApiRequestEvent_flag = shouldCreateApiRequestEvent(obj);

          // Create api_request event if needed (for access logs)
          if (createApiRequestEvent_flag) {
            const apiEvent = createApiMetricsEvent(obj);
            eventBuffer.push(apiEvent);
          }

          // Create log event if needed (for non-access logs)
          if (createLogEvent_flag) {
            const logEvent = createLogEvent(obj);
            eventBuffer.push(logEvent);
          }

          // Flush if buffer is full
          if (eventBuffer.length >= BATCH_SIZE) {
            await flushEvents();
          }
        } catch (err) {
          metrics.parseErrors++;
          console.error(
            "[PostHogTransport] Log parse/processing error:",
            err.message
          );
        }
      }
    },
    {
      async close() {
        if (flushTimer) clearInterval(flushTimer);

        console.info(
          "[PostHogTransport] Finalizing stream, flushing remaining events..."
        );
        console.info("[PostHogTransport] Final metrics:", metrics);

        await flushAllEvents();

        console.info("[PostHogTransport] Stream ended, all events flushed.");
      },
    }
  );
};
