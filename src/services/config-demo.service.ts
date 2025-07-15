import { Service, InjectConfig } from '../core/decorators';
import { Logger, LoggerService } from '../logging';
import { AppConfig } from '../config/app.config';

@Service()
@Logger('ConfigDemoService')
export class ConfigDemoService {
  private logger!: LoggerService;

  constructor(@InjectConfig(AppConfig) private config: AppConfig) {}

  demonstrateConfig(): void {
    this.logger.info('=== Configuration Demo ===');
    
    // Service Configuration
    this.logger.info('Service Configuration:', {
      serviceName: this.config.SERVICE_NAME
    });
    
    // Server Configuration
    this.logger.info('Server Configuration:', {
      port: this.config.server.port,
      host: this.config.server.host,
      name: this.config.server.name
    });
    
    // Database Configuration
    this.logger.info('Database Configuration:', {
      host: this.config.database.host,
      port: this.config.database.port,
      name: this.config.database.name,
      username: this.config.database.username,
      // Don't log password for security
      hasPassword: !!this.config.database.password
    });
    
    // Logging Configuration
    this.logger.info('Logging Configuration:', {
      level: this.config.logging.level,
      enabled: this.config.logging.enabled
    });
    
    // API Configuration
    this.logger.info('API Configuration:', {
      version: this.config.api.version
    });
    
    // CORS Configuration
    this.logger.info('CORS Configuration:', {
      enabled: this.config.cors.enabled
    });
    
    // JWT Configuration
    this.logger.info('JWT Configuration:', {
      expiresIn: this.config.jwt.expiresIn,
      hasSecret: !!this.config.jwt.secret
    });
    
    this.logger.info('=== End Configuration Demo ===');
  }

  getServerUrl(): string {
    return `http://${this.config.server.host}:${this.config.server.port}`;
  }

  getDatabaseConnectionString(): string {
    return `postgresql://${this.config.database.username}:${this.config.database.password}@${this.config.database.host}:${this.config.database.port}/${this.config.database.name}`;
  }

  isFeatureEnabled(feature: string): boolean {
    switch (feature) {
      case 'cors':
        return this.config.cors.enabled;
      case 'logging':
        return this.config.logging.enabled;
      default:
        return false;
    }
  }
}