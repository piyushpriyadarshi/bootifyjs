import { createServer, IncomingMessage, ServerResponse, Server } from 'http'
import { Router } from './router'
import { MiddlewareStack, Middleware } from './middleware'
import { errorHandler } from './errors'
import { LoggerService, StartupLoggerService } from '../logging'
import { PluginManager } from './plugin-manager'
import { IPlugin } from './plugin'

export interface ApplicationConfig {
  controllers: any[]
  middlewares?: Middleware[]
  port?: number
  hostname?: string
}

export interface ApplicationAdapter {
  registerRoute(method: string, path: string, handler: Function): void
  useMiddleware(middleware: Middleware): void
  startServer(port: number, hostname: string): Promise<void>
  stopServer(): Promise<void>
  getServer(): any
}

export class NodeHttpAdapter implements ApplicationAdapter {
  private server: Server
  private middlewareStack: MiddlewareStack
  private router: Router

  constructor(router: Router) {
    this.router = router
    this.middlewareStack = new MiddlewareStack()
    this.server = createServer(this.handleRequest.bind(this))
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      await this.middlewareStack.execute(req, res)
      if (!res.writableEnded) {
        await this.router.handleRequest(req, res)
      }
    } catch (error) {
      errorHandler(error, res)
    }
  }

  registerRoute(method: string, path: string, handler: Function): void {
    // With the Node adapter, the router handles this directly.
    // The registration on the adapter is for frameworks like Express.
  }

  useMiddleware(middleware: Middleware): void {
    this.middlewareStack.use(middleware)
  }

  startServer(port: number, hostname: string): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(port, hostname, () => resolve())
    })
  }

  stopServer(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => resolve())
    })
  }

  getServer(): any {
    return this.server
  }
}

export class Application {
  public router: Router
  private config: ApplicationConfig
  private logger?: LoggerService
  private startupLogger?: StartupLoggerService
  private adapter: ApplicationAdapter
  private readonly pluginManager: PluginManager;

  constructor(config: ApplicationConfig, adapter?: ApplicationAdapter) {
    this.config = {
      port: 3000,
      hostname: 'localhost',
      ...config,
    }

    this.router = new Router()
    this.adapter = adapter || new NodeHttpAdapter(this.router)
    this.pluginManager = new PluginManager(this);

    // Initialize logging if available
    try {
      this.logger = LoggerService.getInstance()
      this.startupLogger = StartupLoggerService.getInstance(this.logger)
      this.startupLogger.logComponentStart('Application', {
        port: this.config.port,
        hostname: this.config.hostname,
        controllers: config.controllers.length,
        middlewares: config.middlewares?.length || 0,
      })
    } catch (error) {
      // Logging not configured yet, continue without it
    }

    // Register global middlewares
    if (config.middlewares) {
      config.middlewares.forEach((middleware) => {
        this.adapter.useMiddleware(middleware)
      })
    }

    // Register controllers and wire them up with the adapter
    this.router.registerControllers(config.controllers)
    this.router.registerWithAdapter(this.adapter)

    if (this.startupLogger) {
      this.startupLogger.logComponentComplete('Router', {
        routesRegistered: this.router.getRouteCount(),
      })
    }

    // Server creation and request handling are now managed by the adapter.
    if (this.startupLogger) {
      this.startupLogger.logComponentComplete('HTTP Adapter')
    }
  }

  public async use(plugin: IPlugin): Promise<this> {
    await this.pluginManager.register(plugin);
    return this;
  }

  public useMiddleware(middleware: Middleware): void {
    this.adapter.useMiddleware(middleware);
  }

  async start(): Promise<void> {
    await this.pluginManager.runHook('onInit');
    await this.adapter.startServer(this.config.port!, this.config.hostname!)
    await this.pluginManager.runHook('onReady');
    if (this.logger && this.startupLogger) {
      this.startupLogger.logComponentComplete('Application')
      this.startupLogger.logStartupComplete()
    }
    console.log(`🚀 Server running at http://${this.config.hostname}:${this.config.port}`)
  }

  async stop(): Promise<void> {
    await this.pluginManager.runHook('onShutdown');
    await this.adapter.stopServer();
    if (this.logger) {
      this.logger.info('Server stopped gracefully')
    }
    console.log('🛑 Server stopped')
  }

  getServer(): any {
    return this.adapter.getServer()
  }
}
