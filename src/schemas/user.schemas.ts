import { z } from 'zod';

// User entity schema
export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(2).max(100),
  createdAt: z.date()
});

// Create user request schema
export const createUserSchema = z.object({
  email: z.string().email('Invalid email format'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name must not exceed 100 characters')
});

// Update user request schema
export const updateUserSchema = z.object({
  email: z.string().email('Invalid email format').optional(),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name must not exceed 100 characters').optional()
});

// User params schema
export const userParamsSchema = z.object({
  id: z.string().uuid('Invalid user ID format')
});

// Email params schema
export const emailParamsSchema = z.object({
  email: z.string().email('Invalid email format')
});

// Query schemas
export const paginationSchema = z.object({
  limit: z.string().regex(/^\d+$/, 'Limit must be a number').transform(Number).optional(),
  offset: z.string().regex(/^\d+$/, 'Offset must be a number').transform(Number).optional()
});

// Response schemas
export const userResponseSchema = userSchema;

export const usersListResponseSchema = z.array(userSchema);

export const createUserResponseSchema = userSchema;

export const updateUserResponseSchema = userSchema;

export const deleteUserResponseSchema = z.object({
  message: z.string()
});

// Error response schemas
export const errorResponseSchema = z.object({
  error: z.string(),
  status: z.number(),
  timestamp: z.string()
});

export const validationErrorResponseSchema = z.object({
  error: z.string(),
  status: z.literal(400),
  timestamp: z.string()
});

// Health check schemas
export const healthResponseSchema = z.object({
  status: z.literal('OK'),
  timestamp: z.string(),
  uptime: z.number(),
  memory: z.object({
    rss: z.number(),
    heapTotal: z.number(),
    heapUsed: z.number(),
    external: z.number(),
    arrayBuffers: z.number()
  }),
  version: z.string()
});

export const pingResponseSchema = z.object({
  message: z.literal('pong')
});