import 'reflect-metadata'
import { FRAMEWORK_METADATA_KEYS } from '../constants'
import {
  CircularDependencyError,
  InterfaceTokenError,
  InvalidRegistrationError,
  ServiceNotFoundError,
} from './errors'

// --- Type Definitions ---
export type Constructor<T = any> = new (...args: any[]) => T

/** A DI token: a string, a symbol, or a class constructor. */
export type DiToken = string | symbol | Constructor

export type BindingScope = 'singleton' | 'transient'

/**
 * Reflection metadata keys used by the DI container and route decorators.
 * Defined here (not in decorators.ts) so di-container and decorators.ts
 * never import each other — decorators.ts re-exports this for compatibility.
 */
export const METADATA_KEYS = {
  controllerPrefix: FRAMEWORK_METADATA_KEYS.CONTROLLER_PREFIX,
  routes: FRAMEWORK_METADATA_KEYS.ROUTES,
  validationSchema: FRAMEWORK_METADATA_KEYS.VALIDATION_SCHEMA,
  paramTypes: FRAMEWORK_METADATA_KEYS.PARAM_TYPES,
  middleware: FRAMEWORK_METADATA_KEYS.MIDDLEWARE,
  autowiredProperties: FRAMEWORK_METADATA_KEYS.AUTOWIRED_PROPERTIES,
  autowiredParams: FRAMEWORK_METADATA_KEYS.AUTOWIRED_PARAMS,
  swaggerMetadata: 'swagger:metadata',
  authRequired: FRAMEWORK_METADATA_KEYS.AUTH_REQUIRED,
  authRoles: FRAMEWORK_METADATA_KEYS.AUTH_ROLES,
} as const

export enum Scope {
  SINGLETON = 'singleton',
  TRANSIENT = 'transient',
}

export interface ComponentOptions {
  bindTo?: DiToken[]
  scope?: BindingScope
  eager?: boolean
}

export interface RegistrationOptions {
  useClass?: Constructor
  useFactory?: () => unknown
  scope?: BindingScope
  /** Resolve (and cache) during `Container.eagerInit()`. */
  eager?: boolean
  /** Allow replacing an existing registration for this token. */
  override?: boolean
}

interface ServiceDefinition {
  useClass?: Constructor
  useFactory?: () => unknown
  scope: BindingScope
  eager: boolean
  instance?: unknown
}

/** Constructor parameter types emitted by reflect-metadata for primitives. */
const PRIMITIVE_PARAM_TYPES = [String, Number, Boolean]

// --- The Container Class ---
export class Container {
  private readonly services = new Map<DiToken, ServiceDefinition>()
  private readonly resolving = new Set<DiToken>()

  public register(token: DiToken, options: RegistrationOptions): void {
    if (!options.useClass && !options.useFactory) {
      throw new InvalidRegistrationError(
        `[DI] Registration for token '${String(token)}' requires 'useClass' or 'useFactory'.`
      )
    }

    if (this.services.has(token) && !options.override) {
      throw new InvalidRegistrationError(
        `[DI] Token '${String(token)}' is already registered. Pass { override: true } to replace it.`
      )
    }

    this.services.set(token, {
      useClass: options.useClass,
      useFactory: options.useFactory,
      scope: options.scope || 'singleton',
      eager: options.eager === true,
    })
  }

  public resolve<T = unknown>(token: DiToken): T {
    const serviceDef = this.services.get(token)
    if (!serviceDef) {
      throw new ServiceNotFoundError(String(token))
    }

    if (this.resolving.has(token)) {
      throw new CircularDependencyError(String(token))
    }

    if (serviceDef.scope === 'singleton' && 'instance' in serviceDef) {
      return serviceDef.instance as T
    }

    this.resolving.add(token)

    try {
      let instance: unknown

      if (serviceDef.useFactory) {
        instance = serviceDef.useFactory()
        // Factory-created instances participate in property injection too:
        // metadata is read from the runtime constructor of the created object.
        this.performPropertyInjection(instance)
      } else {
        const ConcreteClass = serviceDef.useClass!
        const constructorArgs = this.resolveConstructorArgs(ConcreteClass)
        instance = new ConcreteClass(...constructorArgs)
        this.performPropertyInjection(instance)
      }

      if (serviceDef.scope === 'singleton') {
        serviceDef.instance = instance
      }

      return instance as T
    } finally {
      this.resolving.delete(token)
    }
  }

  private resolveConstructorArgs(ConcreteClass: Constructor): any[] {
    const constructorParamTypes =
      (Reflect.getMetadata('design:paramtypes', ConcreteClass) as any[]) || []
    const autowiredParamTokens =
      (Reflect.getMetadata(METADATA_KEYS.autowiredParams, ConcreteClass) as any[]) || []

    return constructorParamTypes.map((paramType: any, index: number) => {
      const tokenToResolve = autowiredParamTokens[index] || paramType

      if (!tokenToResolve) {
        return undefined
      }

      if (tokenToResolve === Object) {
        // `design:paramtypes` emits Object for interface-typed or untyped
        // parameters. Silence here produces a broken `undefined` dependency —
        // fail loudly instead (LLD contract: InterfaceTokenError).
        throw new InterfaceTokenError(
          `[DI] Constructor parameter ${index} of '${ConcreteClass.name}' resolves to 'Object' ` +
            `(an interface or untyped parameter). Annotate it with @Autowired(token).`
        )
      }

      if (PRIMITIVE_PARAM_TYPES.includes(tokenToResolve)) {
        return undefined
      }

      return this.resolve(tokenToResolve)
    })
  }

  private performPropertyInjection(instance: unknown): void {
    if (!instance || (typeof instance !== 'object' && typeof instance !== 'function')) {
      return
    }

    const ctor = (instance as any).constructor
    if (!ctor) {
      return
    }

    const autowiredProperties =
      (Reflect.getMetadata(METADATA_KEYS.autowiredProperties, ctor) as
        | { propertyKey: string | symbol; token: DiToken }[]
        | undefined) || []
    for (const prop of autowiredProperties) {
      ;(instance as any)[prop.propertyKey] = this.resolve(prop.token)
    }
  }

  public getRegisteredComponents(): Constructor[] {
    const definitions = Array.from(this.services.values())
    const classDefs = definitions.filter((def) => def.useClass).map((def) => def.useClass!)
    return Array.from(new Set(classDefs))
  }

  public isRegistered(token: DiToken): boolean {
    return this.services.has(token)
  }

  /** Remove a single registration (and its cached instance). */
  public unregister(token: DiToken): void {
    this.services.delete(token)
  }

  /** Resolve every registration marked `eager: true`. Called by BootifyApp.build(). */
  public async eagerInit(): Promise<void> {
    for (const [token, def] of this.services) {
      if (def.eager) {
        this.resolve(token)
      }
    }
  }

  /** Remove all registrations and cached instances (tests / HMR). */
  public clear(): void {
    this.services.clear()
    this.resolving.clear()
  }
}

export function createContainer(): Container {
  return new Container()
}

export const container = new Container()
