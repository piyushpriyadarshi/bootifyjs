import { FastifyRequest, FastifyReply } from 'fastify';

interface User {
  role?: string;
  roles?: string[];
  [key: string]: any;
}

/**
 * Authorization middleware factory
 * @param allowedRoles Array of roles that are allowed to access the resource
 * @returns FastifyMiddleware function
 */
export const authorize = (allowedRoles: string[]) => {
  return async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    if (!(request as any).authenticated || !(request as any).user) {
      reply.status(401).send({ message: 'Unauthorized' });
      return;
    }

    const userRoles: string[] = (request as any)?.user?.roles || [];
    if (!isUserAuthorized(allowedRoles, userRoles)) {
      reply.status(403).send({
        message: 'Access Denied, you dont have permission, please contact your Hr manager or Easyhyre Admin '
      });
      return;
    }
  };
};

/**
 * Check if user has any of the required roles
 * @param allowedRoles Array of roles that are allowed
 * @param userRoles Array of roles that the user has
 * @returns boolean indicating if user is authorized
 */
export function isUserAuthorized(
  allowedRoles: string[],
  userRoles: string[]
): boolean {
  if (!allowedRoles.length) {
    return true; // No role restrictions
  }

  if (!userRoles || !userRoles.length) {
    return false; // User has no roles
  }

  return userRoles.some((userRole) => allowedRoles.includes(userRole));
}

// Common role-based middleware functions
export const requireAdmin = authorize(['ADMIN', 'admin']);
export const requireManager = authorize(['ADMIN', 'MANAGER', 'admin', 'manager']);
export const requireUser = authorize(['ADMIN', 'MANAGER', 'USER', 'admin', 'manager', 'user']);
export const requireHR = authorize(['ADMIN', 'HR', 'admin', 'hr']);

export default authorize;
