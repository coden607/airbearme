/**
 * Shared utility functions for optimal performance and type safety
 */

import { z } from 'zod';

// Type-safe environment variable getter
export function getEnvVar(key: string): string {
  const value = (globalThis as any).process?.env?.[key];
  if (!value) {
    throw new Error(`Environment variable ${key} is required but not set`);
  }
  return value;
}

// Optional environment variable getter with default
export function getEnvVarOptional(key: string, defaultValue: string = ''): string {
  return (globalThis as any).process?.env?.[key] || defaultValue;
}

// Safe JSON parsing with error handling
export function safeJsonParse<T>(json: string, defaultValue: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return defaultValue;
  }
}

// Safe JSON stringifying
export function safeJsonStringify(obj: any, defaultValue: string = '{}'): string {
  try {
    return JSON.stringify(obj);
  } catch {
    return defaultValue;
  }
}

// Debounce utility for performance optimization
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Throttle utility for performance optimization
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Memoization utility for expensive computations
export function memoize<T extends (...args: any[]) => any>(
  func: T,
  keyGenerator?: (...args: Parameters<T>) => string
): T {
  const cache = new Map<string, ReturnType<T>>();
  
  return ((...args: Parameters<T>) => {
    const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args);
    
    if (cache.has(key)) {
      return cache.get(key);
    }
    
    const result = func(...args);
    cache.set(key, result);
    return result;
  }) as T;
}

// Safe number parsing with validation
export function safeParseNumber(value: any, defaultValue: number = 0): number {
  const parsed = Number(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

// Safe string formatting for currency
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// Safe date formatting
export function formatDate(date: Date | string, options: Intl.DateTimeFormatOptions = {}): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(dateObj.getTime())) {
    return 'Invalid date';
  }
  
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  }).format(dateObj);
}

// Distance calculation utility (Haversine formula)
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  unit: 'km' | 'miles' = 'km'
): number {
  const R = unit === 'km' ? 6371 : 3959; // Earth radius in km or miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Safe array operations
export function safeArrayAccess<T>(array: T[], index: number, defaultValue: T): T {
  return array[index] ?? defaultValue;
}

// Safe object property access
export function safeGet<T, K extends keyof T>(
  obj: T | null | undefined,
  key: K,
  defaultValue: T[K]
): T[K] {
  return obj?.[key] ?? defaultValue;
}

// Validation helpers
export function createSafeValidator<T>(schema: z.ZodSchema<T>) {
  return (data: unknown): { success: true; data: T } | { success: false; error: string } => {
    try {
      const result = schema.parse(data);
      return { success: true, data: result };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { success: false, error: error.errors.map(e => e.message).join(', ') };
      }
      return { success: false, error: 'Validation failed' };
    }
  };
}

// Performance monitoring utilities
export function createPerformanceTimer() {
  const start = performance.now();
  return {
    end: () => {
      const end = performance.now();
      return end - start;
    },
    endLog: (label: string) => {
      const duration = performance.now() - start;
      console.log(`[Performance] ${label}: ${duration.toFixed(2)}ms`);
    }
  };
}

// Async retry utility with exponential backoff
export async function retryAsync<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxAttempts) {
        throw lastError;
      }
      
      // Exponential backoff with jitter
      const delay = baseDelay * Math.pow(2, attempt - 1) * (0.5 + Math.random() * 0.5);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

// Batch processing utility
export function createBatchProcessor<T, R>(
  processor: (items: T[]) => Promise<R[]>,
  batchSize: number = 10
) {
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

// Cache utility with TTL
export function createCache<T>(ttlMs: number = 5 * 60 * 1000) { // 5 minutes default
  const cache = new Map<string, { value: T; expires: number }>();
  
  return {
    get: (key: string): T | null => {
      const item = cache.get(key);
      if (!item) return null;
      
      if (Date.now() > item.expires) {
        cache.delete(key);
        return null;
      }
      
      return item.value;
    },
    
    set: (key: string, value: T): void => {
      cache.set(key, {
        value,
        expires: Date.now() + ttlMs
      });
    },
    
    clear: (): void => {
      cache.clear();
    },
    
    size: (): number => cache.size
  };
}

// Generic cache that can handle any type including arrays
export function createGenericCache<T>(ttlMs: number = 5 * 60 * 1000) {
  const cache = new Map<string, { value: T; expires: number }>();
  
  return {
    get: (key: string): T | undefined => {
      const item = cache.get(key);
      if (!item) return undefined;
      
      if (Date.now() > item.expires) {
        cache.delete(key);
        return undefined;
      }
      
      return item.value;
    },
    
    set: (key: string, value: T): void => {
      cache.set(key, {
        value,
        expires: Date.now() + ttlMs
      });
    },
    
    clear: (): void => {
      cache.clear();
    },
    
    size: (): number => cache.size
  };
}

// Safe URL construction
export function createSafeUrl(base: string, path: string = '', params: Record<string, string> = {}): string {
  try {
    const url = new URL(path, base);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
    return url.toString();
  } catch {
    return base;
  }
}

// Error boundary utility
export function createErrorBoundary<T>(fallback: T) {
  return <R, Args extends unknown[]>(
    fn: (...args: Args) => R,
    onError?: (error: Error) => void
  ) => {
    return (...args: Args): T | R => {
      try {
        return fn(...args);
      } catch (error) {
        onError?.(error as Error);
        return fallback;
      }
    };
  };
}

// Type guards
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isArray<T>(value: unknown): value is T[] {
  return Array.isArray(value);
}

// Safe async function wrapper
export function safeAsync<T>(
  asyncFn: () => Promise<T>,
  defaultValue: T
): Promise<T> {
  return asyncFn().catch(() => defaultValue);
}

// Constants for better performance
export const CONSTANTS = {
  EARTH_RADIUS_KM: 6371,
  EARTH_RADIUS_MILES: 3959,
  DEFAULT_BATCH_SIZE: 10,
  DEFAULT_CACHE_TTL: 5 * 60 * 1000, // 5 minutes
  DEBOUNCE_DELAY: 300,
  THROTTLE_DELAY: 1000,
  MAX_RETRY_ATTEMPTS: 3,
  BASE_RETRY_DELAY: 1000,
} as const;
