/**
 * Cluster mode entry point for multi-core CPU utilization
 * 
 * This file forks multiple workers based on available CPU cores.
 * Each worker runs the main server independently.
 * 
 * Usage:
 *   bun build --compile --outfile server src/cluster.ts
 *   ./server
 */
import cluster from 'node:cluster'
import os from 'node:os'
import process from 'node:process'

if (cluster.isPrimary) {
    const numCPUs = os.availableParallelism?.() || os.cpus().length

    console.log(`Primary ${process.pid} is running`)
    console.log(`Forking ${numCPUs} workers...`)

    // Fork workers
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork()
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died (${signal || code}). Restarting...`)
        cluster.fork()
    })

    cluster.on('online', (worker) => {
        console.log(`Worker ${worker.process.pid} is online`)
    })
} else {
    // Workers run the server
    await import('./examples/index')
    console.log(`Worker ${process.pid} started`)
}
