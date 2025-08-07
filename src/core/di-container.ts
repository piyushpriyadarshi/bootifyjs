// import 'reflect-metadata'
// import { METADATA_KEYS } from './decorators'

// export type Constructor<T = any> = new (...args: any[]) => T
// export type DiToken = any

export enum Scope {
  SINGLETON = 'singleton',
  TRANSIENT = 'transient',
}

// // The definition now clearly separates the token from the class to instantiate
// interface ServiceDefinition {
//   useClass: Constructor
//   scope: Scope
//   instance?: any
// }

// export interface RegistrationOptions {
//   useClass: Constructor
//   scope?: Scope
// }

// export class Container {
//   private services = new Map<DiToken, ServiceDefinition>()
//   private resolving = new Set<DiToken>()

//   // The register method is now more powerful
//   register(token: DiToken, options: RegistrationOptions): void {
//     if (!this.services.has(token)) {
//       this.services.set(token, {
//         useClass: options.useClass,
//         scope: options.scope || Scope.SINGLETON,
//       })
//     }
//     console.log(this.services)
//   }

//   // resolve<T>(token: DiToken): T {
//   //   const serviceDef = this.services.get(token)
//   //   console.log('serviceDef', serviceDef, token)
//   //   if (!serviceDef) {
//   //     throw new Error(`Service with token '${String(token)}' is not registered.`)
//   //   }

//   //   if (this.resolving.has(token)) {
//   //     throw new Error(`Circular dependency detected for token '${String(token)}'.`)
//   //   }

//   //   if (serviceDef.scope === Scope.SINGLETON && serviceDef.instance) {
//   //     return serviceDef.instance
//   //   }

//   //   this.resolving.add(token)

//   //   try {
//   //     // We always instantiate using serviceDef.useClass
//   //     const ConcreteClass = serviceDef.useClass

//   //     const constructorDeps = Reflect.getMetadata('design:paramtypes', ConcreteClass) || []
//   //     const constructorArgs = constructorDeps.map((dep: Constructor) => this.resolve(dep))
//   //     const instance = new ConcreteClass(...constructorArgs)

//   //     const autowiredProperties =
//   //       Reflect.getMetadata(METADATA_KEYS.autowiredProperties, ConcreteClass) || []
//   //     for (const prop of autowiredProperties) {
//   //       // Resolve the dependency using its registered token (which could be a class or a symbol)
//   //       const dependencyToken = prop.token || prop.type
//   //       const dependencyToInject = this.resolve(dependencyToken)
//   //       ;(instance as any)[prop.propertyKey] = dependencyToInject
//   //     }

//   //     if (serviceDef.scope === Scope.SINGLETON) {
//   //       serviceDef.instance = instance
//   //     }
//   //     return instance
//   //   } finally {
//   //     this.resolving.delete(token)
//   //   }
//   // }
//   public getRegisteredComponents(): Constructor[] {
//     const definitions = Array.from(this.services.values())
//     // Use a Set to automatically handle duplicates, as multiple tokens
//     // can point to the same class constructor.

//     console.log('definitions', definitions)
//     const uniqueConstructors = new Set(definitions.map((def) => def.useClass))
//     return Array.from(uniqueConstructors)
//   }
//   public resolve<T>(token: DiToken): T {
//     const serviceDef = this.services.get(token)
//     if (!serviceDef) {
//       throw new Error(`[DI] Service with token '${String(token)}' is not registered.`)
//     }

//     if (this.resolving.has(token)) {
//       throw new Error(`[DI] Circular dependency detected for token '${String(token)}'.`)
//     }

//     if (serviceDef.scope === Scope.SINGLETON && serviceDef.instance) {
//       return serviceDef.instance
//     }

//     this.resolving.add(token)

//     try {
//       const ConcreteClass = serviceDef.useClass

//       // --- This is the implementation you are looking for ---
//       // 1. Get both sets of metadata for the constructor.
//       const constructorParamTypes = Reflect.getMetadata('design:paramtypes', ConcreteClass) || []
//       const autowiredParamTokens =
//         Reflect.getMetadata(METADATA_KEYS.autowiredParams, ConcreteClass) || []

//       // 2. Resolve constructor arguments by prioritizing the @Autowired token.
//       const constructorArgs = constructorParamTypes.map((paramType: any, index: number) => {
//         // If an @Autowired(TOKEN) was used on this parameter, use that token.
//         // Otherwise, fall back to the type inferred by reflect-metadata.
//         const tokenToResolve = autowiredParamTokens[index] || paramType

