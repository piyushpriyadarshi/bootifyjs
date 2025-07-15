import 'reflect-metadata';

// Class decorator to enable automatic configuration
export function Config(prefix: string = 'BOOTIFY'): ClassDecorator {
  return function (target: any) {
    // Store the prefix for later use
    Reflect.defineMetadata('config:prefix', prefix, target);
    
    // Create a singleton instance
    const instance = new target();
    
    // Load configuration values automatically
    loadConfigurationFromEnv(instance, prefix);
    
    // Store the singleton instance
    Reflect.defineMetadata('config:instance', instance, target);
    
    return target;
  };
}

function loadConfigurationFromEnv(instance: any, prefix: string): void {
  // Get all environment variables with the prefix
  const envVars = Object.keys(process.env)
    .filter(key => key.startsWith(`${prefix}_`))
    .reduce((acc, key) => {
      acc[key] = process.env[key];
      return acc;
    }, {} as Record<string, string | undefined>);

  // Process each environment variable
  Object.entries(envVars).forEach(([envKey, envValue]) => {
    if (envValue === undefined) return;
    
    // Convert environment key to property path
    // BOOTIFY_SERVER_PORT -> server.port
    // BOOTIFY_SERVICE_NAME -> SERVICE_NAME
    const propertyPath = envKey
      .replace(`${prefix}_`, '')
      .toLowerCase()
      .split('_')
      .join('.');
    
    // Convert value based on content
    let value: any = envValue;
    
    // Try to convert to number
    const numValue = Number(envValue);
    if (!isNaN(numValue) && envValue.trim() !== '') {
      value = numValue;
    }
    // Try to convert to boolean
    else if (envValue.toLowerCase() === 'true' || envValue.toLowerCase() === 'false') {
      value = envValue.toLowerCase() === 'true';
    }
    
    // Set nested property
    setNestedProperty(instance, propertyPath, value);
  });
}

function setNestedProperty(obj: any, path: string, value: any): void {
  const keys = path.split('.');
  let current = obj;
  
  // Navigate/create nested structure
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key];
  }
  
  // Set the final value
  const finalKey = keys[keys.length - 1];
  current[finalKey] = value;
}

// Helper function to get configuration instance
export function getConfigInstance<T>(configClass: new () => T): T {
  const instance = Reflect.getMetadata('config:instance', configClass);
  if (!instance) {
    throw new Error(`Configuration class ${configClass.name} is not decorated with @Config`);
  }
  return instance;
}