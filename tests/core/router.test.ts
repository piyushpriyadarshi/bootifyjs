import { Router } from '../../src/core/router';
import { container } from '../../src/core/container';
import { IncomingMessage, ServerResponse } from 'http';
import { Readable } from 'stream';

// Mock controller classes
class TestController {
  getUsers() {
    return [{ id: '1', name: 'User 1' }];
  }

  getUserById(id: string) {
    return { id, name: 'Test User' };
  }

  getUsersWithLimit(users: string[], limit: number) {
    return { users, limit };
  }

  createUser(userData: any) {
    return { ...userData, id: '123' };
  }

  updateUser(id: string, userData: any) {
    return { ...userData, id, updated: true };
  }

  deleteUser(id: string) {
    return { id, deleted: true };
  }

  complexParams(userId: string, productId: string) {
    return { userId, productId };
  }
}

class AnotherController {
  getItems() {
    return [{ id: '1', name: 'Item 1' }];
  }
}

describe('Router', () => {
  let router: Router;
  let mockReq: IncomingMessage;
  let mockRes: ServerResponse;
  let endSpy: jest.SpyInstance;

  beforeEach(() => {
    // Setup router
    router = new Router();

    // Setup mock request and response
    mockReq = new Readable() as any;
    mockReq.headers = { 'content-type': 'application/json' };
    mockReq.url = '/';
    mockReq.method = 'GET';
    
    mockRes = {
      writeHead: jest.fn(),
      end: jest.fn(),
      headersSent: false,
      getHeader: jest.fn(),
      setHeader: jest.fn()
    } as any;

    endSpy = jest.spyOn(mockRes, 'end');

    // Reset container
    jest.spyOn(container, 'resolve').mockImplementation((constructor) => {
      if (constructor === TestController) {
        return new TestController();
      }
      if (constructor === AnotherController) {
        return new AnotherController();
      }
      return {};
    });
  });

  describe('Route Registration', () => {
    it('should register controllers and routes correctly', () => {
      // Define route metadata for TestController
      jest.spyOn(Reflect, 'getMetadata')
        .mockImplementation((key, target, property) => {
          if (key === 'controller:prefix' && target === TestController) return '/api';
          if (key === 'controller:prefix' && target === AnotherController) return '/items';
          
          if (target?.constructor?.name === 'TestController') {
            if (key === 'route:method' && property === 'getUsers') return 'GET';
            if (key === 'route:path' && property === 'getUsers') return '/users';
            if (key === 'route:method' && property === 'getUserById') return 'GET';
            if (key === 'route:path' && property === 'getUserById') return '/users/:id';
            if (key === 'route:method' && property === 'createUser') return 'POST';
            if (key === 'route:path' && property === 'createUser') return '/users';
            if (key === 'route:method' && property === 'updateUser') return 'PUT';
            if (key === 'route:path' && property === 'updateUser') return '/users/:id';
            if (key === 'route:method' && property === 'deleteUser') return 'DELETE';
            if (key === 'route:path' && property === 'deleteUser') return '/users/:id';
          }
          
          if (target?.constructor?.name === 'AnotherController') {
            if (key === 'route:method' && property === 'getItems') return 'GET';
            if (key === 'route:path' && property === 'getItems') return '/';
          }
          
          if (key === 'middlewares') return [];
          return undefined;
        });

      // Register controllers
      router.registerControllers([TestController, AnotherController]);

      // Verify routes were registered
      const routes = router.getRoutes();
      expect(routes.length).toBe(6);
      
      // Verify route details
      expect(routes[0].method).toBe('GET');
      expect(routes[0].path).toBe('/api/users');
      expect(routes[1].method).toBe('GET');
      expect(routes[1].path).toBe('/api/users/:id');
      expect(routes[2].method).toBe('POST');
      expect(routes[2].path).toBe('/api/users');
      expect(routes[3].method).toBe('PUT');
      expect(routes[3].path).toBe('/api/users/:id');
      expect(routes[4].method).toBe('DELETE');
      expect(routes[4].path).toBe('/api/users/:id');
      expect(routes[5].method).toBe('GET');
      expect(routes[5].path).toBe('/items');
    });
  });

  describe('Route Matching', () => {
    beforeEach(() => {
      // Define route metadata for TestController
      jest.spyOn(Reflect, 'getMetadata')
        .mockImplementation((key, target, property) => {
          if (key === 'controller:prefix') return '/api';
          
          if (key === 'route:method' && property === 'getUserById') return 'GET';
          if (key === 'route:path' && property === 'getUserById') return '/users/:id';
          
          if (key === 'route:method' && property === 'getUsersWithLimit') return 'GET';
          if (key === 'route:path' && property === 'getUsersWithLimit') return '/users';
          
          if (key === 'route:method' && property === 'createUser') return 'POST';
          if (key === 'route:path' && property === 'createUser') return '/users';
          
          if (key === 'route:method' && property === 'updateUser') return 'PUT';
          if (key === 'route:path' && property === 'updateUser') return '/users/:id';
          
          if (key === 'route:method' && property === 'deleteUser') return 'DELETE';
          if (key === 'route:path' && property === 'deleteUser') return '/users/:id';
          
          if (key === 'route:method' && property === 'complexParams') return 'GET';
          if (key === 'route:path' && property === 'complexParams') return '/users/:userId/products/:productId';
          
          if (key === 'middlewares') return [];
          
          if (key === 'param:0' && property === 'getUserById') return { type: 'param', name: 'id' };
          if (key === 'param:0' && property === 'getUsersWithLimit') return { type: 'query', name: 'users' };
          if (key === 'param:1' && property === 'getUsersWithLimit') return { type: 'query', name: 'limit' };
          if (key === 'param:0' && property === 'createUser') return { type: 'body' };
          if (key === 'param:0' && property === 'updateUser') return { type: 'param', name: 'id' };
          if (key === 'param:1' && property === 'updateUser') return { type: 'body' };
          if (key === 'param:0' && property === 'deleteUser') return { type: 'param', name: 'id' };
          if (key === 'param:0' && property === 'complexParams') return { type: 'param', name: 'userId' };
          if (key === 'param:1' && property === 'complexParams') return { type: 'param', name: 'productId' };
          
          return undefined;
        });

      // Register controller
      router.registerControllers([TestController]);
    });

    it('should match routes with parameters', async () => {
      // Setup request
      mockReq.url = '/api/users/123';
      mockReq.method = 'GET';

      // Handle request
      await router.handleRequest(mockReq, mockRes);

      // Verify response
      expect(endSpy).toHaveBeenCalledWith(JSON.stringify({ id: '123', name: 'Test User' }));
    });

    it('should match routes with query parameters', async () => {
      // Setup request with query parameters
      mockReq.url = '/api/users?users=user1,user2&limit=10';
      mockReq.method = 'GET';

      // Mock parseQuery to return parsed query params
      jest.mock('../../src/core/utils', () => ({
        parseQuery: () => ({ users: 'user1,user2', limit: '10' }),
        parseBody: jest.requireActual('../../src/core/utils').parseBody,
        matchRoute: jest.requireActual('../../src/core/utils').matchRoute
      }));

      // Handle request
      await router.handleRequest(mockReq, mockRes);

      // Verify response
      expect(endSpy).toHaveBeenCalledWith(JSON.stringify({ users: ['user1', 'user2'], limit: 10 }));
    });

    it('should handle POST requests with body', async () => {
      // Setup request
      mockReq.url = '/api/users';
      mockReq.method = 'POST';
      
      // Simulate request with body
      const body = JSON.stringify({ name: 'New User', email: 'user@example.com' });
      (mockReq as any)._read = () => {};
      process.nextTick(() => {
        mockReq.emit('data', Buffer.from(body));
        mockReq.emit('end');
      });

      // Handle request
      await router.handleRequest(mockReq, mockRes);

      // Verify response
      expect(endSpy).toHaveBeenCalledWith(JSON.stringify({ name: 'New User', email: 'user@example.com', id: '123' }));
    });

    it('should handle PUT requests with parameters and body', async () => {
      // Setup request
      mockReq.url = '/api/users/456';
      mockReq.method = 'PUT';
      
      // Simulate request with body
      const body = JSON.stringify({ name: 'Updated User' });
      (mockReq as any)._read = () => {};
      process.nextTick(() => {
        mockReq.emit('data', Buffer.from(body));
        mockReq.emit('end');
      });

      // Handle request
      await router.handleRequest(mockReq, mockRes);

      // Verify response
      expect(endSpy).toHaveBeenCalledWith(JSON.stringify({ id: '456', name: 'Updated User', updated: true }));
    });

    it('should handle DELETE requests with parameters', async () => {
      // Setup request
      mockReq.url = '/api/users/789';
      mockReq.method = 'DELETE';

      // Handle request
      await router.handleRequest(mockReq, mockRes);

      // Verify response
      expect(endSpy).toHaveBeenCalledWith(JSON.stringify({ id: '789', deleted: true }));
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      // Define route metadata for TestController
      jest.spyOn(Reflect, 'getMetadata')
        .mockImplementation((key, target, property) => {
          if (key === 'controller:prefix') return '/api';
          
          if (key === 'route:method' && property === 'complexParams') return 'GET';
          if (key === 'route:path' && property === 'complexParams') return '/users/:userId/products/:productId';
          
          if (key === 'middlewares') return [];
          
          if (key === 'param:0' && property === 'complexParams') return { type: 'param', name: 'userId' };
          if (key === 'param:1' && property === 'complexParams') return { type: 'param', name: 'productId' };
          
          return undefined;
        });

      // Register controller
      router.registerControllers([TestController]);
    });

    it('should handle routes with multiple parameters', async () => {
      // Setup request
      mockReq.url = '/api/users/123/products/456';
      mockReq.method = 'GET';

      // Handle request
      await router.handleRequest(mockReq, mockRes);

      // Verify response
      expect(endSpy).toHaveBeenCalledWith(JSON.stringify({ userId: '123', productId: '456' }));
    });

    it('should return 404 for non-existent routes', async () => {
      // Setup request
      mockReq.url = '/api/non-existent';
      mockReq.method = 'GET';

      // Handle request
      await router.handleRequest(mockReq, mockRes);

      // Verify response
      expect(mockRes.writeHead).toHaveBeenCalledWith(404, { 'Content-Type': 'application/json' });
      expect(endSpy).toHaveBeenCalledWith(JSON.stringify({ error: 'Not Found', status: 404 }));
    });
  });
});