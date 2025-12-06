"use strict";

const build = require("pino-abstract-transport");
const { PostHog } = require("posthog-node");

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
  const posthog = new PostHog(apiKey, { host });

  // Configuration with defaults
  const {
    MAX_BATCH_SIZE = 100,
    FLUSH_INTERVAL = 5000,
    REQUEST_TIMEOUT = 30000,
    MAX_LOGS_PER_REQUEST = 50,
    RETRY_DELAY = 1000,
    MAX_RETRIES = 3,
    CLEANUP_INTERVAL = 60000,
    STALE_TRACE_TIMEOUT = 300000,
  } = config;

  // Metrics tracking
  const metrics = {
    logsReceived: 0,
    logsDropped: 0,
    tracesCreated: 0,
    tracesFlushed: 0,
    tracesDropped: 0,
    retryAttempts: 0,
    parseErrors: 0,
    flushErrors: 0,
  };

  const requestTraces = new Map();
  let isFlushing = false;
  let flushTimer = null;
  let cleanupTimer = null;

  // Helper function to determine log type
  function determineLogType(log) {
    if (log.logType) return log.logType;
    if (log.component === "HTTP" || log.method) return "http";
    if (log.action) return "audit";
    if (log.eventName) return "event";
    return "application";
  }

  // Flush a specific request trace
  async function flushRequestTrace(requestId, trace) {
    if (!trace || trace.logs.length === 0) return;

    try {
      const event = {
        event: "request_trace",
        distinctId: trace.userId || "system",
        uuid: requestId,
        properties: {
          // Request metadata
          request_id: requestId,
          url: trace.url,
          ip: trace.ip,
          method: trace.method,
          status_code: trace.statusCode,
          response_time: trace.responseTime,
          user_agent: trace.userAgent,
          timestamp: trace.timestamp || new Date().toISOString(),

          // Service information
          service: serviceName,
          instance_id: instanceId,
          environment: process.env.NODE_ENV || "development",

          // All logs that occurred during this request
          logs: trace.logs.map((log) => ({
            level: log.level,
            type: log.type || "application",
            service_name: log.serviceName || serviceName,
            message: log.message,
            timestamp: log.timestamp,
            context: log.context || {},
            component: log.component,
            duration: log.duration,
            ...(log.error && { error: log.error }),
          })),

          // Additional metadata
          log_count: trace.logs.length,
          error_count: trace.logs.filter((log) => log.level === "error").length,
          warning_count: trace.logs.filter((log) => log.level === "warn")
            .length,
          has_errors: trace.logs.some((log) => log.level === "error"),
          user_id: trace.userId,
          username: trace.username,
          trace_id: trace.traceId,
          span_id: trace.spanId,
        },
      };

      await posthog.capture(event);
      metrics.tracesFlushed++;
      console.log(
        `[PostHogTransport] Sent trace for request ${requestId} with ${trace.logs.length} logs`
      );
    } catch (err) {
      metrics.flushErrors++;
      console.error(
        `[PostHogTransport] Failed to send trace for request ${requestId}:`,
        err.message
      );

      // Re-add to map for retry (with limits)
      if (trace.retryCount < MAX_RETRIES) {
        trace.retryCount = (trace.retryCount || 0) + 1;
        metrics.retryAttempts++;
        requestTraces.set(requestId, trace);
        setTimeout(() => {
          const retryTrace = requestTraces.get(requestId);
          if (retryTrace) {
            requestTraces.delete(requestId);
            flushRequestTrace(requestId, retryTrace);
          }
        }, RETRY_DELAY * trace.retryCount);
      } else {
        metrics.tracesDropped++;
        console.error(
          `[PostHogTransport] Max retries reached for request ${requestId}. Dropping ${trace.logs.length} logs.`
        );
      }
    }
  }

  // Flush all completed requests
  async function flushCompletedRequests() {
    if (isFlushing) return;
    isFlushing = true;

    try {
      const tracesToFlush = [];
      const now = Date.now();

      // Find completed requests (older than REQUEST_TIMEOUT or marked complete)
      for (const [requestId, trace] of requestTraces.entries()) {
        const isOld = now - trace.lastUpdated > REQUEST_TIMEOUT;
        if (trace.completed || isOld) {
          tracesToFlush.push({ requestId, trace });
          requestTraces.delete(requestId);
        }
      }

      // Process in batches to avoid overwhelming PostHog
      for (let i = 0; i < tracesToFlush.length; i += MAX_BATCH_SIZE) {
        const batch = tracesToFlush.slice(i, i + MAX_BATCH_SIZE);
        await Promise.all(
          batch.map(({ requestId, trace }) =>
            flushRequestTrace(requestId, trace)
          )
        );
      }
    } catch (err) {
      console.error(
        "[PostHogTransport] Error flushing completed requests:",
        err.message
      );
    } finally {
      isFlushing = false;
    }
  }

  // Flush all requests (forceful, for shutdown)
  async function flushAllRequests() {
    const traces = Array.from(requestTraces.entries());
    requestTraces.clear();

    for (const [requestId, trace] of traces) {
      await flushRequestTrace(requestId, trace);
    }
  }

  // Cleanup stale traces
  function cleanupStaleTraces() {
    const now = Date.now();
    for (const [requestId, trace] of requestTraces.entries()) {
      if (now - trace.lastUpdated > STALE_TRACE_TIMEOUT) {
        console.warn(
          `[PostHogTransport] Removing stale trace for request ${requestId}`
        );
        requestTraces.delete(requestId);
        metrics.tracesDropped++;
      }
    }
  }

  // Start periodic flushing and cleanup
  flushTimer = setInterval(flushCompletedRequests, FLUSH_INTERVAL);
  cleanupTimer = setInterval(cleanupStaleTraces, CLEANUP_INTERVAL);

  console.info(
    `[PostHogTransport] Initialized for ${serviceName} (instance: ${instanceId})`
  );

  return build(
    async function (source) {
      for await (const obj of source) {
        try {
          metrics.logsReceived++;

          const requestId = obj.requestId;

          // DROP logs without requestId
          if (!requestId) {
            metrics.logsDropped++;
            if (metrics.logsDropped % 100 === 0) {
              console.warn(
                `[PostHogTransport] Dropped ${metrics.logsDropped} logs without requestId`
              );
            }
            continue;
          }

          // Get or create request trace
          let trace = requestTraces.get(requestId);
          if (!trace) {
            trace = {
              logs: [],
              startedAt: Date.now(),
              lastUpdated: Date.now(),
              completed: false,
              retryCount: 0,
            };
            requestTraces.set(requestId, trace);
            metrics.tracesCreated++;
          }

          // Update trace metadata from log context
          trace.lastUpdated = Date.now();

          // Extract request-level information from appropriate logs
          if (obj.component === "HTTP" || obj.method) {
            // This is an access log - use it for request metadata
            trace.url = obj.url || obj.path;
            trace.method = obj.method;
            trace.statusCode = obj.statusCode;
            trace.responseTime = obj.responseTime || obj.duration;
            trace.ip = obj.ip;
            trace.userAgent = obj.userAgent;
            trace.timestamp = obj.timestamp || obj.time;
            trace.completed = true; // HTTP logs usually indicate request completion
          }

          // Extract user context
          if (obj.userId) trace.userId = obj.userId;
          if (obj.username) trace.username = obj.username;
          if (obj.traceId) trace.traceId = obj.traceId;
          if (obj.spanId) trace.spanId = obj.spanId;

          // Add the individual log entry
          const logEntry = {
            level: obj.level || "info",
            type: determineLogType(obj),
            serviceName: obj.serviceName || serviceName,
            message: obj.msg || obj.message || "",
            timestamp: obj.timestamp || obj.time || new Date().toISOString(),
            context: obj.context || obj.additionalContext || {},
            component: obj.component,
            duration: obj.duration,
          };

          // Include error information if present
          if (obj.err && typeof obj.err === "object") {
            logEntry.error = {
              message: obj.err.message,
              stack: obj.err.stack,
              code: obj.err.code,
              type: obj.err.type,
            };
          } else if (obj.error && typeof obj.error === "object") {
            logEntry.error = {
              message: obj.error.message,
              stack: obj.error.stack,
              code: obj.error.code,
              type: obj.error.type,
            };
          }

          trace.logs.push(logEntry);

          // If this is an error log, consider the request completed for faster error reporting
          if (obj.level === "error") {
            trace.completed = true;
          }

          // Immediate flush if we have too many logs for this request
          if (trace.logs.length >= MAX_LOGS_PER_REQUEST) {
            trace.completed = true;
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
        if (cleanupTimer) clearInterval(cleanupTimer);

        console.info(
          "[PostHogTransport] Finalizing stream, flushing remaining requests..."
        );
        console.info("[PostHogTransport] Final metrics:", metrics);

        await flushAllRequests();

        console.info("[PostHogTransport] Stream ended, all requests flushed.");
      },
    }
  );
};