//         // Prevent trying to resolve primitive types like String, Number, etc.
//         if ([String, Number, Boolean, Object].includes(tokenToResolve)) {
//           // This check prevents the "String is not registered" error.
//           return undefined
//         }

//         // Recursively resolve the dependency.
//         return this.resolve(tokenToResolve)
//       })

//       // 3. Instantiate the Class with the resolved dependencies.
//       const instance = new ConcreteClass(...constructorArgs)

//       // 4. Perform Property (Field) Injection.
//       const autowiredProperties =
//         Reflect.getMetadata(METADATA_KEYS.autowiredProperties, ConcreteClass) || []
//       for (const prop of autowiredProperties) {
//         ;(instance as any)[prop.propertyKey] = this.resolve(prop.token)
//       }

//       if (serviceDef.scope === Scope.SINGLETON) {
//         serviceDef.instance = instance
//       }
//       return instance
//     } finally {
//       this.resolving.delete(token)
//     }
//   }
//   public isRegistered(token: DiToken): boolean {
//     return this.services.has(token)
//   }
// }

// export const container = new Container()

import 'reflect-metadata'
import { METADATA_KEYS } from './decorators'

// --- Type Definitions ---
export type Constructor<T = any> = new (...args: any[]) => T
export type DiToken = any
export type BindingScope = 'Singleton' | 'Transient'

export interface ComponentOptions {
  bindTo?: DiToken[]
  scope?: BindingScope
  eager?: boolean
}

export interface RegistrationOptions {
  useClass?: Constructor
  useFactory?: () => any // <-- ADDED: For factory providers
  scope?: BindingScope
}

interface ServiceDefinition {
  useClass?: Constructor
  useFactory?: () => any // <-- ADDED: For factory providers
  scope: BindingScope
  instance?: any
}

// --- Eager Loading Registry ---
export const eagerIdentifiers = new Set<DiToken>()

// --- The Container Class ---
export class Container {
  private readonly services = new Map<DiToken, ServiceDefinition>()
  private readonly resolving = new Set<DiToken>()

  public register(token: DiToken, options: RegistrationOptions): void {
    if (!options.useClass && !options.useFactory) {
      throw new Error(
        `[DI] Registration for token '${String(token)}' requires 'useClass' or 'useFactory'.`
      )
    }
    this.services.set(token, {
      useClass: options.useClass,
      useFactory: options.useFactory,
      scope: options.scope || 'Singleton',
    })
  }

  public resolve<T>(token: DiToken): T {
    const serviceDef = this.services.get(token)
    if (!serviceDef) {
      throw new Error(`[DI] Service with token '${String(token)}' is not registered.`)
    }

    if (this.resolving.has(token)) {
      throw new Error(`[DI] Circular dependency detected for token '${String(token)}'.`)
    }

    if (serviceDef.scope === 'Singleton' && serviceDef.instance) {
      return serviceDef.instance
    }

    this.resolving.add(token)

    try {
      let instance: T

      // --- ENHANCED: Handle factory providers first ---
      if (serviceDef.useFactory) {
        instance = serviceDef.useFactory()
      } else if (serviceDef.useClass) {
        // Fallback to class-based instantiation
        const ConcreteClass = serviceDef.useClass
        const constructorArgs = this.resolveConstructorArgs(ConcreteClass)
        instance = new ConcreteClass(...constructorArgs) as T
        this.performPropertyInjection(instance, ConcreteClass)
      } else {
        // This case should be prevented by the check in .register()
        throw new Error(`[DI] No valid provider for token '${String(token)}'.`)
      }

      if (serviceDef.scope === 'Singleton') {
        serviceDef.instance = instance
      }

      return instance
    } finally {
      this.resolving.delete(token)
    }
  }

  private resolveConstructorArgs(ConcreteClass: Constructor): any[] {
    const constructorParamTypes = Reflect.getMetadata('design:paramtypes', ConcreteClass) || []
    const autowiredParamTokens =
      Reflect.getMetadata(METADATA_KEYS.autowiredParams, ConcreteClass) || []

    return constructorParamTypes.map((paramType: any, index: number) => {
      const tokenToResolve = autowiredParamTokens[index] || paramType

      if (!tokenToResolve || [String, Number, Boolean, Object].includes(tokenToResolve)) {
        return undefined
      }

      return this.resolve(tokenToResolve)
    })
  }

  private performPropertyInjection(instance: any, ConcreteClass: Constructor): void {
    const autowiredProperties =
      Reflect.getMetadata(METADATA_KEYS.autowiredProperties, ConcreteClass) || []
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
}

export const container = new Container()
