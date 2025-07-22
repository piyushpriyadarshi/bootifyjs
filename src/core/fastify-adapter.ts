import fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ApplicationAdapter } from './application';
import { Middleware } from './middleware';

export class FastifyAdapter implements ApplicationAdapter {
  private app: FastifyInstance;

  constructor() {
    this.app = fastify();
  }

  registerRoute(method: string, path: string, handler: Function): void {
    (this.app as any)[method.toLowerCase()](path, (req: FastifyRequest, reply: FastifyReply) => {
      handler(req, reply);
    });
  }

  useMiddleware(middleware: Middleware): void {
    this.app.addHook('onRequest', (req: any, res: any, next: any) => {
      middleware(req, res, next);
    });
  }

  async startServer(port: number, hostname: string): Promise<void> {
    await this.app.listen({ port, host: hostname });
  }

  async stopServer(): Promise<void> {
    await this.app.close();
  }

  getServer(): any {
    return this.app;
  }
}