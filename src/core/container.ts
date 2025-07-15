import 'reflect-metadata';
import { LoggerService } from '../logging';
import { getConfigInstance } from './config';

export type Constructor<T = any> = new (...args: any[]) => T;

export enum Scope {
  SINGLETON = 'singleton',
  TRANSIENT = 'transient'
}

interface ServiceDefinition {
  token: Constructor;
  scope: Scope;
  instance?: any;
}

export class Container {
  private services = new Map<Constructor, ServiceDefinition>();
  private resolving = new Set<Constructor>();
  private logger?: LoggerService;

  constructor() {
    try {
      this.logger = LoggerService.getInstance();
    } catch (error) {
      // Logger not initialized yet
    }
  }

  register<T>(token: Constructor<T>, scope: Scope = Scope.SINGLETON): void {
    this.services.set(token, { token, scope });
    
    if (this.logger) {
      this.logger.trace(`Service registered: ${token.name}`, { scope });
    }
  }

  resolve<T>(token: Constructor<T>): T {
    const serviceDefinition = this.services.get(token);
    if (!serviceDefinition) {
      if (this.logger) {
        this.logger.error(`Service not registered: ${token.name}`);
      }
      throw new Error(`Service ${token.name} is not registered`);
    }

    // Check for circular dependencies
    if (this.resolving.has(token)) {
      if (this.logger) {
        this.logger.error(`Circular dependency detected: ${token.name}`);
      }
      throw new Error(`Circular dependency detected for ${token.name}`);
    }

    // Return existing singleton instance
    if (serviceDefinition.scope === Scope.SINGLETON && serviceDefinition.instance) {
      if (this.logger) {
        this.logger.trace(`Returning existing singleton: ${token.name}`);
      }
      return serviceDefinition.instance;
    }

    this.resolving.add(token);

    try {
      const dependencies = Reflect.getMetadata('design:paramtypes', token) || [];
      const configDependencies = Reflect.getMetadata('inject:configs', token) || [];
      
      if (this.logger && dependencies.length > 0) {
        this.logger.trace(`Resolving dependencies for ${token.name}`, {
          dependencies: dependencies.map((dep: Constructor) => dep.name)
        });
      }
      
      const args = dependencies.map((dep: Constructor, index: number) => {
        // Check if this parameter should be injected with configuration
        const configClass = configDependencies[index];
        if (configClass) {
          return getConfigInstance(configClass);
        }
        return this.resolve(dep);
      });
      const instance = new token(...args);

      // Store singleton instance
      if (serviceDefinition.scope === Scope.SINGLETON) {
        serviceDefinition.instance = instance;
      }

      if (this.logger) {
        this.logger.trace(`Service resolved successfully: ${token.name}`);
      }

      return instance;
    } finally {
      this.resolving.delete(token);
    }
  }

  isRegistered<T>(token: Constructor<T>): boolean {
    return this.services.has(token);
  }

  clear(): void {
    this.services.clear();
    this.resolving.clear();
  }
}

export const container = new Container();