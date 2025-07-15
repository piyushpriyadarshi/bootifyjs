import { LoggerService } from './logger.service';
import { StartupLogPayload } from '../types/logging.types';
import * as os from 'os';

export class StartupLoggerService {
  private static instance: StartupLoggerService;
  private logger: LoggerService;
  private startupStartTime: number;
  private componentTimings: Map<string, number> = new Map();

  private constructor(logger: LoggerService) {
    this.logger = logger;
    this.startupStartTime = Date.now();
  }

  static getInstance(logger: LoggerService): StartupLoggerService {
    if (!StartupLoggerService.instance) {
      StartupLoggerService.instance = new StartupLoggerService(logger);
    }
    return StartupLoggerService.instance;
  }

  logStartupBanner(): void {
    const banner = this.createStartupBanner();
    console.log(banner); // Always log banner to console
    
    this.logger.info('Application startup initiated', {
      component: 'Application',
      phase: 'starting',
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      platform: os.platform(),
      arch: os.arch(),
      memory: this.formatMemory(os.totalmem()),
      cpus: os.cpus().length
    });
  }

  logComponentStart(component: string, details?: Record<string, any>): void {
    this.componentTimings.set(component, Date.now());
    
    const payload: StartupLogPayload = {
      component,
      phase: 'starting',
      details
    };

    this.logger.debug(`Starting ${component}`, payload);
  }

  logComponentComplete(component: string, details?: Record<string, any>): void {
    const startTime = this.componentTimings.get(component);
    const duration = startTime ? Date.now() - startTime : undefined;
    
    const payload: StartupLogPayload = {
      component,
      phase: 'completed',
      duration,
      details
    };

    this.logger.info(`${component} initialized successfully`, payload);
    
    if (startTime) {
      this.componentTimings.delete(component);
    }
  }

  logComponentFailed(component: string, error: Error, details?: Record<string, any>): void {
    const startTime = this.componentTimings.get(component);
    const duration = startTime ? Date.now() - startTime : undefined;
    
    const payload: StartupLogPayload = {
      component,
      phase: 'failed',
      duration,
      details
    };

    this.logger.error(`${component} initialization failed`, error, payload);
    
    if (startTime) {
      this.componentTimings.delete(component);
    }
  }

  logStartupComplete(): void {
    const totalDuration = Date.now() - this.startupStartTime;
    
    this.logger.info('Application startup completed', {
      component: 'Application',
      phase: 'completed',
      duration: totalDuration,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    });

    // Log startup summary in development
    if (process.env.NODE_ENV === 'development') {
      this.logStartupSummary(totalDuration);
    }
  }

  private logStartupSummary(totalDuration: number): void {
    const summary = [
      '',
      '🚀 BootifyJS Application Started Successfully',
      '─'.repeat(50),
      `⏱️  Total startup time: ${totalDuration}ms`,
      `🔧 Environment: ${process.env.NODE_ENV || 'development'}`,
      `📦 Node.js: ${process.version}`,
      `💾 Memory usage: ${this.formatMemory(process.memoryUsage().heapUsed)} / ${this.formatMemory(process.memoryUsage().heapTotal)}`,
      `🌐 Server: http://localhost:${process.env.PORT || 3000}`,
      `📚 API Docs: http://localhost:${process.env.PORT || 3000}/api-docs`,
      '─'.repeat(50),
      ''
    ].join('\n');

    console.log(summary);
  }

  private createStartupBanner(): string {
    const version = process.env.SERVICE_VERSION || '1.0.0';
    const environment = process.env.NODE_ENV || 'development';
    
    return `
  ____              _   _  __       _ ____  
 |  _ \\            | | (_)/ _|     | / ___| 
 | |_) | ___   ___ | |_ _| |_ _   _| \\___ \\ 
 |  _ < / _ \\ / _ \\| __| |  _| | | | |___) |
 | |_) | (_) | (_) | |_| | | | |_| | |____/ 
 |____/ \\___/ \\___/ \\__|_|_|  \\__, |_|      
                              __/ |        
                             |___/         

 :: BootifyJS Framework ::        (v${version})
 :: Environment ::               (${environment})
 :: Node.js ::                   (${process.version})
 :: Platform ::                  (${os.platform()}-${os.arch()})
`;
  }

  private formatMemory(bytes: number): string {
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(2)} MB`;
  }
}