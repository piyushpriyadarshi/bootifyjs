import { Config } from '../core/config';

@Config('BOOTIFY')
export class AppConfig {
  // Service configuration
  SERVICE_NAME: string = 'bootifyjs-app';
  
  // Server configuration - will be populated from BOOTIFY_SERVER_* env vars
  server: {
    port: number;
    host: string;
    name?: string;
  } = {
    port: 3000,
    host: 'localhost'
  };
  
  // Database configuration - will be populated from BOOTIFY_DATABASE_* env vars
  database: {
    host: string;
    port: number;
    name: string;
    username: string;
    password: string;
  } = {
    host: 'localhost',
    port: 5432,
    name: 'bootifyjs',
    username: 'admin',
    password: 'password'
  };
  
  // Logging configuration - will be populated from BOOTIFY_LOGGING_* env vars
  logging: {
    level: string;
    enabled: boolean;
  } = {
    level: 'info',
    enabled: true
  };
  
  // Any other configuration can be added here
  // The @Config decorator will automatically map environment variables
  // based on the property structure
  
  // API Configuration - will be populated from BOOTIFY_API_* env vars
  api: {
    version: string;
  } = {
    version: 'v1'
  };
  
  // CORS Configuration - will be populated from BOOTIFY_CORS_* env vars
  cors: {
    enabled: boolean;
  } = {
    enabled: true
  };
  
  // JWT Configuration - will be populated from BOOTIFY_JWT_* env vars
  jwt: {
    secret: string;
    expiresIn: number;
  } = {
    secret: 'default-secret',
    expiresIn: 3600
  };
}