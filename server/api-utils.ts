/**
 * Optimized API utilities for better performance and error handling
 */

import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { createSafeValidator, createCache, retryAsync, createPerformanceTimer } from "../shared/utils.js";

// Enhanced error types
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: any) {
    super(400, message, 'VALIDATION_ERROR', details);
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string = 'Resource') {
    super(404, `${resource} not found`, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message: string = 'Unauthorized') {
    super(401, message, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends ApiError {
  constructor(message: string = 'Forbidden') {
    super(403, message, 'FORBIDDEN');
  }
}

export class ConflictError extends ApiError {
  constructor(message: string = 'Conflict') {
    super(409, message, 'CONFLICT');
  }
}

export class InternalServerError extends ApiError {
  constructor(message: string = 'Internal server error') {
    super(500, message, 'INTERNAL_ERROR');
  }
}

// Enhanced async handler with better error handling
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Enhanced response utilities
export class ApiResponse {
  static success<T>(
    res: Response,
    data: T,
    message?: string,
    statusCode: number = 200
  ): Response {
    return res.status(statusCode).json({
      success: true,
      data,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  static error(
    res: Response,
    error: ApiError | Error,
    statusCode?: number
  ): Response {
    const apiError = error instanceof ApiError ? error : new InternalServerError();
    
    return res.status(statusCode || apiError.statusCode).json({
      success: false,
      error: {
        message: apiError.message,
        code: apiError.code,
        details: apiError.details,
      },
      timestamp: new Date().toISOString(),
    });
  }

  static paginated<T>(
    res: Response,
    data: T[],
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    },
    message?: string
  ): Response {
    return res.status(200).json({
      success: true,
      data,
      pagination,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  static created<T>(res: Response, data: T, message?: string): Response {
    return this.success(res, data, message, 201);
  }

  static noContent(res: Response): Response {
    return res.status(204).send();
  }

  static badRequest(res: Response, message: string, details?: any): Response {
    return this.error(res, new ValidationError(message, details), 400);
  }

  static unauthorized(res: Response, message?: string): Response {
    return this.error(res, new UnauthorizedError(message), 401);
  }

  static forbidden(res: Response, message?: string): Response {
    return this.error(res, new ForbiddenError(message), 403);
  }

  static notFound(res: Response, resource?: string): Response {
    return this.error(res, new NotFoundError(resource), 404);
  }

  static conflict(res: Response, message?: string): Response {
    return this.error(res, new ConflictError(message), 409);
  }

  static internalError(res: Response, message?: string): Response {
    return this.error(res, new InternalServerError(message), 500);
  }
}

// Enhanced validation utilities
export function createValidationMiddleware<T>(schema: z.ZodSchema<T>, target: 'body' | 'query' | 'params' = 'body') {
  const validate = createSafeValidator(schema);
  
  return (req: Request, res: Response, next: NextFunction) => {
    const data = req[target];
    const result = validate(data);
    
    if (!result.success) {
      return ApiResponse.badRequest(res, result.error);
    }
    
    // Replace the target with validated data
    (req as any)[target] = result.data;
    next();
  };
}

// Enhanced authentication middleware
export function createAuthMiddleware(options: {
  required?: boolean;
  roles?: string[];
  allowDemo?: boolean;
} = {}) {
  const { required = true, roles = [], allowDemo = true } = options;
  
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.session?.userId || (req as any).userId;
      const userRole = req.session?.userRole || (req as any).userRole;
      
      if (!userId && required) {
        return ApiResponse.unauthorized(res, 'Authentication required');
      }
      
      if (roles.length > 0 && !roles.includes(userRole)) {
        return ApiResponse.forbidden(res, 'Insufficient permissions');
      }
      
      // Add user info to request for easier access
      (req as any).authUserId = userId;
      (req as any).authUserRole = userRole;
      
      next();
    } catch (error) {
      return ApiResponse.internalError(res, 'Authentication error');
    }
  };
}

// Enhanced rate limiting
export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
}) {
  const { windowMs, maxRequests, message = 'Too many requests', skipSuccessfulRequests = false } = options;
  const requests = new Map<string, { count: number; resetTime: number }>();
  
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const requestData = requests.get(key);
    
    if (!requestData || now > requestData.resetTime) {
      requests.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    if (requestData.count >= maxRequests) {
      return ApiResponse.error(res, new ApiError(429, message), 429);
    }
    
    requestData.count++;
    next();
  };
}

// Enhanced caching middleware
export function createCacheMiddleware(options: {
  ttl?: number;
  keyGenerator?: (req: Request) => string;
  condition?: (req: Request) => boolean;
} = {}) {
  const { ttl = 5 * 60 * 1000, keyGenerator = (req) => req.url, condition = () => true } = options;
  const cache = createCache(ttl);
  
  return (req: Request, res: Response, next: NextFunction) => {
    if (!condition(req)) {
      return next();
    }
    
    const key = keyGenerator(req);
    const cached = cache.get(key);
    
    if (cached) {
      return ApiResponse.success(res, cached);
    }
    
    // Override res.json to cache the response
    const originalJson = res.json;
    res.json = function(data: any) {
      cache.set(key, data);
      return originalJson.call(this, data);
    };
    
    next();
  };
}

// Enhanced request logging
export function createRequestLogger(options: {
  logLevel?: 'info' | 'warn' | 'error';
  skipPaths?: string[];
  includeBody?: boolean;
} = {}) {
  const { logLevel = 'info', skipPaths = [], includeBody = false } = options;
  
  return (req: Request, res: Response, next: NextFunction) => {
    if (skipPaths.some(path => req.path.startsWith(path))) {
      return next();
    }
    
    const timer = createPerformanceTimer();
    const startTime = Date.now();
    
    res.on('finish', () => {
      const duration = timer.end();
      const logData = {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration: `${duration.toFixed(2)}ms`,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        timestamp: new Date().toISOString(),
      };
      
      if (includeBody && req.body) {
        (logData as any).body = req.body;
      }
      
      console.log(`[API] ${req.method} ${req.url} ${res.statusCode} - ${duration.toFixed(2)}ms`);
    });
    
    next();
  };
}

// Enhanced error handling middleware
export function createErrorHandler() {
  return (error: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(`[Error] ${req.method} ${req.url}:`, error);
    
    if (error instanceof ApiError) {
      return ApiResponse.error(res, error);
    }
    
    if (error instanceof z.ZodError) {
      return ApiResponse.badRequest(res, error.errors.map(e => e.message).join(', '));
    }
    
    return ApiResponse.internalError(res, 'An unexpected error occurred');
  };
}

// Database transaction helper
export function createTransactionHelper<T>(
  transaction: () => Promise<T>,
  retries: number = 3
): Promise<T> {
  return retryAsync(transaction, retries, 1000);
}

// Batch processing helper for database operations
export function createBatchProcessor<T, R>(
  processor: (items: T[]) => Promise<R[]>,
  options: {
    batchSize?: number;
    concurrency?: number;
  } = {}
) {
  const { batchSize = 10, concurrency = 1 } = options;
  
  return async (items: T[]): Promise<R[]> => {
    const results: R[] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await processor(batch);
      results.push(...batchResults);
    }
    
    return results;
  };
}

// Response compression helper
export function compressResponse(data: any): string {
  return JSON.stringify(data);
}

// Request validation helper
export function validateRequest<T>(
  req: Request,
  schema: z.ZodSchema<T>,
  target: 'body' | 'query' | 'params' = 'body'
): T {
  const validate = createSafeValidator(schema);
  const data = req[target];
  const result = validate(data);
  
  if (!result.success) {
    throw new ValidationError(result.error);
  }
  
  return result.data;
}

// Pagination helper
export function createPagination(
  page: number = 1,
  limit: number = 10,
  total: number
) {
  const offset = (page - 1) * limit;
  const totalPages = Math.ceil(total / limit);
  
  return {
    offset,
    limit,
    page,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

// Search and filter helper
export function createSearchFilter(search: string, fields: string[]): any {
  if (!search) return {};
  
  const searchConditions = fields.map(field => ({
    [field]: { $regex: search, $options: 'i' }
  }));
  
  return { $or: searchConditions };
}

// Sort helper
export function createSort(sort: string, defaultSort: string = 'createdAt'): any {
  const [field, order] = sort.split(':');
  const sortOrder = order === 'desc' ? -1 : 1;
  
  return { [field || defaultSort]: sortOrder };
}

// Export all utilities for easy importing
export * from "../shared/utils.js";
