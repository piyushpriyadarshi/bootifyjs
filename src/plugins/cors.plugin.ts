// src/plugins/cors.plugin.ts

import { IPlugin } from '../core/plugin'
import { Application } from '../core/application'

export class CorsPlugin implements IPlugin {
  name = 'bootjs-cors'
  version = '0.1.0'

  install(app: Application): void {
    const corsMiddleware = (req: any, res: any, next: () => void) => {
      // res.setHeader('Access-Control-Allow-Origin', '*');
      // res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      // res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      // if (req.method === 'OPTIONS') {
      //   res.statusCode = 204;
      //   res.end();
      //   return;
      // }
      next()
    }

    app.useMiddleware(corsMiddleware)
  }
}
