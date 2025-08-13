import { Autowired, Controller, Get } from '../../core/decorators'
import { Logger } from '../../logging'

@Controller('/api')
export class HealthController {
  @Autowired(Logger)
  private logger!: Logger

  @Get('/health')
  getHealth() {
    this.logger.info('Health check')
    return { status: 'ok', timestamp: new Date().toISOString() }
  }
}
