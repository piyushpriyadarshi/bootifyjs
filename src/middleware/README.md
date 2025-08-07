# Middleware Module

The Middleware module provides a collection of ready-to-use middleware for Fastify applications built with the Bootify framework.

## Features

- **Authentication**: API key and token-based authentication
- **Request Context**: Store and retrieve request-scoped data
- **Request Logging**: Automatic logging of requests and responses

## Usage

### Authentication Middleware

```typescript
import { authMiddleware } from 'bootify/middleware';
import { createBootifyApp } from 'bootify';

async function main() {
  const { app } = await createBootifyApp({
    controllers: [UserController, ProductController],
    // other options...
  });
  
  // Apply auth middleware globally
  app.addHook('onRequest', authMiddleware);
  
  // Or apply to specific routes
  app.register((instance, opts, done) => {
    instance.addHook('onRequest', authMiddleware);
    
    // Protected routes go here
    instance.get('/admin/dashboard', dashboardHandler);
    
    done();
  }, { prefix: '/admin' });
}
```

### Custom Authentication Logic

```typescript
import { FastifyRequest, FastifyReply } from 'fastify';

export const jwtAuthMiddleware = async (request: FastifyRequest, reply: FastifyReply) => {
  const token = request.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    reply.code(401).send({ error: 'Authentication required' });
    return;
  }
  
  try {
    // Verify JWT token (using your preferred JWT library)
    const decoded = verifyToken(token);
    
    // Attach user to request for later use
    (request as any).user = decoded;
  } catch (error) {
    reply.code(401).send({ error: 'Invalid token' });
  }
};
```

### Request Context Middleware

The context middleware is automatically applied by the framework and allows you to store and retrieve data within the scope of a request:

```typescript
import { requestContextStore } from 'bootify/core';
import { Controller, Get } from 'bootify/core';

@Controller('/api')
export class ApiController {
  @Get('/data')
  getData(request: FastifyRequest) {
    // Access the request context store
    const store = requestContextStore.getStore();
    
    // Get values from the store
    const userId = store.get('userId');
    
    // Set values in the store
    store.set('action', 'getData');
    
    return { userId, data: 'example' };
  }
}
```

### Request Logging Middleware

The request logging middleware is automatically applied by the framework and logs the start and end of each request:

```typescript
// This is automatically applied, but you can customize it
import { requestLoggerOnRequest, requestLoggerOnResponse } from 'bootify/middleware';

app.addHook('onRequest', requestLoggerOnRequest);
app.addHook('onResponse', requestLoggerOnResponse);
```

Example log output: