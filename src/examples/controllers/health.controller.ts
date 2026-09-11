import { FastifyReply, FastifyRequest } from 'fastify'
import { BaseLogger } from '../../logging'
import { Autowired } from '../../core/decorators'
import { Controller, Get } from '../../core/decorators'

@Controller('/health')
export class HealthController {
  @Autowired(BaseLogger)
  private logger!: BaseLogger

  @Get()
  check() {
    this.logger.info('Health check')
    return { status: 'ok', timestamp: new Date().toISOString() }
  }
}
