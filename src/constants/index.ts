/**
 * BootifyJS Framework Constants
 * 
 * This file contains all framework-level constants used throughout the BootifyJS framework.
 * These constants provide default values and configuration options that can be referenced
 * across the entire framework.
 */

import { FastifyRequest } from "fastify"
import { ContextExtractor } from "../middleware"

// Server Configuration Constants
export const DEFAULT_SERVER_PORT = 3000
export const DEFAULT_SERVER_HOST = '0.0.0.0'
export const DEFAULT_LOCALHOST = 'localhost'

export const DEFAULT_CONTEXT_EXTRACTOR: ContextExtractor = (req: FastifyRequest) => ({
  requestId: req.id,
  userId: req?.user?.id,
})

export const DEFAULT_SERVICE_NAME = 'bootifyjs-app'

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
} as const

// Framework Metadata Keys
export const FRAMEWORK_METADATA_KEYS = {
  CONTROLLER_PREFIX: 'bootify:controller-prefix',
  ROUTES: 'bootify:routes',
  VALIDATION_SCHEMA: 'bootify:validation-schema',
  PARAM_TYPES: 'bootify:param-types',
  MIDDLEWARE: 'bootify:middleware',
  AUTOWIRED_PROPERTIES: 'bootify:autowired-properties',
  AUTOWIRED_PARAMS: 'bootify:autowired-params',
} as const

// Environment Constants
export const ENVIRONMENTS = {
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
  TEST: 'test',
  STAGING: 'staging',
} as const

// Default Configuration Values
export const DEFAULT_CONFIG = {
  ENABLE_SWAGGER: false,
  LOG_LEVEL: 'info',
  REQUEST_TIMEOUT: 30000, // 30 seconds
  MAX_REQUEST_SIZE: '1mb',
} as const

// Header Names
export const HEADERS = {
  REQUEST_ID: 'X-Request-Id',
  TRACE_ID: 'X-Trace-Id',
  SPAN_ID: 'X-Span-Id',
  AUTHORIZATION: 'authorization',
  CONTENT_TYPE: 'content-type',
  USER_AGENT: 'user-agent',
} as const

// Cache Constants
export const CACHE = {
  DEFAULT_TTL: 300, // 5 minutes in seconds
  MAX_ENTRIES: 1000,
} as const

// Event System Constants
export const EVENTS = {
  MAX_LISTENERS: 100,
  DEFAULT_PRIORITY: 0,
} as const