import { LoggerService } from '../core/logger.service';
import { LogContextService } from '../core/log-context.service';

export interface AuditOptions {
  action: string;
  resource: string;
  resourceIdPath?: string;
  resourcesPath?: string;
  detailsPath?: string;
  oldValuesPath?: string;
  newValuesPath?: string;
  metadataPath?: string;
  skipIf?: (args: any[], result: any) => boolean;
}

/**
 * Decorator for auditing method calls
 * @param options Audit options
 */
export function Audit(options: AuditOptions): MethodDecorator {
  return function (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const className = target.constructor.name;
    const methodName = String(propertyKey);

    descriptor.value = async function (...args: any[]) {
      const logger = LoggerService.getInstance();
      const context = LogContextService.getContext();
      
      try {
        // Execute the original method
        const result = await originalMethod.apply(this, args);
        
        // Skip audit logging if condition is met
        if (options.skipIf && options.skipIf(args, result)) {
          return result;
        }
        
        // Extract values from paths if specified
        const resourceId = options.resourceIdPath ? 
          extractValueFromPath(options.resourceIdPath, { args, result }) : 
          undefined;
        
        const resources = options.resourcesPath ? 
          extractValueFromPath(options.resourcesPath, { args, result }) : 
          undefined;
        
        const details = options.detailsPath ? 
          extractValueFromPath(options.detailsPath, { args, result }) : 
          undefined;
        
        const oldValues = options.oldValuesPath ? 
          extractValueFromPath(options.oldValuesPath, { args, result }) : 
          undefined;
        
        const newValues = options.newValuesPath ? 
          extractValueFromPath(options.newValuesPath, { args, result }) : 
          undefined;
        
        const metadata = options.metadataPath ? 
          extractValueFromPath(options.metadataPath, { args, result }) : 
          { method: `${className}.${methodName}`, args: sanitizeArgs(args) };
        
        // Log the audit event
        logger.audit({
          action: options.action,
          resource: options.resource,
          resourceId,
          resources: Array.isArray(resources) ? resources : undefined,
          details,
          oldValues,
          newValues,
          metadata,
          username: context?.username,
          userId: context?.userId,
          ip: context?.ip,
          userAgent: context?.userAgent,
          timestamp: new Date().toISOString()
        });
        
        return result;
      } catch (error) {
        // Still log audit on error, but mark as failed
        logger.audit({
          action: `${options.action}_FAILED`,
          resource: options.resource,
          details: { error: error instanceof Error ? error.message : String(error) },
          metadata: { method: `${className}.${methodName}`, args: sanitizeArgs(args) },
          username: context?.username,
          userId: context?.userId,
          ip: context?.ip,
          userAgent: context?.userAgent,
          timestamp: new Date().toISOString()
        });
        
        throw error;
      }
    };
    
    return descriptor;
  };
}

/**
 * Extracts a value from a path string like 'args.0.id' or 'result.data'
 */
function extractValueFromPath(path: string, context: { args: any[]; result: any }): any {
  const parts = path.split('.');
  const root = parts[0] === 'args' ? context.args : 
               parts[0] === 'result' ? context.result : 
               undefined;
  
  if (!root) return undefined;
  
  let current = parts[0] === 'args' ? context.args : context.result;
  
  for (let i = 1; i < parts.length; i++) {
    if (current === null || current === undefined) return undefined;
    
    // Handle array indices
    if (parts[0] === 'args' && i === 1 && !isNaN(parseInt(parts[i]))) {
      current = current[parseInt(parts[i])];
    } else {
      current = current[parts[i]];
    }
  }
  
  return current;
}

/**
 * Sanitizes arguments to prevent sensitive data from being logged
 */
function sanitizeArgs(args: any[]): any[] {
  return args.map(arg => {
    if (arg === null || arg === undefined) return arg;
    
    if (typeof arg === 'object') {
      const sanitized = { ...arg };
      
      // Remove sensitive fields
      const sensitiveFields = ['password', 'secret', 'token', 'apiKey', 'key', 'authorization'];
      sensitiveFields.forEach(field => {
        if (field in sanitized) {
          sanitized[field] = '***REDACTED***';
        }
      });
      
      return sanitized;
    }
    
    return arg;
  });
}