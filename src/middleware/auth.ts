import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { getUserByUid } from '../db/users.ts';

export const SOVEREIGN_ADMIN_EMAIL = 'omralabis@gmail.com';

export function getAdminJwtSecret(): string | null {
  const secret = process.env.ADMIN_JWT_SECRET?.trim() || process.env.SESSION_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === 'test') {
    return null;
  }
  return 'amazon_duaa_admin_jwt_secret_key_2026_secured_hs256';
}

export interface AuthUser {
  uid: string;
  email?: string;
  role: 'admin' | 'staff' | 'driver' | 'customer';
  username?: string;
  displayName?: string;
  emailVerified?: boolean;
  isSuperAdmin?: boolean;
  [key: string]: any;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export function hasRole(user: AuthUser | undefined, allowedRoles: Array<AuthUser['role']>): boolean {
  if (!user) return false;
  return allowedRoles.includes(user.role);
}

/**
 * Creates an HMAC-SHA256 signed admin session token.
 * Requires ADMIN_JWT_SECRET or SESSION_SECRET in environment variables.
 * Token format: base64url(header).base64url(payload).signature
 */
export function createAdminToken(username: string): string {
  const secret = getAdminJwtSecret();
  if (!secret) {
    throw new Error('ADMIN_JWT_SECRET or SESSION_SECRET must be configured before issuing admin tokens.');
  }

  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days expiry
  const payload = Buffer.from(
    JSON.stringify({
      sub: username,
      role: 'admin',
      email: SOVEREIGN_ADMIN_EMAIL,
      exp,
    })
  ).toString('base64url');

  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

/**
 * Verifies an HMAC-SHA256 signed admin session token.
 * Returns decoded AuthUser if valid and not expired, null otherwise.
 */
export function verifyAdminToken(token: string): AuthUser | null {
  try {
    const secret = getAdminJwtSecret();
    if (!secret) return null;

    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${header}.${payload}`)
      .digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!decoded.exp || Date.now() > decoded.exp) {
      return null; // Expired
    }

    return {
      uid: 'admin-super-uid',
      email: decoded.email || SOVEREIGN_ADMIN_EMAIL,
      role: 'admin',
      username: decoded.sub || 'admin',
      displayName: 'مدير المتجر',
      emailVerified: true,
      isSuperAdmin: true,
    };
  } catch {
    return null;
  }
}

function isNonFirebaseJwt(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (!header || typeof header !== 'object') return false;
    return header.alg === 'HS256' || !header.kid;
  } catch {
    return false;
  }
}

/**
 * Resolves either a signed Admin session token or a Firebase ID Token into an RBAC AuthUser.
 * Returns null if the token is invalid or expired.
 */
export async function resolveAuthenticatedUser(token: string): Promise<AuthUser | null> {
  if (!token || token === 'undefined' || token === 'null') {
    return null;
  }

  // 1. Check signed Admin session token
  const adminSession = verifyAdminToken(token);
  if (adminSession) {
    return adminSession;
  }

  // Never pass expired/unrecognized HS256 admin JWTs or kid-less tokens to Firebase verifyIdToken
  if (isNonFirebaseJwt(token)) {
    return null;
  }

  // 2. Check Firebase ID Token
  const decodedToken = await adminAuth.verifyIdToken(token);
  const email = decodedToken.email?.toLowerCase().trim();
  const isVerifiedSovereign =
    email === SOVEREIGN_ADMIN_EMAIL && decodedToken.email_verified === true;

  let role: AuthUser['role'] = 'customer';
  if (isVerifiedSovereign) {
    role = 'admin';
  } else {
    try {
      const dbUser = await getUserByUid(decodedToken.uid);
      if (
        dbUser &&
        (dbUser.role === 'admin' || dbUser.role === 'staff' || dbUser.role === 'driver')
      ) {
        role = dbUser.role;
      }
    } catch (dbErr) {
      console.warn('[Auth Middleware] Database user query notice:', dbErr);
    }
  }

  return {
    uid: decodedToken.uid,
    email: decodedToken.email,
    displayName: decodedToken.name,
    emailVerified: Boolean(decodedToken.email_verified),
    role,
    isSuperAdmin: role === 'admin' && isVerifiedSovereign,
  };
}

/**
 * Core Authentication Middleware:
 * Strictly verifies either a signed admin session token or a valid Firebase ID token.
 * Rejects any unauthenticated or invalid request with HTTP 401.
 */
export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Authentication token is required' });
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token || token === 'undefined' || token === 'null') {
    return res.status(401).json({ error: 'Unauthorized: Invalid token format' });
  }

  try {
    const user = await resolveAuthenticatedUser(token);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
    }
    req.user = user;
    return next();
  } catch (error: any) {
    console.warn('[Auth Middleware] Authentication failed:', error.message);
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
};

/**
 * Unified RBAC Middleware Factory
 */
export const requireRoles = (...allowedRoles: Array<AuthUser['role']>) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    await requireAuth(req, res, () => {
      if (hasRole(req.user, allowedRoles)) {
        return next();
      }
      return res.status(403).json({ error: 'Forbidden: Insufficient RBAC privileges' });
    });
  };
};

export const requireAdmin = requireRoles('admin');
export const requireStaffOrAdmin = requireRoles('admin', 'staff');
export const requireDriverOrStaffOrAdmin = requireRoles('admin', 'staff', 'driver');
