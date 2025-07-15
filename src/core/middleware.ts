import { IncomingMessage, ServerResponse } from 'http';

export type NextFunction = () => Promise<void> | void;

export type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: NextFunction
) => Promise<void> | void;

export class MiddlewareStack {
  private middlewares: Middleware[] = [];

  use(middleware: Middleware): void {
    this.middlewares.push(middleware);
  }

  async execute(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let index = 0;
    
    const next = async (): Promise<void> => {
      if (index < this.middlewares.length) {
        const middleware = this.middlewares[index++];
        await middleware(req, res, next);
      }
    };

    await next();
  }
}