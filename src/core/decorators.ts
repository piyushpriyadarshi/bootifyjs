import 'reflect-metadata';
import { container, Scope } from './container';
import { Middleware } from './middleware';
import { ZodSchema, ValidationMetadata } from './validation';
import { ControllerOpenAPIMetadata, MethodOpenAPIMetadata, OpenAPIOperation, OpenAPIResponse } from './openapi';
import { getConfigInstance } from './config';

// Class Decorators
export const Injectable = (scope: Scope = Scope.SINGLETON): ClassDecorator => {
  return (target: any) => {
    container.register(target, scope);
  };
};

export const Service = (scope: Scope = Scope.SINGLETON): ClassDecorator => {
  return (target: any) => {
    container.register(target, scope);
  };
};

export const Repository = (scope: Scope = Scope.SINGLETON): ClassDecorator => {
  return (target: any) => {
    container.register(target, scope);
  };
};

export const Controller = (prefix: string = ''): ClassDecorator => {
  return (target: any) => {
    Reflect.defineMetadata('controller:prefix', prefix, target);
    container.register(target);
  };
};

// HTTP Method Decorators
export const Get = (path: string = ''): MethodDecorator => {
  return (target: any, propertyKey: string | symbol) => {
    Reflect.defineMetadata('route:method', 'GET', target, propertyKey);
    Reflect.defineMetadata('route:path', path, target, propertyKey);
  };
};

export const Post = (path: string = ''): MethodDecorator => {
  return (target: any, propertyKey: string | symbol) => {
    Reflect.defineMetadata('route:method', 'POST', target, propertyKey);
    Reflect.defineMetadata('route:path', path, target, propertyKey);
  };
};

export const Put = (path: string = ''): MethodDecorator => {
  return (target: any, propertyKey: string | symbol) => {
    Reflect.defineMetadata('route:method', 'PUT', target, propertyKey);
    Reflect.defineMetadata('route:path', path, target, propertyKey);
  };
};

export const Delete = (path: string = ''): MethodDecorator => {
  return (target: any, propertyKey: string | symbol) => {
    Reflect.defineMetadata('route:method', 'DELETE', target, propertyKey);
    Reflect.defineMetadata('route:path', path, target, propertyKey);
  };
};

// Parameter Decorators
export const Req = (): ParameterDecorator => {
  return (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) => {
    Reflect.defineMetadata(`param:${parameterIndex}`, { type: 'request' }, target, propertyKey!);
  };
};

export const Res = (): ParameterDecorator => {
  return (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) => {
    Reflect.defineMetadata(`param:${parameterIndex}`, { type: 'response' }, target, propertyKey!);
  };
};

export const Body = (): ParameterDecorator => {
  return (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) => {
    Reflect.defineMetadata(`param:${parameterIndex}`, { type: 'body' }, target, propertyKey!);
  };
};

export const Param = (name: string): ParameterDecorator => {
  return (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) => {
    Reflect.defineMetadata(`param:${parameterIndex}`, { type: 'param', name }, target, propertyKey!);
  };
};

export const Query = (name?: string): ParameterDecorator => {
  return (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) => {
    Reflect.defineMetadata(`param:${parameterIndex}`, { type: 'query', name }, target, propertyKey!);
  };
};

// Middleware Decorators
export const UseMiddleware = (...middlewares: Middleware[]): MethodDecorator & ClassDecorator => {
  return (target: any, propertyKey?: string | symbol) => {
    if (propertyKey) {
      // Method decorator
      Reflect.defineMetadata('middlewares', middlewares, target, propertyKey);
    } else {
      // Class decorator
      Reflect.defineMetadata('middlewares', middlewares, target);
    }
  };
};

// Validation Decorators
export const ValidateBody = (schema: ZodSchema): MethodDecorator => {
  return (target: any, propertyKey: string | symbol) => {
    const existingValidation: ValidationMetadata = Reflect.getMetadata('validation', target, propertyKey) || {};
    existingValidation.body = schema;
    Reflect.defineMetadata('validation', existingValidation, target, propertyKey);
  };
};

