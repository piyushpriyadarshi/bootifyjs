import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { Router } from './router';
import { MiddlewareStack, Middleware } from './middleware';
import { errorHandler } from './errors';
import { LoggerService, StartupLoggerService } from '../logging';

export interface ApplicationConfig {
  controllers: any[];
  middlewares?: Middleware[];
  port?: number;
  hostname?: string;
}

export class Application {
  private server: Server;
  private router: Router;
  private globalMiddleware: MiddlewareStack;
  private config: ApplicationConfig;
  private logger?: LoggerService;
  private startupLogger?: StartupLoggerService;

  constructor(config: ApplicationConfig) {
    this.config = {
      port: 3000,
      hostname: 'localhost',
      ...config
    };

    // Initialize logging if available
    try {
      this.logger = LoggerService.getInstance();
      this.startupLogger = StartupLoggerService.getInstance(this.logger);
      this.startupLogger.logComponentStart('Application', {
        port: this.config.port,
        hostname: this.config.hostname,
        controllers: config.controllers.length,
        middlewares: config.middlewares?.length || 0
      });
    } catch (error) {
      // Logging not configured yet, continue without it
    }

    this.router = new Router();
    this.globalMiddleware = new MiddlewareStack();
    
    // Register global middlewares
    if (config.middlewares) {
      config.middlewares.forEach(middleware => {
        this.globalMiddleware.use(middleware);
      });
    }

    // Register controllers
    this.router.registerControllers(config.controllers);

    if (this.startupLogger) {
      this.startupLogger.logComponentComplete('Router', {
        routesRegistered: this.router.getRouteCount()
      });
    }

    // Create server
    this.server = createServer(this.handleRequest.bind(this));

    if (this.startupLogger) {
      this.startupLogger.logComponentComplete('HTTP Server');
    }
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      // Execute global middlewares
      await this.globalMiddleware.execute(req, res);
      
      // Handle route
      await this.router.handleRequest(req, res);
    } catch (error) {
      errorHandler(error, res);
    }
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.config.port, this.config.hostname, () => {
        if (this.logger && this.startupLogger) {
          this.startupLogger.logComponentComplete('Application');
          this.startupLogger.logStartupComplete();
        }
        console.log(`🚀 Server running at http://${this.config.hostname}:${this.config.port}`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        if (this.logger) {
          this.logger.info('Server stopped gracefully');
        }
        console.log('🛑 Server stopped');
        resolve();
      });
    });
  }

  getServer(): Server {
    return this.server;
  }
}