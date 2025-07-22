import {
  Controller,
  Get,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ValidateResponse,
} from '../core/decorators'
import { healthResponseSchema, pingResponseSchema } from '../schemas/user.schemas'
import { Router } from '../core/router'
import { container } from '../core/container'

@Controller('/health')
@ApiTags('Health', 'System Health')
export class HealthController {
  @Get('/routes')
  @ApiOperation({
    summary: 'Get registered routes',
    description: 'Get a list of all registered routes in the application',
    operationId: 'getRoutes',
  })
  getRoutes() {
    // Get router instance from container (if available) or create summary
    try {
      const router = container.resolve(Router)
      // return router.getRoutesSummary();
    } catch {
      return {
        message: 'Router information not available',
        timestamp: new Date().toISOString(),
      }
    }
  }

  @Get('/')
  @ApiOperation({
    summary: 'Health check',
    description: 'Get system health status and metrics',
    operationId: 'getHealth',
  })
  @ValidateResponse(healthResponseSchema)
  @ApiResponse(200, {
    description: 'System health information',
    schema: healthResponseSchema,
  })
  health() {
    return {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.version,
    }
  }

  @Get('/ping')
  @ApiOperation({
    summary: 'Ping endpoint',
    description: 'Simple ping endpoint for connectivity testing',
    operationId: 'ping',
  })
  @ValidateResponse(pingResponseSchema)
  @ApiResponse(200, {
    description: 'Pong response',
    schema: pingResponseSchema,
  })
  ping() {
    return { message: 'pong' }
  }
}
