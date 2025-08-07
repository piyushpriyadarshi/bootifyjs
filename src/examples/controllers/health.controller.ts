import { Controller, Get } from '../../core/decorators'

@Controller('/api')
export class HealthController {
  @Get('/health')
  getHealth() {
    return { status: 'ok', timestamp: new Date().toISOString() }
  }
}
