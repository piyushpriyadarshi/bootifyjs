/**
 * Single source of truth for which files the vitest tsc-transpile plugin
 * handles. BootifyJS uses experimental decorators + emitDecoratorMetadata
 * throughout src (DI, controllers, services, stores), so all of src and
 * tests are transpiled with tsc. If decorator usage is ever scoped to
 * fewer modules, tighten these globs for faster transforms.
 */
export const DECORATOR_GLOBS: RegExp[] = [/src[\\/].*\.ts$/, /tests[\\/].*\.ts$/]
