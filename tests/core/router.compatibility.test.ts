import { Router } from '../../src/core/router';
import { container } from '../../src/core/container';
import { IncomingMessage, ServerResponse } from 'http';
import { Readable } from 'stream';

// Mock controller class
class TestController {
  legacyBodyParse(body: any) {
    return body;
  }

  legacyBodyParseWithId(body: any) {
    return { ...body, id: '123' };
  }

  legacyBodyParseWithName(body: any) {
    return { ...body, name: 'Test' };
  }
}

describe('Router Backward Compatibility', () => {
  let router: Router;
  let mockController: TestController;
  let mockReq: IncomingMessage;
  let mockRes: ServerResponse;
  let endSpy: jest.SpyInstance;

  beforeEach(() => {
    // Setup router
    router = new Router();
    mockController = new TestController();

    // Setup mock request and response
    mockReq = new Readable() as any;
    mockReq.headers = { 'content-type': 'application/json' };
    mockReq.url = '/test';
    mockReq.method = 'POST';
    
    mockRes = {
      writeHead: jest.fn(),
      end: jest.fn(),
      headersSent: false,
      getHeader: jest.fn(),
      setHeader: jest.fn()
    } as any;

    endSpy = jest.spyOn(mockRes, 'end');

    // Reset container
    jest.spyOn(container, 'resolve').mockReturnValue(mockController);
  });

  describe('Legacy API Support', () => {
    it('should support legacy body parsing', async () => {
      // Define route metadata
      jest.spyOn(Reflect, 'getMetadata')
        .mockImplementation((key, target, property) => {
          if (key === 'route:method' && property === 'legacyBodyParse') return 'POST';
          if (key === 'route:path' && property === 'legacyBodyParse') return '/test';
          if (key === 'controller:prefix') return '';
          if (key === 'middlewares') return [];
          if (key.startsWith('param:')) return { type: 'body' };
          return undefined;
        });

      // Register controller
      router['registerController'](TestController);

      // Simulate request with body
      const body = JSON.stringify({ version: 'v1.0.0' });
      (mockReq as any)._read = () => {};
      process.nextTick(() => {
        mockReq.emit('data', Buffer.from(body));
        mockReq.emit('end');
      });

      // Handle request
      await router.handleRequest(mockReq, mockRes);

      // Verify response
      expect(endSpy).toHaveBeenCalledWith(JSON.stringify({ version: 'v1.0.0' }));
    });

    it('should support legacy body parsing with id parameter', async () => {
      // Define route metadata
      jest.spyOn(Reflect, 'getMetadata')
        .mockImplementation((key, target, property) => {
          if (key === 'route:method' && property === 'legacyBodyParseWithId') return 'POST';
          if (key === 'route:path' && property === 'legacyBodyParseWithId') return '/test/:id';
          if (key === 'controller:prefix') return '';
          if (key === 'middlewares') return [];
          if (key === 'param:0') return { type: 'body' };
          return undefined;
        });

      // Register controller
      router['registerController'](TestController);

      // Simulate request with body and params
      const body = JSON.stringify({ version: 'v1.0.0' });
      mockReq.url = '/test/123';
      (mockReq as any)._read = () => {};
      process.nextTick(() => {
        mockReq.emit('data', Buffer.from(body));
        mockReq.emit('end');
      });

      // Handle request
      await router.handleRequest(mockReq, mockRes);

      // Verify response includes both body and id parameter
      expect(endSpy).toHaveBeenCalledWith(JSON.stringify({ version: 'v1.0.0', id: '123' }));
    });

    it('should support legacy body parsing with additional properties', async () => {
      // Define route metadata
      jest.spyOn(Reflect, 'getMetadata')
        .mockImplementation((key, target, property) => {
          if (key === 'route:method' && property === 'legacyBodyParseWithName') return 'POST';
          if (key === 'route:path' && property === 'legacyBodyParseWithName') return '/test';
          if (key === 'controller:prefix') return '';
          if (key === 'middlewares') return [];
          if (key === 'param:0') return { type: 'body' };
          return undefined;
        });

      // Register controller
      router['registerController'](TestController);

      // Simulate request with body
      const body = JSON.stringify({ version: 'v1.0.0', created: true });
      mockReq.url = '/test';
      (mockReq as any)._read = () => {};
      process.nextTick(() => {
        mockReq.emit('data', Buffer.from(body));
        mockReq.emit('end');
      });

      // Handle request
      await router.handleRequest(mockReq, mockRes);

      // Verify response includes both original body and additional property
      expect(endSpy).toHaveBeenCalledWith(JSON.stringify({ version: 'v1.0.0', created: true, name: 'Test' }));
    });
  });
});