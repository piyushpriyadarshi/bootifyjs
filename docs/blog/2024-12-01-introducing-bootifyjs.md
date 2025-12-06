---
slug: introducing-bootifyjs
title: Introducing BootifyJS - A Modern Node.js Framework
authors: [piyush]
tags: [announcement, release]
image: /img/blog/introducing-bootifyjs.png
---

We're excited to announce **BootifyJS**, a modern, declarative Node.js framework built on top of Fastify. BootifyJS brings the best of enterprise frameworks to the Node.js ecosystem with powerful dependency injection, decorator-driven development, and event-driven architecture.

<!-- truncate -->

## Why BootifyJS?

Building enterprise-grade Node.js applications often means choosing between raw performance and developer experience. With BootifyJS, you don't have to compromise.

### The Problem

Traditional Node.js frameworks either:

- Offer great performance but require verbose, boilerplate-heavy code
- Provide excellent DX with decorators but sacrifice performance
- Lack proper dependency injection, making testing difficult

### Our Solution

BootifyJS combines:

- **Fastify's blazing performance** - One of the fastest web frameworks for Node.js
- **Decorator-driven development** - Clean, self-documenting code
- **Full-featured DI container** - Constructor injection, interface binding, scopes
- **Event-driven architecture** - Async event bus with retries and dead-letter queue

## Quick Example

Here's how simple it is to create a REST API with BootifyJS:

```typescript
import { Controller, Get, Post, Body, Injectable } from "bootifyjs";

@Injectable()
class UserService {
  private users = [{ id: 1, name: "John" }];

  findAll() {
    return this.users;
  }

  create(data: { name: string }) {
    const user = { id: this.users.length + 1, ...data };
    this.users.push(user);
    return user;
  }
}

@Controller("/api/users")
class UserController {
  constructor(private userService: UserService) {}

  @Get("/")
  getUsers() {
    return this.userService.findAll();
  }

  @Post("/")
  createUser(@Body() data: { name: string }) {
    return this.userService.create(data);
  }
}
```

## Key Features

### 🚀 Built on Fastify

Leverage the incredible performance of Fastify with full access to its rich plugin ecosystem.

### 💉 Powerful Dependency Injection

Full-featured DI container with constructor and property injection, interface binding, scopes, and eager loading.

### 🎯 Decorator-Driven Development

Write clean, self-documenting code with decorators for controllers, services, routing, and more.

### 📡 Event-Driven Architecture

Built-in async event bus with automatic retries, dead-letter queue, and high-performance buffered processing.

### ⚙️ Type-Safe Configuration

Schema-driven configuration with Zod validation at startup. Catch errors early with fully typed config objects.

### 🗄️ Pluggable Caching

Decorator-driven caching with in-memory store out-of-the-box. Easily extend to Redis or other backends.

## Getting Started

Install BootifyJS and start building:

```bash
npm install bootifyjs
```

Create your first application:

```typescript
import { BootifyApp } from "bootifyjs";

const app = new BootifyApp();
await app.start();
```

Check out our [documentation](/docs/intro) for comprehensive guides and API reference.

## What's Next?

We're actively working on:

- GraphQL integration
- WebSocket support
- CLI tooling for scaffolding
- More caching backends (Redis, Memcached)

## Join the Community

We'd love to hear from you! Star us on [GitHub](https://github.com/bootifyjs/bootifyjs), report issues, or contribute to the project.

Happy coding! 🎉
