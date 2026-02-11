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

// Auth middleware: rejects requests without a valid session
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    const err = ApiError.unauthorized();
    const response: ErrorResponse = {
      success: false,
      message: err.message,
      code: err.code,
    };
    res.status(401).json(response);
    return;
  }
  next();
}

// Admin middleware: requires auth + admin role
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    const err = ApiError.unauthorized();
    const response: ErrorResponse = {
      success: false,
      message: err.message,
      code: err.code,
    };
    res.status(401).json(response);
    return;
  }
  if (req.session.userRole !== "admin") {
    const err = ApiError.forbidden();
    const response: ErrorResponse = {
      success: false,
      message: err.message,
      code: err.code,
    };
    res.status(403).json(response);
    return;
  }
  next();
}
