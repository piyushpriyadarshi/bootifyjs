import fastify, { FastifyInstance, FastifyReply, FastifyRequest, FastifyServerOptions } from 'fastify'
import { ZodObject } from 'zod'
import { AppConfig } from './config/AppConfig'
import { DEFAULT_SERVER_HOST, DEFAULT_SERVER_PORT } from './constants'
import { FastifyMiddleware } from './core/decorators'
import { defaultErrorHandler } from './core/error-handler'
import { BootifyStateError, BootifyStartError } from './core/errors'
import { Constructor, container } from './core/di-container'
import type { Container } from './core/di-container'
import { normalizePrefix, registerControllers } from './core/router'
import {
    createLogger,
    ILogger,
    LoggerBuilder,
    LogLevel,
    RequestContextProvider,
    StreamingStartupLogger
} from './logging'
import { SchedulerService } from './scheduling/scheduler.service'
import { resolveCacheStoreFromOptions } from './cache/builder'
import type { EnableCacheOptions } from './cache/builder'
import { CACHE_STORE_TOKEN } from './cache/cache.types'
import type { ICacheStore } from './cache/cache.types'
import { CacheService } from './cache/cache.service'
import { container as globalContainer } from './core/di-container'
import { createCorsFeature } from './features/cors'
import type { CorsFeatureOptions } from './features/cors'
import { createHealthCheckFeature } from './features/health'
import type { HealthCheckOptions } from './features/health'
import { createSwaggerFeature } from './features/swagger'
import type { SwaggerFeatureOptions } from './features/swagger'
import { setupAuth, matchAuthRule } from './auth/builder'
import type { EnableAuthOptions, AuthHandle } from './auth/builder'
import { createContextMiddleware } from './middleware/context.middleware'
import { createRequestLoggerOnResponse } from './middleware/request-logger.middleware'

export type PluginRegistrationFn = (app: FastifyInstance) => Promise<void> | void
export type ErrorHandlerFn = (error: Error, request: FastifyRequest, reply: FastifyReply) => Promise<void> | void
export type LifecycleHookFn = (app: FastifyInstance) => Promise<void> | void
export type LoggerConfigFn = (builder: LoggerBuilder) => LoggerBuilder

/**
 * Options for registering controllers
 */
export interface ControllerRegistrationOptions {
    /**
     * Prefix to prepend to all routes in this controller group
     * @example { prefix: '/api/v1' }
     */
    prefix?: string
}

/**
 * Internal representation of a controller group with its prefix
 */
interface ControllerGroup {
    controllers: Constructor[]
    prefix: string
}

export interface BootifyOptions {
    /** Use a dedicated DI container instead of the global default. */
    container?: Container
}

export class BootifyApp {
    private readonly container: Container
    private _app?: FastifyInstance
    private _logger?: ILogger
    private _startupLogger?: StreamingStartupLogger
    private _scheduler?: SchedulerService
    private built: boolean = false
    private readonly quiet: boolean
    private port: number = DEFAULT_SERVER_PORT
    private hostname: string = DEFAULT_SERVER_HOST
    private basePrefix: string = ''
    private controllerGroups: ControllerGroup[] = []
    private plugins: PluginRegistrationFn[] = []
    private beforeStartHooks: LifecycleHookFn[] = []
    private afterStartHooks: LifecycleHookFn[] = []
    private customErrorHandler?: ErrorHandlerFn
    private enableScheduler: boolean = true
    private loggerConfigFn?: LoggerConfigFn
    private serviceName: string = 'bootify-app'
    private signalHandlers: Array<[string, (...args: any[]) => void]> = []
    // --- opinionated feature switches ---
    private swaggerOptions?: SwaggerFeatureOptions
    private corsOptions?: CorsFeatureOptions
    private corsDisabled: boolean = false
    private healthOptions?: HealthCheckOptions
    private healthDisabled: boolean = false
    private authOptions?: EnableAuthOptions
    private authHandle?: AuthHandle
    private docsPath?: string
    private cacheOptions?: EnableCacheOptions
    private cacheDisabled: boolean = false
    private requestContextDisabled: boolean = false
    private requestLoggingEnabled: boolean = false
    private fastifyOptions: FastifyServerOptions = {
        logger: false,
        ignoreTrailingSlash: true,
    }

