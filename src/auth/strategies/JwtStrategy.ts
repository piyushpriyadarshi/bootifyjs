/**
 * JWT Authentication Strategy with Refresh Token Support
 * Implements secure JWT-based authentication with token rotation
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {
  AuthConfig,
  AuthContext,
  AuthError,
  AuthResult,
  AuthStrategy,
  AuthStrategyType,
  InvalidTokenError,
  RefreshTokenData,
  TokenPair,
  TokenStorage,
  User
} from '../types';

export interface JwtStrategyConfig {
  accessTokenSecret: string;
  refreshTokenSecret: string;
  accessTokenExpiry: string | number; // e.g., '15m' or 900
  refreshTokenExpiry: string | number; // e.g., '7d' or 604800
  issuer?: string;
  audience?: string;
  algorithm?: jwt.Algorithm;
  tokenStorage?: TokenStorage;
  userProvider: (userId: string) => Promise<User | null>;
  credentialValidator?: (credentials: any) => Promise<User | null>;
  /** Build extra/custom claims for the ACCESS token. Merged AFTER the
   *  framework defaults (so you may override email/roles/permissions).
   *  Reserved claims (sub, type, iat, jti) are rejected — the strategy
   *  owns them. Applied on login AND refresh (both mint new pairs). */
  payloadBuilder?: (user: User, context: AuthContext) => Record<string, unknown>
}

export class JwtStrategy implements AuthStrategy {
  readonly name = 'jwt';
  readonly type = AuthStrategyType.JWT;

  private static readonly RESERVED_CLAIMS = ['sub', 'type', 'iat', 'jti'] as const;

  private config!: JwtStrategyConfig;
  private tokenStorage?: TokenStorage;

  async initialize(config: AuthConfig): Promise<void> {
    this.config = config.options as JwtStrategyConfig;
    this.tokenStorage = this.config.tokenStorage;

    // Validate required configuration
    if (!this.config.accessTokenSecret || !this.config.refreshTokenSecret) {
      throw new AuthError(
        'JWT strategy requires accessTokenSecret and refreshTokenSecret',
        'INVALID_CONFIG',
        500
      );
    }

    if (!this.config.userProvider) {
      throw new AuthError(
        'JWT strategy requires a userProvider function',
        'INVALID_CONFIG',
        500
      );
    }

    if (this.config.payloadBuilder !== undefined && typeof this.config.payloadBuilder !== 'function') {
      throw new AuthError(
        'payloadBuilder must be a function',
        'INVALID_CONFIG',
        500
      );
    }
  }

  async authenticate(context: AuthContext): Promise<AuthResult> {
    try {
      // Extract credentials from request body
      const credentials = context.body;

      if (!credentials || (!credentials.email && !credentials.username)) {
        return {
          success: false,
          error: 'Email/username and password are required'
        };
      }

      // Validate credentials using the provided validator
      if (!this.config.credentialValidator) {
        return {
          success: false,
          error: 'Credential validation not configured'
        };
      }

      const user = await this.config.credentialValidator(credentials);
      if (!user) {
        return {
          success: false,
          error: 'Invalid credentials'
        };
      }

      // Generate token pair
      const tokens = await this.generateTokenPair(user, context);

      // Store refresh token
      if (this.tokenStorage) {
        await this.storeRefreshToken(tokens.refreshToken, user.id);
      }

      return {
        success: true,
        user,
        tokens
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Authentication failed: ${errorMessage}`
      };
    }
  }

  async validate(token: string, context: AuthContext): Promise<AuthResult> {
    try {
      // Verify and decode the access token
      const decoded = jwt.verify(token, this.config.accessTokenSecret, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: [this.config.algorithm || 'HS256']
      }) as jwt.JwtPayload;

      if (!decoded.sub) {
        throw new InvalidTokenError('Token missing subject (user ID)');
      }

      // Fetch user data
      const user = await this.config.userProvider(decoded.sub);
      if (!user) {
        throw new InvalidTokenError('User not found');
      }

      return {
        success: true,
        user,
        metadata: {
          tokenId: decoded.jti,
          issuedAt: new Date(decoded.iat! * 1000),
          expiresAt: new Date(decoded.exp! * 1000)
        }
      };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return {
          success: false,
          error: 'Access token has expired',
          metadata: { code: 'TOKEN_EXPIRED' }
        };
      }

      if (error instanceof jwt.JsonWebTokenError) {
        return {
          success: false,
          error: 'Invalid access token',
          metadata: { code: 'INVALID_TOKEN' }
        };
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Token validation failed: ${errorMessage}`
      };
    }
  }

