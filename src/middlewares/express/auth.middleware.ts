// import { Middleware } from '../core/middleware'
// import { UnauthorizedError } from '../core/errors'

// export const authMiddleware: Middleware = async (req, res, next) => {
//   const authHeader = req.headers.authorization

//   if (!authHeader || !authHeader.startsWith('Bearer ')) {
//     throw new UnauthorizedError('Authorization header is required')
//   }a

//   const token = authHeader.substring(7) // Remove 'Bearer ' prefix

//   // Simple token validation (in real app, verify JWT)
//   if (token !== 'valid-token') {
//     throw new UnauthorizedError('Invalid token')
//   }

//   // Add user info to request (in real app, decode from JWT)
//   ;(req as any).user = { id: '1', email: 'john@example.com' }

//   await next()
// }