    constructor(options: BootifyOptions = {}) {
        this.container = options.container ?? container
        this.quiet = process.env.LOG_BANNER === 'false'
    }

    // --- Public handle (available after build()) ---

    /** The underlying Fastify instance. */
    get handle(): FastifyInstance {
        this.assertBuilt()
        return this._app!
    }

    /** The application logger. */
    get logger(): ILogger {
        this.assertBuilt()
        return this._logger!
    }

    /** The resolved scheduler, when `useScheduler(true)` (the default). */
    get scheduler(): SchedulerService | undefined {
        return this._scheduler
    }

    /** Typed config accessor. Requires `useConfig(schema)` to have been called. */
    get config(): AppConfig<any> {
        this.assertBuilt()
        return AppConfig.getInstance()
    }

    /** The auth handle after `enableAuth()` (undefined otherwise). */
    get auth(): AuthHandle | undefined {
        return this.authHandle
    }

    /** @deprecated Internal startup banner logger. Will be removed in v3.0. */
    get startupLogger(): StreamingStartupLogger {
        this.assertBuilt()
        return this._startupLogger!
    }

    /** Print all registered routes (delegates to Fastify). */
    printRoutes(): void {
        this.assertBuilt()
        this._app!.printRoutes()
    }

    /**
     * Graceful shutdown: removes signal handlers, stops the scheduler and
     * closes the server. Safe to call multiple times.
     */
    async close(): Promise<void> {
        this.removeSignalHandlers()

        if (this._scheduler) {
            await this._scheduler.stop().catch(() => undefined)
        }

        if (this._app) {
            await this._app.close().catch(() => undefined)
        }
    }

    // --- Builder API ---

    setFastifyOptions(options: FastifyServerOptions): this {
        this.fastifyOptions = { ...this.fastifyOptions, ...options }
        return this
    }

    setPort(port: number): this {
        this.port = port
        return this
    }

    setHostname(hostname: string): this {
        this.hostname = hostname
        return this
    }

    /**
     * Set the service/application name (used in logs)
     */
    setServiceName(name: string): this {
        this.serviceName = name
        return this
    }

    useConfig(schema: ZodObject<any>): this {
        AppConfig.initialize(schema)
        return this
    }

    /**
     * Set global base prefix for all routes
     * This prefix will be prepended to all controller routes
     *
     * @example
     * createBootifyApp()
     *   .setBasePrefix('/api/v1')
     *   .useControllers([UserController]) // Routes will be /api/v1/users/...
     */
    setBasePrefix(prefix: string): this {
        this.basePrefix = normalizePrefix(prefix)
        return this
    }

    /**
     * Register controllers with optional group prefix
     * The final route URL is: basePrefix + groupPrefix + controllerPrefix + methodPath
     *
     * @example
     * // Without prefix
     * .useControllers([UserController])
     *
     * // With group prefix
     * .useControllers([UserController, ProductController], { prefix: '/api/v1' })
     *
     * // Multiple groups with different prefixes
     * .useControllers([PublicController])
     * .useControllers([AdminController], { prefix: '/admin' })
     */
    useControllers(controllers: Constructor[], options?: ControllerRegistrationOptions): this {
        this.controllerGroups.push({
            controllers,
            prefix: normalizePrefix(options?.prefix || '')
        })
        return this
    }

    usePlugin(plugin: PluginRegistrationFn): this {
        this.plugins.push(plugin)
        return this
    }

    useMiddleware(middleware: FastifyMiddleware): this {
        this.plugins.push(async (app) => {
            app.addHook('onRequest', middleware)
        })
        return this
    }

    useMiddlewares(middlewares: FastifyMiddleware[]): this {
        middlewares.forEach((middleware) => this.useMiddleware(middleware))
        return this
    }

    useErrorHandler(handler: ErrorHandlerFn): this {
        this.customErrorHandler = handler
        return this
    }

    beforeStart(hook: LifecycleHookFn): this {
        this.beforeStartHooks.push(hook)
        return this
    }

    afterStart(hook: LifecycleHookFn): this {
        this.afterStartHooks.push(hook)
        return this
    }

    useScheduler(enabled: boolean = true): this {
        this.enableScheduler = enabled
        return this
    }

