import { ZodSchema, zodToOpenAPI } from './validation';

export interface OpenAPIInfo {
  title: string;
  version: string;
  description?: string;
  contact?: {
    name?: string;
    email?: string;
    url?: string;
  };
  license?: {
    name: string;
    url?: string;
  };
}

export interface OpenAPIServer {
  url: string;
  description?: string;
}

export interface OpenAPITag {
  name: string;
  description?: string;
  externalDocs?: {
    description?: string;
    url: string;
  };
}

export interface OpenAPIOperation {
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
  deprecated?: boolean;
  security?: any[];
  externalDocs?: {
    description?: string;
    url: string;
  };
}

export interface OpenAPIResponse {
  description: string;
  schema?: ZodSchema;
  examples?: Record<string, any>;
  headers?: Record<string, any>;
}

export interface OpenAPISpec {
  openapi: string;
  info: OpenAPIInfo;
  servers?: OpenAPIServer[];
  paths: Record<string, any>;
  components: {
    schemas: Record<string, any>;
    securitySchemes?: Record<string, any>;
  };
  tags?: OpenAPITag[];
  security?: any[];
}

export interface ControllerOpenAPIMetadata {
  tags?: string[];
  security?: any[];
  responses?: Record<string, OpenAPIResponse>;
}

export interface MethodOpenAPIMetadata {
  operation?: OpenAPIOperation;
  responses?: Record<string, OpenAPIResponse>;
  security?: any[];
}

export class OpenAPIGenerator {
  private spec: OpenAPISpec;
  private schemaCounter = 0;
  private schemaCache = new Map<ZodSchema, string>();

  constructor(info: OpenAPIInfo, servers?: OpenAPIServer[]) {
    this.spec = {
      openapi: '3.0.0',
      info,
      servers: servers || [
        { url: 'http://localhost:3000', description: 'Development server' }
      ],
      paths: {},
      components: {
        schemas: {},
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
          }
        }
      },
      tags: []
    };
  }

  addControllers(controllers: any[]): void {
    controllers.forEach(Controller => {
      this.processController(Controller);
    });
  }

  private processController(Controller: any): void {
    const controllerPrefix = Reflect.getMetadata('controller:prefix', Controller) || '';
    const controllerMeta: ControllerOpenAPIMetadata = Reflect.getMetadata('openapi:controller', Controller) || {};
    
    // Add controller tags to global tags if not exists
    if (controllerMeta.tags) {
      controllerMeta.tags.forEach(tagName => {
        if (!this.spec.tags?.find(tag => tag.name === tagName)) {
          if (!this.spec.tags) this.spec.tags = [];
          this.spec.tags.push({ name: tagName });
        }
      });
    }

    const methodNames = Object.getOwnPropertyNames(Controller.prototype);
    
    methodNames.forEach(methodName => {
      if (methodName === 'constructor') return;
      
      const httpMethod = Reflect.getMetadata('route:method', Controller.prototype, methodName);
      const routePath = Reflect.getMetadata('route:path', Controller.prototype, methodName);
      
      if (httpMethod && routePath !== undefined) {
        const fullPath = this.normalizePath(controllerPrefix + routePath);
        const method = httpMethod.toLowerCase();
        
        this.addPathOperation(
          fullPath,
          method,
          Controller.prototype,
          methodName,
          controllerMeta
        );
      }
    });
  }

  private addPathOperation(
    path: string,
    method: string,
    prototype: any,
    methodName: string,
    controllerMeta: ControllerOpenAPIMetadata
  ): void {
    if (!this.spec.paths[path]) {
      this.spec.paths[path] = {};
    }

    const methodMeta: MethodOpenAPIMetadata = Reflect.getMetadata('openapi:method', prototype, methodName) || {};
    const validationMeta = Reflect.getMetadata('validation', prototype, methodName) || {};

    const operation: any = {
      summary: methodMeta.operation?.summary,
      description: methodMeta.operation?.description,
      operationId: methodMeta.operation?.operationId || `${method}${path.replace(/[^a-zA-Z0-9]/g, '')}`,
      tags: [
        ...(controllerMeta.tags || []),
        ...(methodMeta.operation?.tags || [])
      ],
      parameters: [],
      responses: {}
    };

    // Add parameters from validation metadata
    if (validationMeta.params) {
      const paramsSchema = zodToOpenAPI(validationMeta.params);
      if (paramsSchema.properties) {
        Object.entries(paramsSchema.properties).forEach(([paramName, paramSchema]) => {
          operation.parameters.push({
            name: paramName,
            in: 'path',
            required: paramsSchema.required?.includes(paramName) || false,
            schema: paramSchema
          });
        });
      }
    }

    if (validationMeta.query) {
      const querySchema = zodToOpenAPI(validationMeta.query);
      if (querySchema.properties) {
        Object.entries(querySchema.properties).forEach(([queryName, propSchema]) => {
          operation.parameters.push({
            name: queryName,
            in: 'query',
            required: querySchema.required?.includes(queryName) || false,
            schema: propSchema
          });
        });
      }
    }

    // Add request body from validation metadata
    if (validationMeta.body) {
      const bodySchemaName = this.addSchema(validationMeta.body);
      operation.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: `#/components/schemas/${bodySchemaName}` }
          }
        }
      };
    }

    // Add responses
    const allResponses = {
      ...controllerMeta.responses,
      ...methodMeta.responses
    };

    if (Object.keys(allResponses).length > 0) {
      Object.entries(allResponses).forEach(([statusCode, response]) => {
        operation.responses[statusCode] = this.formatResponse(response);
      });
    } else {
      // Default response
      operation.responses['200'] = {
        description: 'Successful response',
        content: {
          'application/json': {
            schema: validationMeta.response 
              ? { $ref: `#/components/schemas/${this.addSchema(validationMeta.response)}` }
              : { type: 'object' }
          }
        }
      };
    }

    // Add security
    const security = methodMeta.security || controllerMeta.security;
    if (security) {
      operation.security = security;
    }

    // Set deprecated flag
    if (methodMeta.operation?.deprecated) {
      operation.deprecated = true;
    }

    this.spec.paths[path][method] = operation;
  }

  private formatResponse(response: OpenAPIResponse): any {
    const formatted: any = {
      description: response.description
    };

    if (response.schema) {
      const schemaName = this.addSchema(response.schema);
      formatted.content = {
        'application/json': {
          schema: { $ref: `#/components/schemas/${schemaName}` }
        }
      };

      if (response.examples) {
        formatted.content['application/json'].examples = response.examples;
      }
    }

    if (response.headers) {
      formatted.headers = response.headers;
    }

    return formatted;
  }

  private addSchema(zodSchema: ZodSchema): string {
    // Check if schema already exists in cache
    if (this.schemaCache.has(zodSchema)) {
      return this.schemaCache.get(zodSchema)!;
    }

    const schemaName = `Schema${++this.schemaCounter}`;
    const openApiSchema = zodToOpenAPI(zodSchema);
    
    this.spec.components.schemas[schemaName] = openApiSchema;
    this.schemaCache.set(zodSchema, schemaName);
    
    return schemaName;
  }

  private normalizePath(path: string): string {
    return path.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  }

  getSpec(): OpenAPISpec {
    return this.spec;
  }
}