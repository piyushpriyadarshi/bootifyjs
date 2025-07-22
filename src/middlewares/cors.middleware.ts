import { Middleware } from '../core/middleware'

export const corsMiddleware: Middleware = async (req, res, next) => {
  // res.setHeader('Access-Control-Allow-Origin', '*');
  // res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  // res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // if (req.method === 'OPTIONS') {
  //   res.writeHead(200);
  //   res.end();
  //   return;
  // }

  await next()
}
