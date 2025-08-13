import { Controller, Get } from 'bootifyjs/core';

@Controller('/health')
export class HealthController {
  @Get('/')
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  @Get('/ping')
  ping() {
    return 'pong';
  }
}
