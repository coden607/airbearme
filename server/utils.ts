import type { Request, Response, NextFunction } from "express";

// Extend express-session with our custom fields
declare module "express-session" {
  interface SessionData {
    userId: string;
    userRole: string;
  }
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export const env = (globalThis as any).process?.env || {};

// Standardized error response format
export interface ErrorResponse {
  success: false;
  message: string;
  code: ErrorCode;
  details?: unknown;
  requestId?: string;
}

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "INTERNAL_ERROR"
  | "BAD_REQUEST"
  | "SERVICE_UNAVAILABLE";

// Custom API error class
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: ErrorCode,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, "BAD_REQUEST", message, details);
  }

  static validation(message: string, errors?: unknown): ApiError {
    return new ApiError(400, "VALIDATION_ERROR", message, errors);
  }

  static notFound(resource: string): ApiError {
    return new ApiError(404, "NOT_FOUND", `${resource} not found`);
  }

  static unauthorized(message = "Authentication required"): ApiError {
    return new ApiError(401, "UNAUTHORIZED", message);
  }

  static forbidden(message = "Access denied"): ApiError {
    return new ApiError(403, "FORBIDDEN", message);
  }

  static conflict(message: string): ApiError {
    return new ApiError(409, "CONFLICT", message);
  }

  static internal(message = "Internal server error"): ApiError {
    return new ApiError(500, "INTERNAL_ERROR", message);
  }
}

// Error handler middleware
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.get("x-request-id");

  // Log the error
  const prefix = requestId ? `[${requestId}] ` : "";
  console.error(`${prefix}[Error] ${req.method} ${req.path}`, err);

  // Handle ApiError
  if (err instanceof ApiError) {
    const response: ErrorResponse = {
      success: false,
      message: err.message,
      code: err.code,
      details: err.details,
      requestId,
    };
    res.status(err.statusCode).json(response);
    return;
  }

  // Handle Zod validation errors
  if (err.name === "ZodError") {
    const response: ErrorResponse = {
      success: false,
      message: "Validation failed",
      code: "VALIDATION_ERROR",
      details: (err as any).errors,
      requestId,
    };
    res.status(400).json(response);
    return;
  }

  // Handle unknown errors
  const response: ErrorResponse = {
    success: false,
    message: env.NODE_ENV === "production" ? "Internal server error" : err.message,
    code: "INTERNAL_ERROR",
    requestId,
  };
  res.status(500).json(response);
}

// Async route handler wrapper to catch errors
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Verify Supabase JWT from Authorization header
// Returns { userId, role } or null
async function verifySupabaseToken(req: Request): Promise<{ userId: string; role: string } | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  
  console.log(`[Auth] Verifying Supabase token: ${token ? 'present' : 'missing'}`);
  console.log(`[Auth] Supabase URL: ${supabaseUrl ? 'configured' : 'missing'}`);
  console.log(`[Auth] Service key: ${supabaseServiceKey ? 'configured' : 'missing'}`);
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.log('[Auth] Supabase not configured, skipping JWT verification');
    return null;
  }

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await supabase.auth.getUser(token);
    
    console.log(`[Auth] Supabase getUser result:`, { data: data?.user?.id, error: error?.message });
    
    if (error || !data.user) {
      console.log('[Auth] JWT verification failed:', error);
      return null;
    }
    
    return {
      userId: data.user.id,
      role: (data.user.user_metadata?.role as string) || "user",
    };
  } catch (error) {
    console.error('[Auth] JWT verification exception:', error);
    return null;
  }
}

// Auth middleware: checks session first, then Supabase JWT
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  console.log(`[Auth] Checking authentication for ${req.method} ${req.path}`);
  
  // 1. Check session (works in local dev / persistent servers)
  if (req.session?.userId) {
    console.log(`[Auth] Session auth successful for user ${req.session.userId}`);
    return next();
  }

  // 2. Check Supabase JWT (works on Vercel serverless)
  const tokenAuth = await verifySupabaseToken(req);
  if (tokenAuth) {
    // Populate session-like data on request for downstream use
    (req as any).userId = tokenAuth.userId;
    (req as any).userRole = tokenAuth.role;
    console.log(`[Auth] JWT auth successful for user ${tokenAuth.userId} with role ${tokenAuth.role}`);
    return next();
  }

  // 3. Check for basic auth header as fallback (for development/testing)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Basic ')) {
    try {
      const credentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
      const [email, password] = credentials.split(':');
      
      // For development: allow basic auth with demo credentials
      if (email === 'demo@airbear.test' && password === 'demo123') {
        (req as any).userId = 'demo-user-id';
        (req as any).userRole = 'user';
        console.log(`[Auth] Demo basic auth successful`);
        return next();
      }
    } catch (error) {
      console.log(`[Auth] Basic auth parsing failed: ${error}`);
    }
  }

  // 4. Check for demo mode fallback (allow booking without auth in development)
  if (env.NODE_ENV !== 'production' && req.path === '/api/rides') {
    console.log(`[Auth] Demo mode: allowing booking without authentication`);
    (req as any).userId = 'demo-user-id';
    (req as any).userRole = 'user';
    return next();
  }

  console.log(`[Auth] All authentication methods failed for ${req.method} ${req.path}`);
  const err = ApiError.unauthorized("Authentication required. Please log in and try again.");
  res.status(401).json({ success: false, message: err.message, code: err.code } as ErrorResponse);
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Environment-agnostic password hashing using PBKDF2 (Web Crypto API).
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const hash = await globalThis.crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `pbkdf2:100000:${saltHex}:${hashHex}`;
}

/**
 * Environment-agnostic password verification. Supports legacy bcrypt hashes.
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  if (hash.startsWith("pbkdf2:")) {
    const parts = hash.split(":");
    if (parts.length !== 4) return false;
    const [_, iterations, saltHex, hashHex] = parts;

    const encoder = new TextEncoder();
    const salt = new Uint8Array(saltHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    const keyMaterial = await globalThis.crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );
    const derivedHash = await globalThis.crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations: parseInt(iterations),
        hash: "SHA-256",
      },
      keyMaterial,
      256
    );
    const derivedHex = Array.from(new Uint8Array(derivedHash)).map(b => b.toString(16).padStart(2, '0')).join('');
    return safeCompare(derivedHex, hashHex);
  }

  // Fallback to bcrypt for legacy hashes (hash_ prefix or no prefix)
  try {
    const bcrypt = await import("bcryptjs");
    return await bcrypt.compare(password, hash.replace(/^hash_/, ""));
  } catch {
    // In edge runtimes where bcryptjs might fail or not be available
    return false;
  }
}

/**
 * Environment-agnostic HMAC-SHA256.
 */
export async function hmacSha256(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await globalThis.crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(data)
  );
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Admin middleware: requires auth + admin role
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  // 1. Check session
  if (req.session?.userId) {
    if (req.session.userRole !== "admin") {
      res.status(403).json({ success: false, message: "Access denied", code: "FORBIDDEN" } as ErrorResponse);
      return;
    }
    return next();
  }

  // 2. Check Supabase JWT
  const tokenAuth = await verifySupabaseToken(req);
  if (tokenAuth) {
    if (tokenAuth.role !== "admin") {
      res.status(403).json({ success: false, message: "Access denied", code: "FORBIDDEN" } as ErrorResponse);
      return;
    }
    (req as any).userId = tokenAuth.userId;
    (req as any).userRole = tokenAuth.role;
    return next();
  }

  res.status(401).json({ success: false, message: "Authentication required", code: "UNAUTHORIZED" } as ErrorResponse);
}
