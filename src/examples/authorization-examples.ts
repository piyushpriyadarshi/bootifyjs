/**
 * Authorization Examples using JWT Middleware
 * 
 * This file demonstrates different ways to implement authorization
 * using the built-in JWT middleware methods as alternatives to
 * the current authorize() middleware.
 */

import { FastifyInstance } from 'fastify';
import { AuthMiddleware } from '../auth/middleware/AuthMiddleware';
import { Controller, Post, Get, UseMiddleware, Body } from '../core/decorators';
import { z } from 'zod';

// Example 1: Using JWT Middleware Authorization Methods
// These are the built-in methods available in AuthMiddleware:

/**
 * 1. requireAuth() - Basic authentication with optional roles/permissions
 * 2. requireRoles() - Role-based authorization
 * 3. requirePermissions() - Permission-based authorization
 * 4. requireStrategy() - Strategy-specific authorization
 * 5. optionalAuth() - Optional authentication
 */

// Example Controller showing different authorization patterns
@Controller('/api/todos')
export class AuthorizedTodoController {
  constructor(private jwtAuthMiddleware: AuthMiddleware) {}

  // Method 1: Using requireRoles() - Similar to current authorize(['manager'])
  @Post('/create-with-roles')
  @UseMiddleware(/* Pass the middleware function here */)
  async createTodoWithRoles(@Body() body: any) {
    // Only users with 'manager' or 'admin' roles can access
    return { message: 'Todo created by authorized user' };
  }

  // Method 2: Using requirePermissions() - More granular control
  @Post('/create-with-permissions')
  @UseMiddleware(/* Pass the middleware function here */)
  async createTodoWithPermissions(@Body() body: any) {
    // Only users with 'todo:create' permission can access
    return { message: 'Todo created with permission check' };
  }

  // Method 3: Using requireAuth() with both roles and permissions
  @Post('/create-with-both')
  @UseMiddleware(/* Pass the middleware function here */)
  async createTodoWithBoth(@Body() body: any) {
    // Users need both manager role AND todo:create permission
    return { message: 'Todo created with comprehensive authorization' };
  }

  // Method 4: Using requireStrategy() - Strategy-specific authorization
  @Get('/admin-only')
  @UseMiddleware(/* Pass the middleware function here */)
  async adminOnlyEndpoint() {
    // Only JWT strategy with admin role
    return { message: 'Admin-only content' };
  }
}

// Example of how to use these in practice:
export function setupAuthorizationExamples(app: FastifyInstance, jwtAuthMiddleware: AuthMiddleware) {
  
  // 1. Role-based authorization (equivalent to current authorize(['manager']))
  app.post('/todos/create-role-based', {
    preHandler: jwtAuthMiddleware.requireRoles(['manager', 'admin'])
  }, async (request, reply) => {
    return { message: 'Todo created - role-based auth' };
  });

  // 2. Permission-based authorization (more granular)
  app.post('/todos/create-permission-based', {
    preHandler: jwtAuthMiddleware.requirePermissions(['todo:create', 'todo:write'])
  }, async (request, reply) => {
    return { message: 'Todo created - permission-based auth' };
  });

  // 3. Combined role and permission authorization
  app.post('/todos/create-combined', {
    preHandler: jwtAuthMiddleware.requireAuth(
      ['jwt'], // strategies
      ['manager', 'admin'], // required roles
      ['todo:create'] // required permissions
    )
  }, async (request, reply) => {
    return { message: 'Todo created - combined auth' };
  });

  // 4. Strategy-specific with roles
  app.post('/todos/create-jwt-only', {
    preHandler: jwtAuthMiddleware.requireStrategy('jwt', ['manager'])
  }, async (request, reply) => {
    return { message: 'Todo created - JWT strategy with manager role' };
  });

  // 5. Optional authentication (user info available if authenticated)
  app.get('/todos/public-with-optional-auth', {
    preHandler: jwtAuthMiddleware.optionalAuth(['jwt', 'api-key'])
  }, async (request, reply) => {
    const user = (request as any).user;
    if (user) {
      return { message: `Hello ${user.email}, here are your todos` };
    }
    return { message: 'Public todos (not authenticated)' };
  });
}

// How to modify your existing TodoController:
export const AuthorizedTodoControllerExample = `
// Instead of:
@UseMiddleware(authorize(['manager']))
async createTodo(@Body() body: z.infer<typeof todoSchema>) {
  // ...
}

// You can use:
@UseMiddleware(this.jwtAuthMiddleware.requireRoles(['manager']))
async createTodo(@Body() body: z.infer<typeof todoSchema>) {
  // ...
}

// Or for more granular control:
@UseMiddleware(this.jwtAuthMiddleware.requirePermissions(['todo:create']))
async createTodo(@Body() body: z.infer<typeof todoSchema>) {
  // ...
}

// Or combined:
@UseMiddleware(this.jwtAuthMiddleware.requireAuth(['jwt'], ['manager'], ['todo:create']))
async createTodo(@Body() body: z.infer<typeof todoSchema>) {
  // ...
}
`;

// Comparison of approaches:
export const AuthorizationComparison = {
  current: {
    method: 'authorize(["manager"])',
    description: 'Simple role-based check using custom middleware',
    pros: ['Simple to use', 'Clear syntax'],
    cons: ['Limited to roles only', 'Separate from auth system', 'No permission support']
  },
  jwtMiddleware: {
    method: 'jwtAuthMiddleware.requireRoles(["manager"])',
    description: 'Built-in JWT middleware authorization',
    pros: [
      'Integrated with authentication system',
      'Supports roles, permissions, and strategies',
      'Consistent with JWT auth flow',
      'More flexible and powerful'
    ],
    cons: ['Slightly more verbose', 'Requires middleware instance']
  }
};

// Best practices for authorization:
export const AuthorizationBestPractices = {
  roles: {
    description: 'Use for broad access control (admin, manager, user)',
    example: 'jwtAuthMiddleware.requireRoles(["admin", "manager"])'
  },
  permissions: {
    description: 'Use for specific action control (create, read, update, delete)',
    example: 'jwtAuthMiddleware.requirePermissions(["todo:create", "todo:update"])'
  },
  combined: {
    description: 'Use when you need both role and permission checks',
    example: 'jwtAuthMiddleware.requireAuth(["jwt"], ["manager"], ["todo:create"])'
  },
  strategy: {
    description: 'Use when different auth strategies have different access levels',
    example: 'jwtAuthMiddleware.requireStrategy("jwt", ["admin"])'
  }
};