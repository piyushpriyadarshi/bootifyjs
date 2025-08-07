import 'reflect-metadata'
import dotenv from 'dotenv'
dotenv.config()
import { createBootifyApp } from '../api'
import { HealthController } from './controllers/health.controller'
import { TodoController } from './controllers/todo.controller'
import { registeredComponents } from '../core/component-registry'
import { bootstrapEventSystem } from '../events/bootstrap'
import { container } from '../core/di-container'
import { Animal, AnimalService } from './services/todo.service'
// import { bootstrapCache } from '../cache/bootstrap'
import { intitializeLogging } from '../logging'
import z from 'zod'
import { AppConfig } from '../config/AppConfig'
// import { createBootifyApp } from './api'
// import { HealthController } from './examples/controllers/health.controller'
// import { TodoController } from './examples/controllers/todo.controller'

// --- Application Startup ---

async function main() {
  //   await intitializeLogging()
  AppConfig.initialize(
    z.object({
      NODE_ENV: z.string().min(1),
    })
  )

  const allComponents = Array.from(registeredComponents)
  await bootstrapEventSystem(allComponents)
  // await bootstrapCache()
  const { start } = await createBootifyApp({
    controllers: [HealthController, TodoController],
    enableSwagger: true,
    port: 3000,
    configSchema: z.object({
      NODE_ENV: z.string().min(1),
    }),
  })

  console.log('All components:', container.getRegisteredComponents())
  const animal = container.resolve<Animal>('Animal')

  //   console.log(animal)
  const animalservice: AnimalService = container.resolve<AnimalService>(AnimalService)
  console.log(animalservice.animal === animalservice.animal1)
  console.log(animalservice.animal.name)

  await start()
}

main()
