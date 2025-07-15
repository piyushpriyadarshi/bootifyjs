const autocannon = require('autocannon')
const { resolve } = require('path')

// Start your server first
const server = require('../dist/index')

autocannon(
  {
    url: 'http://localhost:3000', // Your server URL
    connections: 100, // Number of concurrent connections
    duration: 10, // Duration in seconds
    requests: [
      {
        method: 'GET',
        path: '/api/health', // Test endpoint
      },
    ],
  },
  (err, result) => {
    console.log('Requests per second:', result.requests.average)
    // server.close()
  }
)
