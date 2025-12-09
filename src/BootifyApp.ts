import fastify, { FastifyInstance, FastifyReply, FastifyRequest, FastifyServerOptions } from 'fastify'
import { ZodObject } from 'zod'
import { AppConfig } from './config/AppConfig'
import { DEFAULT_SERVER_HOST, DEFAULT_SERVER_PORT } from './constants'
import { FastifyMiddleware } from './core/decorators'
import { Constructor, container } from './core/di-container'
import { registerControllers } from './core/router'
import {
    createLogger,
    ILogger,
    LoggerBuilder,
    LogLevel,
    RequestContextProvider,
    StreamingStartupLogger
} from './logging'
import { SchedulerService } from './scheduling/scheduler.service'

export type PluginRegistrationFn = (app: FastifyInstance) => Promise<void> | void
export type ErrorHandlerFn = (error: Error, request: FastifyRequest, reply: FastifyReply) => Promise<void> | void
export type LifecycleHookFn = (app: FastifyInstance) => Promise<void> | void
export type LoggerConfigFn = (builder: LoggerBuilder) => LoggerBuilder

export class BootifyApp {
    private app!: FastifyInstance
    private logger!: ILogger
    private startupLogger!: StreamingStartupLogger
    private scheduler?: SchedulerService
    private port: number = DEFAULT_SERVER_PORT
    private hostname: string = DEFAULT_SERVER_HOST
    private controllers: Constructor[] = []
    private plugins: PluginRegistrationFn[] = []
    private beforeStartHooks: LifecycleHookFn[] = []
    private afterStartHooks: LifecycleHookFn[] = []
    private customErrorHandler?: ErrorHandlerFn
    private enableScheduler: boolean = true
    private loggerConfigFn?: LoggerConfigFn
    private serviceName: string = 'bootify-app'
    private fastifyOptions: FastifyServerOptions = {
        logger: false,
        ignoreTrailingSlash: true,
    }

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

    useControllers(controllers: Constructor[]): this {
        this.controllers.push(...controllers)
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
     * Configure the logger using the builder pattern
     * 
     * @example
     * createBootify()
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

        return builder.build()
    }

    async build(): Promise<{
        app: FastifyInstance
        start: () => Promise<void>
        logger: ILogger
        startupLogger: StreamingStartupLogger
        scheduler?: SchedulerService
    }> {
        // Initialize the new logging system
        this.logger = this.initializeLogger()

        // Initialize startup logger (still uses the streaming one for nice output)
        this.startupLogger = container.resolve<StreamingStartupLogger>(StreamingStartupLogger)

        this.startupLogger.logStartupBanner()

        this.app = fastify(this.fastifyOptions)

        for (const plugin of this.plugins) {
            await plugin(this.app)
        }

        if (this.controllers.length > 0) {
            this.startupLogger.logPhaseStart('Registering Controllers')
            this.startupLogger.logComponentStart('Controllers', `${this.controllers.length} found`)
            registerControllers(this.app, this.controllers)
            this.startupLogger.logComponentComplete()
        }

        if (this.customErrorHandler) {
            this.app.setErrorHandler(this.customErrorHandler)
        }

        this.startupLogger.logStartupComplete()

        if (this.enableScheduler) {
            this.scheduler = container.resolve(SchedulerService)
        }

        const start = async () => {
            try {
                for (const hook of this.beforeStartHooks) {
                    await hook(this.app)
                }

                if (this.enableScheduler && this.scheduler) {
                    this.startupLogger.logComponentStart('Scheduler', 'Starting scheduled jobs')
                    await this.scheduler.start()
                    this.startupLogger.logComponentComplete()
                }

                await this.app.listen({ port: this.port, host: this.hostname })
                this.startupLogger.logStartupSummary(this.port, this.hostname)

                // Log with the new logger
                this.logger.info('Application started successfully', {
                    port: this.port,
                    host: this.hostname,
                    environment: process.env.NODE_ENV,
                })

                for (const hook of this.afterStartHooks) {
                    await hook(this.app)
                }

                this.setupGracefulShutdown()
            } catch (err) {
                this.logger.error('Failed to start application', err as Error)
                process.exit(1)
            }
        }

        return {
            app: this.app,
            start,
            logger: this.logger,
            startupLogger: this.startupLogger,
            scheduler: this.scheduler,
        }
    }

    async start(): Promise<void> {
        const { start } = await this.build()
        await start()
    }

    private setupGracefulShutdown(): void {
        const shutdown = async (signal: string) => {
            this.logger.info(`Received ${signal}, shutting down gracefully...`)

            if (this.scheduler) {
                await this.scheduler.stop()
            }

            await this.app.close()
            this.logger.info('Shutdown complete')
            process.exit(0)
        }

        process.on('SIGTERM', () => shutdown('SIGTERM'))
        process.on('SIGINT', () => shutdown('SIGINT'))
    }
}

export function createBootify(): BootifyApp {
    return new BootifyApp()
}
