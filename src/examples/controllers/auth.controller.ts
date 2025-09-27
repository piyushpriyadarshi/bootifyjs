// import { z } from 'zod';
// import { FastifyRequest, FastifyReply } from 'fastify';
// import {
//   Body,
//   Controller,
//   Get,
//   Post,
//   Schema
// } from '../../core/decorators';
// import { AuthManager } from '../../auth/AuthManager';
// import { JwtStrategy } from '../../auth/strategies/JwtStrategy';
// import { RedisTokenStorage } from '../../auth/storage/RedisTokenStorage';
// import { User, AuthContext } from '../../auth/types';

// const loginSchema = z.object({
//   username: z.string().min(1, 'Username is required'),
//   password: z.string().min(1, 'Password is required')
// });

// const refreshTokenSchema = z.object({
//   refreshToken: z.string().min(1, 'Refresh token is required')
// });

// // Mock users for testing
// const MOCK_USERS: User[] = [
//   {
//     id: '1',
//     username: 'admin',
//     email: 'admin@example.com',
//     roles: ['admin', 'manager', 'user'],
//     permissions: ['read', 'write', 'delete', 'admin'],
//     metadata: { password: 'admin123' },
//     createdAt: new Date(),
//     lastLoginAt: new Date()
//   },
//   {
//     id: '2',
//     username: 'manager',
//     email: 'manager@example.com',
//     roles: ['manager', 'user'],
//     permissions: ['read', 'write'],
//     metadata: { password: 'manager123' },
//     createdAt: new Date(),
//     lastLoginAt: new Date()
//   },
//   {
//     id: '3',
//     username: 'user',
//     email: 'user@example.com',
//     roles: ['user'],
//     permissions: ['read'],
//     metadata: { password: 'user123' },
//     createdAt: new Date(),
//     lastLoginAt: new Date()
//   }
// ];

// // Mock Redis client for demo
// const mockRedisClient = {
//   set: async (key: string, value: string, options?: any) => 'OK',
//   get: async (key: string) => null,
//   del: async (key: string) => 1,
//   exists: async (key: string) => 0
// };

// // Initialize auth system
// const tokenStorage = new RedisTokenStorage(mockRedisClient as any);
// const jwtStrategy = new JwtStrategy();

// const authManager = new AuthManager({
//   defaultStrategy: 'jwt',
//   tokenStorage
// });

// // Initialize auth system
// let authInitialized = false;
// async function initializeAuth() {
//   if (!authInitialized) {
//     await authManager.registerStrategy(jwtStrategy, {
//       strategy: 'jwt',
//       options: {
//         secret: process.env.JWT_SECRET || 'your-secret-key',
//         accessTokenExpiry: '15m',
//         refreshTokenExpiry: '7d',
//         issuer: 'bootifyjs-auth',
//         audience: 'bootifyjs-app',
//         isDefault: true
//       }
//     });
//     authInitialized = true;
//   }
// }

// @Controller('/auth')
// export class AuthController {

//   @Post('/login')
//   @Schema({
//     body: loginSchema,
//     responses: {
//       200: z.object({
//         token: z.string(),
//         user: z.object({
//           id: z.string(),
//           username: z.string(),
//           email: z.string(),
//           roles: z.array(z.string())
//         })
//       }),
//       401: z.object({
//         error: z.string(),
//         message: z.string()
//       })
//     }
//   })
//   async login(@Body() body: z.infer<typeof loginSchema>) {
//     const { username, password } = body;

//     // Find user
//     const user = MOCK_USERS.find(u => u.username === username && u.metadata?.password === password);

//     if (!user) {
//       throw new Error('Invalid credentials');
//     }

//     // Create auth context
//     const context: AuthContext = {
//       type: 'login',
//       strategy: 'jwt',
//       request: {} as any,
//       headers: {},
//       body: { username, password },
//       query: {}
//     };

//     // Authenticate using auth manager
//     const authResult = await authManager.authenticate(context, 'jwt');

//     if (!authResult.success || !authResult.tokens) {
//       throw new Error('Authentication failed');
//     }

//     // Update last login
//     user.lastLoginAt = new Date();

//     return {
//       accessToken: authResult.tokens.accessToken,
//       refreshToken: authResult.tokens.refreshToken,
//       expiresIn: authResult.tokens.expiresIn,
//       tokenType: authResult.tokens.tokenType,
//       user: {
//         id: user.id,
//         username: user.username,
//         email: user.email,
//         roles: user.roles
//       }
//     };
//   }

//   @Post('/refresh')
//   @Schema({
//     body: refreshTokenSchema,
//     responses: {
//       200: z.object({
//         accessToken: z.string(),
//         refreshToken: z.string(),
//         expiresIn: z.number(),
//         tokenType: z.string()
//       }),
//       401: z.object({
//         error: z.string(),
//         message: z.string()
//       })
//     }
//   })
//   async refreshToken(@Body() body: z.infer<typeof refreshTokenSchema>) {
//     const { refreshToken } = body;

//     const context: AuthContext = {
//       type: 'refresh',
//       strategy: 'jwt',
//       request: {} as any,
//       headers: {},
//       body: { refreshToken },
//       query: {}
//     };

//     const refreshResult = await authManager.refresh(refreshToken, context, 'jwt');

//     if (!refreshResult.success || !refreshResult.tokens) {
//       throw new Error('Token refresh failed');
//     }

//     return {
//       accessToken: refreshResult.tokens.accessToken,
//       refreshToken: refreshResult.tokens.refreshToken,
//       expiresIn: refreshResult.tokens.expiresIn,
//       tokenType: refreshResult.tokens.tokenType
//     };
//   }

//   @Post('/logout')
//   @Schema({
//     body: refreshTokenSchema,
//     responses: {
//       200: z.object({
//         message: z.string()
//       }),
//       400: z.object({
//         error: z.string(),
//         message: z.string()
//       })
//     }
//   })
//   async logout(@Body() body: z.infer<typeof refreshTokenSchema>) {
//     const { refreshToken } = body;

//     const context: AuthContext = {
//       type: 'revoke',
//       strategy: 'jwt',
//       request: {} as any,
//       headers: {},
//       body: { refreshToken },
//       query: {}
//     };

//     const revokeResult = await authManager.revoke(refreshToken, context, 'jwt');

//     if (!revokeResult) {
//       throw new Error('Logout failed');
//     }

//     return {
//       message: 'Successfully logged out'
//     };
//   }

//   @Get('/info')
//   @Schema({
//     responses: {
//       200: z.object({
//         authenticated: z.boolean(),
//         message: z.string().optional(),
//         instructions: z.object({
//           login: z.string(),
//           testCredentials: z.record(z.object({
//             username: z.string(),
//             password: z.string()
//           }))
//         }).optional(),
//         user: z.object({
//           id: z.string(),
//           username: z.string().optional(),
//           email: z.string().optional(),
//           roles: z.array(z.string())
//         }).optional()
//       })
//     }
//   })
//   async getAuthInfo() {
//     return {
//       authenticated: false,
//       message: 'Authentication info endpoint - use middleware to get authenticated user data',
//       instructions: {
//         login: 'POST /auth/login with username and password',
//         testCredentials: {
//           admin: { username: 'admin', password: 'admin123' },
//           manager: { username: 'manager', password: 'manager123' },
//           user: { username: 'user', password: 'user123' }
//         }
//       }
//     };
//   }
// }