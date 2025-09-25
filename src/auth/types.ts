/**
 * Core authentication types and interfaces for BootifyJS
 * Provides a unified authentication framework supporting multiple strategies
 */

export interface User {
  id: string;
  email?: string;
  username?: string;
  roles: string[];
  permissions: string[];
  metadata?: Record<string, any>;
  createdAt: Date;
  lastLoginAt?: Date;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
  tokenType: 'Bearer' | 'API-Key';
  scope?: string[];
}

export interface AuthResult {
  success: boolean;
  user?: User;
  tokens?: TokenPair;
  error?: string;
  metadata?: Record<string, any>;
}

export interface AuthContext {
  type: 'login' | 'validate' | 'refresh' | 'revoke' | 'generate';
  strategy: string;
  request: any; // Express request object
  headers: Record<string, string>;
  body?: any;
  query?: Record<string, string>;
}

export interface AuthConfig {
  strategy: string;
  options: Record<string, any>;
}

export interface TokenStorage {
  store(key: string, value: any, ttl?: number): Promise<void>;
  get(key: string): Promise<any>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export interface RefreshTokenData {
  userId: string;
  tokenId: string;
  strategy: string;
  issuedAt: Date;
  expiresAt: Date;
  metadata?: Record<string, any>;
}

export interface ApiKeyData {
  keyId: string;
  userId: string;
  name: string;
  scopes: string[];
  isActive: boolean;
  createdAt: Date;
  lastUsedAt?: Date;
  expiresAt?: Date;
}

export enum AuthStrategyType {
  JWT = 'jwt',
  API_KEY = 'api-key',
  OAUTH2 = 'oauth2',
  SAML = 'saml',
  LDAP = 'ldap'
}

export interface AuthStrategy {
  readonly name: string;
  readonly type: AuthStrategyType;
  
  /**
   * Authenticate a user based on the provided context
   */
  authenticate(context: AuthContext): Promise<AuthResult>;
  
  /**
   * Validate an existing token/credential
   */
  validate(token: string, context: AuthContext): Promise<AuthResult>;
  
  /**
   * Refresh an access token using a refresh token
   */
  refresh?(refreshToken: string, context: AuthContext): Promise<AuthResult>;
  
  /**
   * Revoke/logout a user's session
   */
  revoke?(token: string, context: AuthContext): Promise<boolean>;
  
  /**
   * Initialize the strategy with configuration
   */
  initialize(config: AuthConfig): Promise<void>;
}

export interface AuthMiddlewareOptions {
  strategies: string[];
  required?: boolean;
  roles?: string[];
  permissions?: string[];
  skipPaths?: string[];
  errorHandler?: (error: Error, req: any, reply: any) => void;
}

export interface SessionData {
  userId: string;
  strategy: string;
  issuedAt: Date;
  expiresAt: Date;
  refreshTokenId?: string;
  metadata?: Record<string, any>;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 401,
    public metadata?: Record<string, any>
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export class TokenExpiredError extends AuthError {
  constructor(message: string = 'Token has expired') {
    super(message, 'TOKEN_EXPIRED', 401);
  }
}

export class InvalidTokenError extends AuthError {
  constructor(message: string = 'Invalid token') {
    super(message, 'INVALID_TOKEN', 401);
  }
}

export class UnauthorizedError extends AuthError {
  constructor(message: string = 'Unauthorized access') {
    super(message, 'UNAUTHORIZED', 401);
  }
}

export class ForbiddenError extends AuthError {
  constructor(message: string = 'Forbidden access') {
    super(message, 'FORBIDDEN', 403);
  }
}