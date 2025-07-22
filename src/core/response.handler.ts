import { ServerResponse } from 'http'

/**
 * A universal response sender that works with Node.js, Express, and Fastify.
 * It inspects the response object to determine the correct methods to call.
 *
 * @param res The response object (from Node, Express, or Fastify).
 * @param statusCode The HTTP status code.
 * @param body The JSON body to send.
 */
export function sendResponse(res: any, statusCode: number, body: any): void {
  // Prevent sending response if headers are already sent
  if (res.headersSent || (res.raw && res.raw.headersSent) || res.sent) {
    return
  }

  const jsonBody = JSON.stringify(body)
  const headers = { 'Content-Type': 'application/json' }

  // Fastify: res is a 'FastifyReply' object. It has a .send() method.
  if (typeof res.send === 'function' && typeof res.code === 'function') {
    res.code(statusCode).headers(headers).send(jsonBody)
    return
  }

  // Express: res is an 'Express.Response' object. It has a .status() method.
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(statusCode).json(body)
    return
  }

  // Native Node.js: res is a 'ServerResponse' object.
  if (typeof res.writeHead === 'function' && typeof res.end === 'function') {
    res.writeHead(statusCode, headers)
    res.end(jsonBody)
    return
  }

  // Fallback or log an error if the response object is unknown
  console.error('Unknown response object type. Cannot send response.')
}
