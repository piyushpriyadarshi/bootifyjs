import pino from 'pino'
import { LOGGER_TOKEN } from './logger.provider'
import { Autowired, Service } from '../../core'

@Service()
export class Logger {
  @Autowired(LOGGER_TOKEN)
  private readonly logger!: pino.Logger

  public info(message: string, context?: object) {
    this.logger.info({ ...context, logType: 'application' }, message)
  }

  public error(message: string, error?: Error, context?: object) {
    this.logger.error({ ...context, err: error, logType: 'application' }, message)
  }

  public warn(message: string, context?: object) {
    this.logger.warn({ ...context, logType: 'application' }, message)
  }

  public debug(message: string, context?: object) {
    this.logger.debug({ ...context, logType: 'application' }, message)
  }

  // You can add your specialized methods like audit(), performance(), etc. here
  public audit(payload: object) {
    this.logger.info({ ...payload, logType: 'audit' }, 'Audit Log')
  }

  public child(bindings: object): pino.Logger {
    return this.logger.child(bindings)
  }
  public access(payload: object) {
    this.logger.info({ ...payload, logType: 'access' }, 'Access Log')
  }
}