    /**
     * Cache customization. Default-ON: with no call at all, an
     * InMemoryCacheStore is bound and every @Cacheable just works.
     *
     * Exactly ONE of `store` / `client` / `maxEntries`:
     * - store:      your own ICacheStore instance
     * - client:     a Redis client YOU own (ioredis-shaped) — wrapped in
     *               RedisCacheStore (keys namespaced `cache:`); the framework
     *               never creates connections
     * - maxEntries: bounded default InMemoryCacheStore (LRU, opt-in)
     */
    enableCache(options: EnableCacheOptions = {}): this {
        this.cacheDisabled = false
        this.cacheOptions = { ...options }
        return this
    }

    /** Opt out of the automatic cache binding entirely. */
    disableCache(): this {
        this.cacheDisabled = true
        this.cacheOptions = undefined
        return this
    }

    // --- Opinionated features (zero-config opt-ins) ---

    /** Serve OpenAPI docs at `path` (default /docs). Zero-config. */
    enableSwagger(options: SwaggerFeatureOptions = {}): this {
        this.swaggerOptions = { ...this.swaggerOptions, ...options }
        return this
    }

    /** Enable CORS with dev-safe defaults; narrow with `origin` in production. */
    enableCors(options: CorsFeatureOptions = {}): this {
        this.corsDisabled = false
        this.corsOptions = { ...this.corsOptions, ...options }
        return this
    }

    /** Turn the default CORS behavior off entirely. */
    disableCors(): this {
        this.corsDisabled = true
        return this
    }

    /** Enable liveness (`/health`) and optional readiness endpoints. */
    enableHealthCheck(options: HealthCheckOptions = {}): this {
        this.healthDisabled = false
        this.healthOptions = { ...this.healthOptions, ...options }
        return this
    }

    /** Turn the default `/health` endpoint off entirely. */
    disableHealthCheck(): this {
        this.healthDisabled = true
        return this
    }

    /**
     * Enable authentication. Zero-config when `JWT_ACCESS_SECRET` /
     * `JWT_REFRESH_SECRET` env vars exist. Pairs with `@UseAuth()`,
     * `@Roles()` and `@CurrentUser()`.
     */
    enableAuth(options: EnableAuthOptions = {}): this {
        this.authOptions = { ...this.authOptions, ...options }
        return this
    }

    /** Opt out of the default request-context (x-request-id) middleware. */
    disableRequestContext(): this {
        this.requestContextDisabled = true
        return this
    }

    /** Add structured access logs on response (onResponse hook). */
    enableRequestLogging(): this {
        this.requestLoggingEnabled = true
        return this
    }

    /**
     * Configure the logger using the builder pattern
     *
     * @example
     * createBootifyApp()
     *   .useLogger(builder => builder
     *     .setLevel('debug')
     *     .addTransport(new MyCustomTransport())
     *   )
     */
    useLogger(configFn: LoggerConfigFn): this {
        this.loggerConfigFn = configFn
        return this
    }

    private initializeLogger(): ILogger {
        let builder = createLogger()
            .setServiceName(this.serviceName)
            .setLevel((process.env.LOG_LEVEL as LogLevel) || 'info')
            .addContextProvider(new RequestContextProvider())
            .setBaseContext({
                environment: process.env.NODE_ENV || 'development',
            })

        // Apply user customizations
        if (this.loggerConfigFn) {
            builder = this.loggerConfigFn(builder)
        }

        return builder.build(this.container)
    }

    private assertBuilt(): void {
        if (!this.built) {
            throw new BootifyStateError(
                'BootifyApp has not been built yet. Call build() first.'
            )
        }
    }

