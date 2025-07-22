import express, { Express, Request, Response, NextFunction } from 'express';
import { Server } from 'http';
import { ApplicationAdapter } from './application';
import { Middleware } from './middleware';

export class ExpressAdapter implements ApplicationAdapter {
  private app: Express;
  private server: Server | null = null;

  constructor() {
    this.app = express();
    this.app.use(express.json());
  }

  registerRoute(method: string, path: string, handler: Function): void {
    (this.app as any)[method.toLowerCase()](path, (req: Request, res: Response) => {
      handler(req, res);
    });
  }

  useMiddleware(middleware: Middleware): void {
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      middleware(req, res, next);
    });
  }

  startServer(port: number, hostname: string): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(port, hostname, () => {
        resolve();
      });
    });
  }

  stopServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        this.server.close((err) => {
          if (err) {
            return reject(err);
          }
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getServer(): any {
    return this.app;
  }
}