  async refresh(refreshToken: string, context: AuthContext): Promise<AuthResult> {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, this.config.refreshTokenSecret, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: [this.config.algorithm || 'HS256']
      }) as jwt.JwtPayload;

      if (!decoded.sub || decoded.type !== 'refresh') {
        throw new InvalidTokenError('Invalid refresh token');
      }

      // Check if refresh token exists in storage
      if (this.tokenStorage) {
        const storedToken = await this.tokenStorage.get(`refresh:${decoded.jti}`);
        if (!storedToken) {
          throw new InvalidTokenError('Refresh token not found or revoked');
        }
      }

      // Fetch user data
      const user = await this.config.userProvider(decoded.sub);
      if (!user) {
        throw new InvalidTokenError('User not found');
      }

      // Generate new token pair
      const tokens = await this.generateTokenPair(user, context);

      // Store new refresh token and revoke old one
      if (this.tokenStorage) {
        await this.storeRefreshToken(tokens.refreshToken, user.id);
        await this.tokenStorage.delete(`refresh:${decoded.jti}`);
      }

      return {
        success: true,
        user,
        tokens,
        metadata: {
          refreshed: true,
          oldTokenId: decoded.jti
        }
      };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return {
          success: false,
          error: 'Refresh token has expired',
          metadata: { code: 'REFRESH_TOKEN_EXPIRED' }
        };
      }

      if (error instanceof jwt.JsonWebTokenError) {
        return {
          success: false,
          error: 'Invalid refresh token',
          metadata: { code: 'INVALID_REFRESH_TOKEN' }
        };
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Token refresh failed: ${errorMessage}`
      };
    }
  }

  async revoke(token: string, context: AuthContext): Promise<boolean> {
    try {
      // Decode token to get token ID (without verification since we're revoking)
      const decoded = jwt.decode(token) as jwt.JwtPayload;

      if (!decoded || !decoded.jti) {
        return false;
      }

      // Remove from token storage if available
      if (this.tokenStorage) {
        await this.tokenStorage.delete(`refresh:${decoded.jti}`);
        // Also add to blacklist for access tokens
        await this.tokenStorage.store(
          `blacklist:${decoded.jti}`,
          { revokedAt: new Date() },
          this.getTokenTTL(decoded.exp)
        );
      }

      return true;
    } catch (error) {
      console.error('Failed to revoke JWT token:', error);
      return false;
    }
  }

  /**
   * Generate a new access and refresh token pair
   */
  private async generateTokenPair(user: User, context: AuthContext): Promise<TokenPair> {
    const now = Math.floor(Date.now() / 1000);
    const tokenId = crypto.randomUUID();

    // Access token payload — custom claims spread LAST so they may reshape
    // the framework defaults; reserved keys are rejected in buildCustomClaims.
    const accessPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      permissions: user.permissions,
      type: 'access',
      iat: now,
      jti: tokenId,
      ...this.buildCustomClaims(user, context)
    };

    // Refresh token payload
    const refreshPayload = {
      sub: user.id,
      type: 'refresh',
      iat: now,
      jti: tokenId
    };

    const accessTokenOptions: jwt.SignOptions = {
      algorithm: this.config.algorithm || 'HS256'
    };

    if (this.config.accessTokenExpiry) {
      accessTokenOptions.expiresIn = this.config.accessTokenExpiry as number | import('ms').StringValue;
    }

    if (this.config.issuer) accessTokenOptions.issuer = this.config.issuer;
    if (this.config.audience) accessTokenOptions.audience = this.config.audience;

    const refreshTokenOptions: jwt.SignOptions = {
      algorithm: this.config.algorithm || 'HS256'
    };

    if (this.config.refreshTokenExpiry) {
      refreshTokenOptions.expiresIn = this.config.refreshTokenExpiry as number | import('ms').StringValue;
    }

    if (this.config.issuer) refreshTokenOptions.issuer = this.config.issuer;
    if (this.config.audience) refreshTokenOptions.audience = this.config.audience;

    const accessToken = jwt.sign(accessPayload, this.config.accessTokenSecret, accessTokenOptions);
    const refreshToken = jwt.sign(refreshPayload, this.config.refreshTokenSecret, refreshTokenOptions);

    // Calculate expiry in seconds
    const expiresIn = typeof this.config.accessTokenExpiry === 'string'
      ? this.parseTimeString(this.config.accessTokenExpiry)
      : this.config.accessTokenExpiry;

    return {
      accessToken,
      refreshToken,
      expiresIn,
      tokenType: 'Bearer'
    };
  }

  /**
   * Invoke the configured payloadBuilder and reject reserved claims
   */
  private buildCustomClaims(user: User, context: AuthContext): Record<string, unknown> {
    if (!this.config.payloadBuilder) return {};

    const claims = this.config.payloadBuilder(user, context) ?? {};
    const reserved = Object.keys(claims).filter(
      (k) => (JwtStrategy.RESERVED_CLAIMS as readonly string[]).includes(k)
    );

    if (reserved.length > 0) {
      throw new AuthError(
        `payloadBuilder cannot set reserved claims: ${reserved.join(', ')}`,
        'JWT_PAYLOAD_CLAIM_RESERVED',
        500
      );
    }

    return claims;
  }

  /**
   * Store refresh token data
   */
  private async storeRefreshToken(refreshToken: string, userId: string): Promise<void> {
    if (!this.tokenStorage) return;

    const decoded = jwt.decode(refreshToken) as jwt.JwtPayload;
    if (!decoded || !decoded.jti) return;

    const refreshTokenData: RefreshTokenData = {
      userId,
      tokenId: decoded.jti,
      strategy: this.name,
      issuedAt: new Date(decoded.iat! * 1000),
      expiresAt: new Date(decoded.exp! * 1000)
    };

    const ttl = this.getTokenTTL(decoded.exp);
    await this.tokenStorage.store(`refresh:${decoded.jti}`, refreshTokenData, ttl);
  }

  /**
   * Calculate TTL for token storage
   */
  private getTokenTTL(exp?: number): number {
    if (!exp) return 0;
    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, exp - now);
  }

  /**
   * Parse time string to seconds
   */
  private parseTimeString(timeStr: string): number {
    const units: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
      w: 604800
    };

    const match = timeStr.match(/^(\d+)([smhdw])$/);
    if (!match) {
      throw new Error(`Invalid time format: ${timeStr}`);
    }

    const [, value, unit] = match;
    return parseInt(value) * units[unit];
  }
}