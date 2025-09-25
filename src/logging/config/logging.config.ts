// import { z } from 'zod'
// // import * as dotenv from 'dotenv'
// import { Service } from '../../core'

// // 1. Define the validation schema for logging configuration
// const LoggingConfigSchema = z.object({
//   LOG_LEVEL: z
//     .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
//     .default('debug')
//     .transform((val, ctx) => {
//       // If no explicit LOG_LEVEL is set, use 'info' for production, 'debug' otherwise
//       if (val === 'debug' && !process.env.LOG_LEVEL && process.env.NODE_ENV === 'production') {
//         return 'info'
//       }
//       return val
//     }),
//   SERVICE_NAME: z.string().default('bootifyjs-app'),

//   // ClickHouse Configuration
//   CLICKHOUSE_ENABLED: z
//     .preprocess((val) => String(val).toLowerCase() === 'true', z.boolean())
//     .default(false),
//   CLICKHOUSE_URL: z.string().url().default('http://localhost:8123'),
//   CLICKHOUSE_USER: z.string().default('default'),
//   CLICKHOUSE_PASSWORD: z.string().default(''),
//   CLICKHOUSE_DB: z.string().default('default'),
// })

// // 2. Create a type for the validated config
// export type LoggingConfigType = z.infer<typeof LoggingConfigSchema>

// // 3. The service that provides the validated configuration
// @Service() // Eagerly load to validate config at startup
// export class LoggingConfigService {
//   public readonly config: LoggingConfigType

//   constructor() {
//     // dotenv.config()
//     const result = LoggingConfigSchema.safeParse(process.env)

//     // console.log(process.env.NODE_ENV)

//     if (!result.success) {
//       console.error('❌ Invalid Logging Configuration:', result.error.flatten().fieldErrors)
//       throw new Error('Logging configuration failed validation. Exiting.')
//     }

//     this.config = result.data
//     console.log('[Logging] Configuration loaded and validated successfully.')
//   }
// }
