/**
 * Optimized frontend utilities for better performance and user experience
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { debounce, throttle, memoize, createCache } from '../../../shared/utils.js';

// Optimized hooks
export function useOptimizedState<T>(initialValue: T, ttl?: number) {
  const [state, setState] = useState(initialValue);
  const cache = useRef(createCache<T>(ttl));
  
  const setCachedState = useCallback((value: T | ((prev: T) => T)) => {
    setState(prev => {
      const newValue = typeof value === 'function' ? (value as (prev: T) => T)(prev) : value;
      cache.current.set('state', newValue);
      return newValue;
    });
  }, []);
  
  useEffect(() => {
    const cached = cache.current.get('state');
    if (cached !== null) {
      setState(cached);
    }
  }, []);
  
  return [state, setCachedState] as const;
}

// Optimized async hook with retry and caching
export function useAsync<T>(
  asyncFn: () => Promise<T>,
  deps: React.DependencyList = [],
  options: {
    retry?: boolean;
    retryCount?: number;
    cacheKey?: string;
    cacheTTL?: number;
  } = {}
) {
  const [state, setState] = useState<{
    data: T | null;
    loading: boolean;
    error: Error | null;
  }>({
    data: null,
    loading: true,
    error: null,
  });

  const { retry = false, retryCount = 3, cacheKey, cacheTTL } = options;
  const cache = useRef(createCache<T>(cacheTTL));

  const execute = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Check cache first
      if (cacheKey) {
        const cached = cache.current.get(cacheKey);
        if (cached !== null) {
          setState({ data: cached, loading: false, error: null });
          return;
        }
      }

      // Execute with retry logic
      const executeWithRetry = async (): Promise<T> => {
        let lastError: Error;
        
        for (let attempt = 1; attempt <= (retry ? retryCount : 1); attempt++) {
          try {
            const result = await asyncFn();
            
            // Cache the result
            if (cacheKey) {
              cache.current.set(cacheKey, result);
            }
            
            return result;
          } catch (error) {
            lastError = error as Error;
            
            if (attempt === (retry ? retryCount : 1)) {
              throw lastError;
            }
            
            // Exponential backoff
            await new Promise(resolve => 
              setTimeout(resolve, Math.pow(2, attempt - 1) * 1000)
            );
          }
        }
        
        throw lastError!;
      };

      const data = await executeWithRetry();
      setState({ data, loading: false, error: null });
    } catch (error) {
      setState({ data: null, loading: false, error: error as Error });
    }
  }, deps);

  useEffect(() => {
    execute();
  }, [execute]);

  return {
    ...state,
    refetch: execute,
  };
}

// Optimized event handling hook
export function useEventCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps: React.DependencyList = []
): T {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useCallback(((...args) => callbackRef.current(...args)) as T, deps);
}

// Optimized scroll hook
export function useScroll(options: {
  throttle?: number;
  offset?: number;
} = {}) {
  const { throttle: throttleMs = 100, offset = 0 } = options;
  const [scrollY, setScrollY] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);

  const handleScroll = useCallback(
    throttle(() => {
      const currentScrollY = window.scrollY;
      setScrollY(currentScrollY);
      setIsScrolled(currentScrollY > offset);
    }, throttleMs),
    [offset, throttleMs]
  );

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return { scrollY, isScrolled };
}

// Optimized resize hook
export function useResize(callback: (width: number, height: number) => void, debounceMs = 250) {
  const handleResize = useCallback(
    debounce(() => {
      callback(window.innerWidth, window.innerHeight);
    }, debounceMs),
    [callback, debounceMs]
  );

  useEffect(() => {
    handleResize();
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);
}

// Optimized local storage hook
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  options: {
    serialize?: (value: T) => string;
    deserialize?: (value: string) => T;
  } = {}
) {
  const { serialize = JSON.stringify, deserialize = JSON.parse } = options;

  const [state, setState] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? deserialize(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setStoredValue = useCallback((value: T | ((prev: T) => T)) => {
    try {
      const valueToStore = typeof value === 'function' ? (value as (prev: T) => T)(state) : value;
      setState(valueToStore);
      window.localStorage.setItem(key, serialize(valueToStore));
    } catch (error) {
      console.error(`Error saving to localStorage key "${key}":`, error);
    }
  }, [key, state, serialize]);

  return [state, setStoredValue] as const;
}

// Optimized intersection observer hook
export function useIntersectionObserver(
  ref: React.RefObject<Element>,
  options: IntersectionObserverInit = {}
) {
  const [isIntersecting, setIsIntersecting] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting);
    }, options);

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [ref, options]);

  return isIntersecting;
}

// Optimized media query hook
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);

    const listener = (event: MediaQueryListEvent) => setMatches(event.matches);
    media.addEventListener('change', listener);

    return () => media.removeEventListener('change', listener);
  }, [query]);

  return matches;
}

// Optimized animation hook
export function useAnimation(
  duration: number,
  easing: string = 'ease-in-out'
): [string, () => void, () => void] {
  const [animationState, setAnimationState] = useState('idle');
  const timeoutRef = useRef<NodeJS.Timeout>();

  const start = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    setAnimationState('running');
    
    timeoutRef.current = setTimeout(() => {
      setAnimationState('completed');
    }, duration);
  }, [duration]);

  const reset = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setAnimationState('idle');
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return [animationState, start, reset];
}

// Performance utilities
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics = new Map<string, number[]>();

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  startTimer(name: string): () => number {
    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      this.recordMetric(name, duration);
      return duration;
    };
  }

  recordMetric(name: string, value: number): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    this.metrics.get(name)!.push(value);
  }

  getMetrics(name: string): { avg: number; min: number; max: number; count: number } | null {
    const values = this.metrics.get(name);
    if (!values || values.length === 0) return null;

    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    return { avg, min, max, count: values.length };
  }

  getAllMetrics(): Record<string, { avg: number; min: number; max: number; count: number }> {
    const result: Record<string, { avg: number; min: number; max: number; count: number }> = {};
    
    for (const [name] of this.metrics) {
      const metrics = this.getMetrics(name);
      if (metrics) {
        result[name] = metrics;
      }
    }
    
    return result;
  }

  clear(): void {
    this.metrics.clear();
  }
}

// Optimized image loading utility
export class OptimizedImageLoader {
  private static cache = new Map<string, HTMLImageElement>();
  private static loadingPromises = new Map<string, Promise<HTMLImageElement>>();

  static loadImage(src: string): Promise<HTMLImageElement> {
    // Return cached image if available
    if (this.cache.has(src)) {
      return Promise.resolve(this.cache.get(src)!);
    }

    // Return existing promise if loading
    if (this.loadingPromises.has(src)) {
      return this.loadingPromises.get(src)!;
    }

    // Create new loading promise
    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.cache.set(src, img);
        this.loadingPromises.delete(src);
        resolve(img);
      };
      img.onerror = () => {
        this.loadingPromises.delete(src);
        reject(new Error(`Failed to load image: ${src}`));
      };
      img.src = src;
    });

    this.loadingPromises.set(src, promise);
    return promise;
  }

  static preloadImages(sources: string[]): Promise<HTMLImageElement[]> {
    return Promise.all(sources.map(src => this.loadImage(src)));
  }

  static clearCache(): void {
    this.cache.clear();
    this.loadingPromises.clear();
  }
}

// Optimized form utilities
export class OptimizedForm {
  static validateField<T>(
    value: T,
    validators: ((value: T) => string | null)[]
  ): { isValid: boolean; error: string | null } {
    for (const validator of validators) {
      const error = validator(value);
      if (error) {
        return { isValid: false, error };
      }
    }
    return { isValid: true, error: null };
  }

  static createValidator<T>(
    rules: { [K in keyof T]?: ((value: T[K]) => string | null)[] }
  ) {
    return (data: T): { isValid: boolean; errors: Partial<Record<keyof T, string>> } => {
      const errors: Partial<Record<keyof T, string>> = {};
      let isValid = true;

      for (const [field, validators] of Object.entries(rules)) {
        if (validators && validators.length > 0) {
          const result = this.validateField(data[field as keyof T], validators);
          if (!result.isValid) {
            errors[field as keyof T] = result.error!;
            isValid = false;
          }
        }
      }

      return { isValid, errors };
    };
  }
}

// Optimized API client with caching and retry
export class OptimizedApiClient {
  private cache = createCache<any>(5 * 60 * 1000); // 5 minutes
  private performanceMonitor = PerformanceMonitor.getInstance();

  async request<T>(
    url: string,
    options: RequestInit = {},
    cacheOptions?: {
      key?: string;
      ttl?: number;
    }
  ): Promise<T> {
    const { key = url, ttl } = cacheOptions || {};
    
    // Check cache first
    if (cacheOptions) {
      const cached = this.cache.get(key);
      if (cached !== null) {
        return cached;
      }
    }

    const endTimer = this.performanceMonitor.startTimer(`api_request_${url}`);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Cache the response
      if (cacheOptions) {
        this.cache.set(key, data);
      }

      endTimer();
      return data;
    } catch (error) {
      endTimer();
      throw error;
    }
  }

  get<T>(url: string, cacheOptions?: { key?: string; ttl?: number }): Promise<T> {
    return this.request<T>(url, { method: 'GET' }, cacheOptions);
  }

  post<T>(url: string, data: any, cacheOptions?: { key?: string; ttl?: number }): Promise<T> {
    return this.request<T>(url, {
      method: 'POST',
      body: JSON.stringify(data),
    }, cacheOptions);
  }

  put<T>(url: string, data: any, cacheOptions?: { key?: string; ttl?: number }): Promise<T> {
    return this.request<T>(url, {
      method: 'PUT',
      body: JSON.stringify(data),
    }, cacheOptions);
  }

  delete<T>(url: string, cacheOptions?: { key?: string; ttl?: number }): Promise<T> {
    return this.request<T>(url, { method: 'DELETE' }, cacheOptions);
  }

  clearCache(): void {
    this.cache.clear();
  }

  getPerformanceMetrics() {
    return this.performanceMonitor.getAllMetrics();
  }
}

// Create singleton instances
export const performanceMonitor = PerformanceMonitor.getInstance();
export const imageLoader = OptimizedImageLoader;
export const apiClient = new OptimizedApiClient();

// Re-export utilities from shared utils
export * from '../../shared/utils.js';
