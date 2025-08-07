import { FastifyRequest, FastifyReply } from 'fastify'
import { Logger } from '../logging'

export const requestLoggerOnRequest = (
  req: FastifyRequest,
  reply: FastifyReply,
  done: Function
) => {
  req.log.info({ req }, `--> Inbound Request`)
  done()
}

export const requestLoggerOnResponse = (
  req: FastifyRequest,
  reply: FastifyReply,
  done: Function
) => {
  req.log.info(
    {
      url: req.raw.url,
      statusCode: reply.raw.statusCode,
      durationMs: reply.elapsedTime,
    },
    `<-- Outbound Response`
  )
  done()
}

export const createRequestLoggerOnResponse = (logger: Logger) => {
  return (req: FastifyRequest, reply: FastifyReply, done: Function) => {
    const payload = {
      requestId: req.id,
      method: req.method,
      url: req.url,
      //   requestBody: req.body,
      //   responseBody: reply.body, // might not be available in all cases
      statusCode: reply.statusCode,
      latencyMs: Number(reply.elapsedTime.toFixed(3)),
      timestamp: new Date().toISOString(),
      logType: 'access',
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
      //   headers: req.headers,
    }
    logger.access(payload)
    done()
  }
}