    /**
     * Build the application: initializes logging, creates the Fastify
     * instance, registers plugins, controllers and the error handler, resolves
     * eager services and the scheduler. Returns the same app instance.
     */
    async build(): Promise<BootifyApp> {
        if (this.built) {
            throw new BootifyStateError(
                'BootifyApp instance has already been built. Create a new app with createBootifyApp() to build again.'
            )
        }

        // Initialize the new logging system — registered into THIS app's
        // container so injected containers are self-sufficient.
        this._logger = this.initializeLogger()

        // Seed framework internals when a dedicated container is injected
        if (!this.container.isRegistered(StreamingStartupLogger)) {
            this.container.register(StreamingStartupLogger, {
                useClass: StreamingStartupLogger,
                override: true,
            })
        }

        // Initialize startup logger (still uses the streaming one for nice output)
        this._startupLogger = this.container.resolve<StreamingStartupLogger>(StreamingStartupLogger)

        if (!this.quiet) {
            this._startupLogger.logStartupBanner()
        }

        this._app = fastify(this.fastifyOptions)

        // 1. Request context (x-request-id) — default ON, first onRequest hook
        if (!this.requestContextDisabled) {
            this._app.addHook('onRequest', createContextMiddleware())
        }

        // 2. User plugins
        for (const plugin of this.plugins) {
            await plugin(this._app)
        }

        // 3. Opinionated features
        if (!this.corsDisabled) {
            const cors = createCorsFeature(this.corsOptions ?? {})
            await this._app.register(import('@fastify/cors'), cors.options as any)
        }

        let authEnabled = false
        if (this.authOptions) {
            this.authHandle = await setupAuth(this.container, this.authOptions)
            authEnabled = true
            if (this.authOptions.global) {
                const authenticate = this.authHandle.authenticate
                const authorize = this.authHandle.requireRoles
                const compiledRules = this.authHandle.compiledRules

                // Global auth = DENY-BY-DEFAULT (NestJS global-guard model),
                // with opt-outs:
                //   1. OPTIONS preflights (no credentials exist on them)
                //   2. @Public() routes (route config stamped by the router)
                //   3. first-match `routes` rule (auth: 'public' skips; roles gate)
                // Unauthenticated requests are rejected with 401; routes with
                // rules carrying `roles` are additionally gated (403).
                // Per-route hard rejection outside global mode: @UseAuth/@Roles.
                const globalAuth = async (request: FastifyRequest, reply: FastifyReply) => {
                    if (request.method === 'OPTIONS') return
                    const config = (request as any).routeOptions?.config
                    if (config?.authPublic) return

                    const rule = matchAuthRule(compiledRules, request)
                    if (rule?.auth === 'public') return

                    await authenticate(request, reply)
                    if (!(request as any).authenticated) {
                        return reply.status(401).send({ message: 'Unauthorized' })
                    }
                    if (rule?.roles && rule.roles.length > 0) {
                        await authorize(rule.roles)(request, reply)
                    }
                }
                this._app.addHook('preHandler', globalAuth)
            }
        }

        if (this.swaggerOptions) {
            const swagger = createSwaggerFeature(this.swaggerOptions, {
                serviceName: this.serviceName,
                authEnabled,
            })
            await swagger.register(this._app)
            this.docsPath = swagger.path
        }

        if (!this.healthDisabled) {
            const health = createHealthCheckFeature(this.healthOptions ?? {}, {
                serviceName: this.serviceName,
            })
            health.register(this._app, this.container)
        }

        if (this.requestLoggingEnabled && this._logger) {
            this._app.addHook('onResponse', createRequestLoggerOnResponse(this._logger) as any)
        }

        // 4. Cache: default-ON. Bind the store BEFORE any service resolves it,
        //    into BOTH containers (decorators resolve from the global one).
        if (!this.cacheDisabled) {
            const appBound = this.container.isRegistered(CACHE_STORE_TOKEN)
            const globalBound = globalContainer.isRegistered(CACHE_STORE_TOKEN)

            let store: ICacheStore
            if (this.cacheOptions) {
                // explicit enableCache wins — bind everywhere
                store = await resolveCacheStoreFromOptions(this.cacheOptions)
                const bind = (target: Container) =>
                    target.register(CACHE_STORE_TOKEN, { useFactory: () => store, override: true })
                bind(this.container)
                bind(globalContainer)
            } else if (appBound || globalBound) {
                // user already bound in one container — respect it, MIRROR the
                // same instance to the other (not a fresh default!)
                store = (globalBound
                    ? globalContainer.resolve(CACHE_STORE_TOKEN)
                    : this.container.resolve(CACHE_STORE_TOKEN)) as ICacheStore
                const bind = (target: Container) =>
                    target.register(CACHE_STORE_TOKEN, { useFactory: () => store, override: true })
                if (!appBound) bind(this.container)
                if (!globalBound) bind(globalContainer)
            } else {
                // default: nothing bound anywhere -> in-memory
                store = await resolveCacheStoreFromOptions({})
                const bind = (target: Container) =>
                    target.register(CACHE_STORE_TOKEN, { useFactory: () => store, override: true })
                bind(this.container)
                bind(globalContainer)
            }

            // Seed + eagerly resolve: broken bindings fail at STARTUP, not on
            // the first cached request.
            if (!this.container.isRegistered(CacheService)) {
                this.container.register(CacheService, { useClass: CacheService, override: true })
            }
            this.container.resolve(CacheService)
        }

        // 5. Register each controller group with its combined prefix
        const totalControllers = this.controllerGroups.reduce((sum, g) => sum + g.controllers.length, 0)
        if (totalControllers > 0) {
            if (!this.quiet) {
                this._startupLogger.logPhaseStart('Registering Controllers')
                this._startupLogger.logComponentStart('Controllers', `${totalControllers} found`)
            }

            for (const group of this.controllerGroups) {
                // Combine basePrefix + groupPrefix
                const combinedPrefix = normalizePrefix(this.basePrefix + group.prefix)
                registerControllers(this._app, group.controllers, combinedPrefix, {
                    container: this.container,
                    silent: this.quiet,
                })
            }

            if (!this.quiet) {
                this._startupLogger.logComponentComplete()
            }
        }

        this._app.setErrorHandler(this.customErrorHandler ?? defaultErrorHandler)

        if (!this.quiet) {
            this._startupLogger.logStartupComplete()
        }

        // Resolve every registration marked `eager: true` (fail-fast startup)
        await this.container.eagerInit()

        if (this.enableScheduler) {
            this._scheduler = this.container.resolve(SchedulerService)
        }

        this.built = true
        return this
    }

