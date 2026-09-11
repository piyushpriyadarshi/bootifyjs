import { bootstrapEventSystem } from '../../events/bootstrap';
import { defaultBufferedEventConfig } from '../../events/config/buffered-event-config';
import { runBufferedEventExample } from './buffered-event-example';

/**
 * Integration test demonstrating buffered event processing
 */
export async function runIntegrationTest() {
  console.log('🧪 Starting Buffered Event Processing Integration Test\n');
  
  try {
    // Bootstrap the event system with buffered processing enabled
    console.log('🔧 Bootstrapping event system with buffered processing...');
    
    const eventSystem = await bootstrapEventSystem([], {
      useBufferedProcessing: true,
      bufferedEventConfig: {
        ...defaultBufferedEventConfig,
        enabled: true,
        workerCount: 2, // Use fewer workers for testing
        maxQueueSize: 1000,
        maxMemoryMB: 10,
        monitoring: {
          ...defaultBufferedEventConfig.monitoring,
          enabled: true,
          metricsInterval: 2000 // Check metrics every 2 seconds
        }
      }
    });
    
    console.log('✅ Event system bootstrapped successfully');
    console.log(`📊 Regular EventBus: ${eventSystem.eventBus ? 'Available' : 'Not Available'}`);
    console.log(`🔄 Buffered EventBus: ${eventSystem.bufferedEventBus ? 'Available' : 'Not Available'}`);
    
    // Wait a moment for workers to initialize
    console.log('⏳ Waiting for worker threads to initialize...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Run the example
    await runBufferedEventExample();
    
    // Show final metrics if buffered processing is available
    if (eventSystem.bufferedEventBus) {
      console.log('\n📈 Final System Metrics:');
      
      const metrics = eventSystem.bufferedEventBus.getMetrics();
      console.log('Queue Metrics:', {
        size: metrics.queueMetrics.size,
        utilization: `${(metrics.queueMetrics.utilization * 100).toFixed(1)}%`,
        totalProcessed: metrics.queueMetrics.totalProcessed
      });
      
      const health = await eventSystem.bufferedEventBus.getHealthStatus();
      console.log('Health Status:', {
        status: health.status,
        activeWorkers: health.activeWorkers,
        queueDepth: health.queueDepth
      });
      
      const workerStats = eventSystem.bufferedEventBus.getWorkerStatistics();
      console.log('Worker Statistics:', {
        totalWorkers: workerStats.totalWorkers,
        activeWorkers: workerStats.activeWorkers,
        averageProcessingTime: `${workerStats.averageProcessingTime.toFixed(2)}ms`
      });
    }
    
    // Graceful shutdown
    console.log('\n🔄 Shutting down event system...');
    if (eventSystem.bufferedEventBus) {
      await eventSystem.bufferedEventBus.shutdown();
    }
    
    console.log('✅ Integration test completed successfully!\n');
    
  } catch (error) {
    console.error('❌ Integration test failed:', error);
    throw error;
  }
}

/**
 * Performance test for buffered vs regular event processing
 */
export async function runPerformanceComparison() {
  console.log('⚡ Performance Comparison: Regular vs Buffered Event Processing\n');
  
  const eventCount = 1000;
  const testEvents = Array.from({ length: eventCount }, (_, i) => ({
    type: 'test.event',
    payload: { id: i, data: `test-data-${i}` },
    timestamp: Date.now()
  }));
  
  // Test regular event processing
  console.log(`🔄 Testing regular event processing (${eventCount} events)...`);
  const regularStart = Date.now();
  
  const regularEventSystem = await bootstrapEventSystem([], {
    useBufferedProcessing: false
  });
  
  for (const event of testEvents) {
    regularEventSystem.eventBus.emit(event);
  }
  
  const regularEnd = Date.now();
  const regularTime = regularEnd - regularStart;
  
  console.log(`✅ Regular processing completed in ${regularTime}ms`);
  console.log(`📊 Regular throughput: ${(eventCount / regularTime * 1000).toFixed(0)} events/sec\n`);
  
  // Test buffered event processing
  console.log(`🔄 Testing buffered event processing (${eventCount} events)...`);
  const bufferedStart = Date.now();
  
  const bufferedEventSystem = await bootstrapEventSystem([], {
    useBufferedProcessing: true,
    bufferedEventConfig: {
      ...defaultBufferedEventConfig,
      enabled: true,
      workerCount: 4,
      maxQueueSize: eventCount + 100
    }
  });
  
  // Wait for workers to initialize
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const emitPromises = testEvents.map(event => 
    bufferedEventSystem.bufferedEventBus!.emitEvent(
      event.type,
      event.payload,
      { priority: 'normal' }
    )
  );
  
  await Promise.all(emitPromises);
  
  const bufferedEnd = Date.now();
  const bufferedTime = bufferedEnd - bufferedStart;
  
  console.log(`✅ Buffered processing completed in ${bufferedTime}ms`);
  console.log(`📊 Buffered throughput: ${(eventCount / bufferedTime * 1000).toFixed(0)} events/sec`);
  
  // Show comparison
  const improvement = ((regularTime - bufferedTime) / regularTime * 100);
  console.log(`\n📈 Performance improvement: ${improvement > 0 ? '+' : ''}${improvement.toFixed(1)}%`);
  
  // Cleanup
  await bufferedEventSystem.bufferedEventBus!.shutdown();
  
  console.log('\n✅ Performance comparison completed!\n');
}

// Export a function to run all tests
export async function runAllTests() {
  try {
    await runIntegrationTest();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Brief pause
    await runPerformanceComparison();
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

// If this file is run directly, execute all tests
if (require.main === module) {
  runAllTests().then(() => {
    console.log('🎉 All tests completed successfully!');
    process.exit(0);
  }).catch((error) => {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
  });
}