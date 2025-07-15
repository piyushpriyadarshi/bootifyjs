import { Controller, Get, InjectConfig } from '../core/decorators';
import { AppConfig } from '../config/app.config';
import { ConfigDemoService } from '../services/config-demo.service';

@Controller('/config')
export class ConfigController {
  constructor(
    @InjectConfig(AppConfig) private config: AppConfig,
    private configDemoService: ConfigDemoService
  ) {}

  @Get('/info')
  getConfigInfo() {
    return this.config;
  }

  @Get('/server-url')
  getServerUrl() {
    return {
      url: this.configDemoService.getServerUrl(),
      message: 'Current server URL based on configuration'
    };
  }

  @Get('/demo')
  runConfigDemo() {
    this.configDemoService.demonstrateConfig();
    return {
      message: 'Configuration demo completed. Check the logs for details.',
      timestamp: new Date().toISOString()
    };
  }
}