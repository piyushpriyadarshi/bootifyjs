import { ServerResponse } from 'http'
import { Response as ExpressResponse } from 'express'
import { FastifyReply } from 'fastify'

export class ResponseAdapter {
  private res: ServerResponse | ExpressResponse | FastifyReply

  constructor(res: ServerResponse | ExpressResponse | FastifyReply) {
    this.res = res
  }

  setHeader(name: string, value: string): void {
    console.log('header' in this.res)
    console.log(this.res)
    if ('setHeader' in this.res) {
      // For Node.js http.ServerResponse and Express
      this.res.setHeader(name, value)
    } else if ('header' in this.res) {
      // For Fastify
      ;(this.res as FastifyReply).header(name, value)
    }
  }

  status(statusCode: number): this {
    if ('status' in this.res) {
      // For Express and Fastify
      this.res.status(statusCode);
    } else if ('statusCode' in this.res) {
      // For Node.js http.ServerResponse
      this.res.statusCode = statusCode;
    }
    return this;
  }

  send(body: any): void {
    if ('send' in this.res) {
      // For Express and Fastify
      this.res.send(body);
    } else {
      // For Node.js http.ServerResponse
      this.res.end(body);
    }
  }

  json(body: any): void {
    this.setHeader('Content-Type', 'application/json');
    this.send(JSON.stringify(body));
  }
}
