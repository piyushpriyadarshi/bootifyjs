import { Router } from '../../src/core/router';
import { Controller, Get, Post, Put, Delete } from '../../src/core/decorators';
import { IncomingMessage, ServerResponse } from 'http';

// Create a large number of controllers for benchmarking
function createTestControllers(count: number) {
  const controllers = [];
  
  for (let i = 0; i < count; i++) {
    @Controller(`/test-${i}`)
    class TestController {
      @Get('/') get() { return { i }; }
      @Get('/:id') getById() { return { i }; }
      @Post('/') post() { return { i }; }
      @Put('/:id') put() { return { i }; }
      @Delete('/:id') delete() { return { i }; }
    }
    
    controllers.push(TestController);
  }
  
  return controllers;
}

// Create mock request and response
function createMockReq(method: string, url: string): IncomingMessage {
  return {
    method,
    url,
    headers: {},
    on: (event: string, handler: any) => {
      if (event === 'end') {
        handler();
      }
      return { on: () => {} };
    }
  } as unknown as IncomingMessage;
}

function createMockRes(): ServerResponse {
  return {
    writeHead: () => {},
    end: () => {},
    getHeader: () => {},
    setHeader: () => {},
    headersSent: false
  } as unknown as ServerResponse;
}

// Benchmark registration performance
async function benchmarkRegistration() {
  console.log('Benchmarking router registration performance...');
  
  const controllerCounts = [10, 50, 100, 500];
  
  for (const count of controllerCounts) {
    const controllers = createTestControllers(count);
    const totalRoutes = count * 5; // 5 routes per controller
    
    const startTime = performance.now();
    const router = new Router();
    router.registerControllers(controllers);
    const endTime = performance.now();
    
    const duration = endTime - startTime;
    console.log(`Registering ${count} controllers (${totalRoutes} routes): ${duration.toFixed(2)}ms`);
  }
}

// Benchmark route matching performance
async function benchmarkRouteMatching() {
  console.log('\nBenchmarking route matching performance...');
  
  // Create a router with a moderate number of routes
  const router = new Router();
  router.registerControllers(createTestControllers(100)); // 500 routes
  
  const scenarios = [
    { name: 'Exact match (first route)', req: createMockReq('GET', '/test-0') },
    { name: 'Exact match (middle route)', req: createMockReq('GET', '/test-50') },
    { name: 'Exact match (last route)', req: createMockReq('GET', '/test-99') },
    { name: 'With parameter', req: createMockReq('GET', '/test-50/123') },
    { name: 'Non-existent route', req: createMockReq('GET', '/non-existent') }
  ];
  
  for (const scenario of scenarios) {
    const res = createMockRes();
    const iterations = 1000;
    
    const startTime = performance.now();
    for (let i = 0; i < iterations; i++) {
      await router.handleRequest(scenario.req, res);
    }
    const endTime = performance.now();
    
    const duration = endTime - startTime;
    const avgTime = duration / iterations;
    console.log(`${scenario.name}: ${avgTime.toFixed(3)}ms per request (${iterations} iterations)`);
  }
}

// Run the benchmarks
async function runBenchmarks() {
  console.log('=== Router Performance Benchmarks ===\n');
  
  await benchmarkRegistration();
  await benchmarkRouteMatching();
  
  console.log('\n=== Benchmark Complete ===');
}

// Run if this file is executed directly
if (require.main === module) {
  runBenchmarks().catch(console.error);
}

export { runBenchmarks };