export const ValidateQuery = (schema: ZodSchema): MethodDecorator => {
  return (target: any, propertyKey: string | symbol) => {
    const existingValidation: ValidationMetadata = Reflect.getMetadata('validation', target, propertyKey) || {};
    existingValidation.query = schema;
    Reflect.defineMetadata('validation', existingValidation, target, propertyKey);
  };
};

export const ValidateParams = (schema: ZodSchema): MethodDecorator => {
  return (target: any, propertyKey: string | symbol) => {
    const existingValidation: ValidationMetadata = Reflect.getMetadata('validation', target, propertyKey) || {};
    existingValidation.params = schema;
    Reflect.defineMetadata('validation', existingValidation, target, propertyKey);
  };
};

export const ValidateResponse = (schema: ZodSchema): MethodDecorator => {
  return (target: any, propertyKey: string | symbol) => {
    const existingValidation: ValidationMetadata = Reflect.getMetadata('validation', target, propertyKey) || {};
    existingValidation.response = schema;
    Reflect.defineMetadata('validation', existingValidation, target, propertyKey);
  };
};

// Configuration injection decorator
export const InjectConfig = <T>(configClass: new () => T): ParameterDecorator => {
  return (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) => {
    const existingTypes = Reflect.getMetadata('design:paramtypes', target, propertyKey!) || [];
    const existingConfigs = Reflect.getMetadata('inject:configs', target, propertyKey!) || [];
    
    existingConfigs[parameterIndex] = configClass;
    Reflect.defineMetadata('inject:configs', existingConfigs, target, propertyKey!);
  };
};

// OpenAPI Documentation Decorators
export const ApiTags = (...tags: string[]): ClassDecorator => {
  return (target: any) => {
    const existingMeta: ControllerOpenAPIMetadata = Reflect.getMetadata('openapi:controller', target) || {};
    existingMeta.tags = [...(existingMeta.tags || []), ...tags];
    Reflect.defineMetadata('openapi:controller', existingMeta, target);
  };
};

export const ApiSecurity = (security: any[]): ClassDecorator & MethodDecorator => {
  return (target: any, propertyKey?: string | symbol) => {
    if (propertyKey) {
      // Method decorator
      const existingMeta: MethodOpenAPIMetadata = Reflect.getMetadata('openapi:method', target, propertyKey) || {};
      existingMeta.security = security;
      Reflect.defineMetadata('openapi:method', existingMeta, target, propertyKey);
    } else {
      // Class decorator
      const existingMeta: ControllerOpenAPIMetadata = Reflect.getMetadata('openapi:controller', target) || {};
      existingMeta.security = security;
      Reflect.defineMetadata('openapi:controller', existingMeta, target);
    }
  };
};

export const ApiResponse = (statusCode: number, response: OpenAPIResponse): ClassDecorator & MethodDecorator => {
  return (target: any, propertyKey?: string | symbol) => {
    if (propertyKey) {
      // Method decorator
      const existingMeta: MethodOpenAPIMetadata = Reflect.getMetadata('openapi:method', target, propertyKey) || {};
      if (!existingMeta.responses) existingMeta.responses = {};
      existingMeta.responses[statusCode.toString()] = response;
      Reflect.defineMetadata('openapi:method', existingMeta, target, propertyKey);
    } else {
      // Class decorator
      const existingMeta: ControllerOpenAPIMetadata = Reflect.getMetadata('openapi:controller', target) || {};
      if (!existingMeta.responses) existingMeta.responses = {};
      existingMeta.responses[statusCode.toString()] = response;
      Reflect.defineMetadata('openapi:controller', existingMeta, target);
    }
  };
};

export const ApiOperation = (operation: OpenAPIOperation): MethodDecorator => {
  return (target: any, propertyKey: string | symbol) => {
    const existingMeta: MethodOpenAPIMetadata = Reflect.getMetadata('openapi:method', target, propertyKey) || {};
    existingMeta.operation = operation;
    Reflect.defineMetadata('openapi:method', existingMeta, target, propertyKey);
  };
};