    /**
     * Build (if needed) and start the server.
     * Throws BootifyStartError on failure — the host process decides how to exit.
     */
    async start(): Promise<void> {
        if (!this.built) {
            await this.build()
        }
        await this.startServer()
    }

    private async startServer(): Promise<void> {
        const startupLogger = this._startupLogger!

        try {
            for (const hook of this.beforeStartHooks) {
                await hook(this._app!)
            }

            if (this.enableScheduler && this._scheduler) {
                if (!this.quiet) {
                    startupLogger.logComponentStart('Scheduler', 'Starting scheduled jobs')
                }
                await this._scheduler.start()
                if (!this.quiet) {
                    startupLogger.logComponentComplete()
                }
            }

            await this._app!.listen({ port: this.port, host: this.hostname })
            if (!this.quiet) {
                startupLogger.logStartupSummary(this.port, this.hostname, { docsPath: this.docsPath })
            }

            this._logger!.info('Application started successfully', {
                port: this.port,
                host: this.hostname,
                environment: process.env.NODE_ENV,
            })

            for (const hook of this.afterStartHooks) {
                await hook(this._app!)
            }

            this.setupGracefulShutdown()
        } catch (err) {
            this._logger?.error('Failed to start application', err as Error)
            throw new BootifyStartError(
                `Failed to start application on ${this.hostname}:${this.port}: ${(err as Error)?.message}`,
                err
            )
        }
    }

    private setupGracefulShutdown(): void {
        for (const signal of ['SIGTERM', 'SIGINT'] as const) {
            const handler = () => {
                void this.gracefulShutdown(signal)
            }
            process.once(signal, handler)
            this.signalHandlers.push([signal, handler])
        }
    }

    private removeSignalHandlers(): void {
        for (const [signal, handler] of this.signalHandlers) {
            process.removeListener(signal, handler)
        }
        this.signalHandlers = []
    }

    private async gracefulShutdown(signal: string): Promise<void> {
        this._logger?.info(`Received ${signal}, shutting down gracefully...`)
        await this.close()
        this._logger?.info('Shutdown complete')
    }
}

/**
 * Create a BootifyJS application. Returns a fluent builder — chain
 * configuration, then `.build()` and `.start()`.
 *
 * @example
 * const app = await createBootifyApp()
 *   .setServiceName('my-api')
 *   .enableSwagger()
 *   .useControllers([TodoController])
 *   .build()
 * await app.start()
 */
export function createBootifyApp(options: BootifyOptions = {}): BootifyApp {
    return new BootifyApp(options)
}

/**
 * @deprecated Use `createBootifyApp()` — same signature, better name.
 * Kept for 2.x compatibility; removal in the next major.
 */
export function createBootify(options: BootifyOptions = {}): BootifyApp {
    return createBootifyApp(options)
}
