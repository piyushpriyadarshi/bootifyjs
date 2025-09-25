// Test script to verify the LOG_LEVEL configuration fix
require('dotenv').config();

// Import after dotenv.config() to ensure env vars are loaded
const { AppConfig } = require('./dist/config/AppConfig');
const z = require('zod');

console.log('Environment variables loaded:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('LOG_LEVEL:', process.env.LOG_LEVEL);
console.log('');

// Initialize AppConfig
AppConfig.initialize(z.object({}));
const config = AppConfig.getInstance();

console.log('Configuration values:');
console.log('NODE_ENV:', config.get('NODE_ENV'));
console.log('LOG_LEVEL:', config.get('LOG_LEVEL'));
console.log('');

// Test the expected behavior
if (process.env.NODE_ENV === 'production' && !process.env.LOG_LEVEL) {
  const expectedLogLevel = 'info';
  const actualLogLevel = config.get('LOG_LEVEL');
  
  if (actualLogLevel === expectedLogLevel) {
    console.log('✅ SUCCESS: LOG_LEVEL correctly defaults to "info" in production');
  } else {
    console.log(`❌ FAILED: Expected LOG_LEVEL to be "${expectedLogLevel}" but got "${actualLogLevel}"`);
  }
} else {
  console.log('ℹ️  Test condition not met (NODE_ENV is not production or LOG_LEVEL is explicitly set)');
}