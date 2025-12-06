import fastify, { FastifyInstance, FastifyReply, FastifyRequest, FastifyServerOptions } from 'fastify'
import { ZodObject } from 'zod'
import { AppConfig } from './config/AppConfig'
import { DEFAULT_SERVER_HOST, DEFAULT_SERVER_PORT } from './constants'
import { FastifyMiddleware } from './core/decorators'
import { Constructor, container } from './core/di-container'
import { registerControllers } from './core/router'
import { initializeStreamingLogging } from './logging'
import { Logger } from './logging/core/logger'
import { StreamingStartupLogger } from './logging/core/streaming-startup-logger'
import { SchedulerService } from './scheduling/scheduler.service'

export type PluginRegistrationFn = (app: FastifyInstance) => Promise<void> | void
export type ErrorHandlerFn = (error: Error, request: FastifyRequest, reply: FastifyReply) => Promise<void> | void
export type LifecycleHookFn = (app: FastifyInstance) => Promise<void> | void

export class BootifyApp {
    private app!: FastifyInstance
    private logger!: Logger
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


    async build(): Promise<{
        app: FastifyInstance
        start: () => Promise<void>
        logger: Logger
        startupLogger: StreamingStartupLogger
        scheduler?: SchedulerService
    }> {
        const { logger, startupLogger } = await initializeStreamingLogging()
        this.logger = logger
        this.startupLogger = startupLogger

        startupLogger.logStartupBanner()

        this.app = fastify(this.fastifyOptions)

        for (const plugin of this.plugins) {
            await plugin(this.app)
        }

        if (this.controllers.length > 0) {
            startupLogger.logPhaseStart('Registering Controllers')
            startupLogger.logComponentStart('Controllers', `${this.controllers.length} found`)
            registerControllers(this.app, this.controllers)
            startupLogger.logComponentComplete()
        }

        if (this.customErrorHandler) {
            this.app.setErrorHandler(this.customErrorHandler)
        }

        startupLogger.logStartupComplete()

        if (this.enableScheduler) {
            this.scheduler = container.resolve(SchedulerService)
        }

        const start = async () => {
            try {
                for (const hook of this.beforeStartHooks) {
                    await hook(this.app)
                }

                if (this.enableScheduler && this.scheduler) {
                    startupLogger.logComponentStart('Scheduler', 'Starting scheduled jobs')
                    await this.scheduler.start()
                    startupLogger.logComponentComplete()
                }

                await this.app.listen({ port: this.port, host: this.hostname })
                startupLogger.logStartupSummary(this.port, this.hostname)

                for (const hook of this.afterStartHooks) {
                    await hook(this.app)
                }

                this.setupGracefulShutdown()
            } catch (err) {
                this.app.log.error(err)
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
            console.log(`\n[BootifyApp] Received ${signal}, shutting down gracefully...`)

            if (this.scheduler) {
                await this.scheduler.stop()
            }

            await this.app.close()
            console.log('[BootifyApp] Shutdown complete')
            process.exit(0)
        }

        process.on('SIGTERM', () => shutdown('SIGTERM'))
        process.on('SIGINT', () => shutdown('SIGINT'))
    }
}

export function createBootify(): BootifyApp {
    return new BootifyApp()
}
