import { z } from 'zod';
import { IncomingMessage, ServerResponse } from 'http';
import { ValidationError } from './errors';

export type ZodSchema = z.ZodSchema<any>;

export interface ValidationMetadata {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
  response?: ZodSchema;
}

export class ValidationService {
  static validateBody(data: any, schema: ZodSchema): any {
    try {
      return schema.parse(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
        throw new ValidationError(`Body validation failed: ${messages.join(', ')}`);
      }
      throw error;
    }
  }

  static validateQuery(data: any, schema: ZodSchema): any {
    try {
      return schema.parse(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
        throw new ValidationError(`Query validation failed: ${messages.join(', ')}`);
      }
      throw error;
    }
  }

  static validateParams(data: any, schema: ZodSchema): any {
    try {
      return schema.parse(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
        throw new ValidationError(`Params validation failed: ${messages.join(', ')}`);
      }
      throw error;
    }
  }

  static validateResponse(data: any, schema: ZodSchema): any {
    try {
      return schema.parse(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.warn('Response validation failed:', error.errors);
        // Don't throw for response validation, just log warning
        return data;
      }
      return data;
    }
  }
}

// Convert Zod schema to OpenAPI schema
export function zodToOpenAPI(schema: ZodSchema): any {
  const zodDef = (schema as any)._def;
  
  // Handle ZodEffects (transformations) first
  if (schema instanceof z.ZodEffects) {
    return zodToOpenAPI((schema as any)._def.schema);
  }

  // Handle optional and nullable early to catch nested transformations
  if (schema instanceof z.ZodOptional) {
    return zodToOpenAPI((schema as any)._def.innerType);
  }

  if (schema instanceof z.ZodNullable) {
    const baseSchema = zodToOpenAPI((schema as any)._def.innerType);
    return {
      ...baseSchema,
      nullable: true
    };
  }

  // Use type casting to access Zod internal properties
  if (schema instanceof z.ZodString) {
    const stringSchema: any = { type: 'string' };
    // Handle string validations
    if ((zodDef as any).checks) {
      (zodDef as any).checks.forEach((check: any) => {
        switch (check.kind) {
          case 'min':
            stringSchema.minLength = check.value;
            break;
          case 'max':
            stringSchema.maxLength = check.value;
            break;
          case 'email':
            stringSchema.format = 'email';
            break;
          case 'url':
            stringSchema.format = 'uri';
            break;
          case 'uuid':
            stringSchema.format = 'uuid';
            break;
        }
      });
    }
    return stringSchema;
  }

  if (schema instanceof z.ZodNumber) {
    return { type: 'number' };
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean' };
  }

  if (schema instanceof z.ZodDate) {
    return { type: 'string', format: 'date-time' };
  }

  if (schema instanceof z.ZodArray) {
    return {
      type: 'array',
      items: zodToOpenAPI((schema as any)._def.type)
    };
  }

  if (schema instanceof z.ZodObject) {
    const shape = (schema as any)._def.shape();
    const properties: any = {};
    const required: string[] = [];

    Object.entries(shape).forEach(([key, value]: [string, any]) => {
      properties[key] = zodToOpenAPI(value);
      if (!(value instanceof z.ZodOptional)) {
        required.push(key);
      }
    });

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined
    };
  }

  if (schema instanceof z.ZodEnum) {
    return {
      type: 'string',
      enum: (schema as any)._def.values
    };
  }

  if (schema instanceof z.ZodLiteral) {
    const value = (schema as any)._def.value;
    return {
      type: typeof value,
      enum: [value]
    };
  }

  if (schema instanceof z.ZodUnion) {
    return {
      oneOf: (schema as any)._def.options.map((option: any) => zodToOpenAPI(option))
    };
  }

  // Handle transformed schemas (like string to number conversion)
  if ((schema as any)._def?.innerType) {
    return zodToOpenAPI((schema as any)._def.innerType);
  }

  // Fallback for unsupported types
  console.warn(`Unsupported Zod type: ${schema.constructor.name}`);
  return { type: 'object' };
}