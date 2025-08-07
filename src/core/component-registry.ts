import { Constructor } from './di-container'

/**
 * A global Set that stores the constructors of all classes
 * decorated with @Component (or its derivatives).
 */
export const registeredComponents = new Set<Constructor>()
