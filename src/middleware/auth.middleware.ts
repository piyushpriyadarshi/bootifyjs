import { FastifyRequest, FastifyReply } from 'fastify';

// This is our example middleware function
export const authMiddleware = async (request: FastifyRequest, reply: FastifyReply) => {
    console.log('🛡️ Running Auth Middleware...');
    const apiKey = request.headers['authorization'];
    console.log(apiKey);


    if (apiKey !== 'Bearer my-secret-api-key') {
        // Stop the request and send a 401 Unauthorized response
        reply.code(401).send({ error: 'Unauthorized: Invalid API Key' });
        return; // Important to stop further execution
    }

    // If authentication is successful, you can attach user info to the request
    (request as any).user = { id: 'user-123', roles: ['admin'] };
};