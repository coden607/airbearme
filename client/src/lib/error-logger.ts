/**
 * Client-side error logging utility
 * Captures errors and sends them to the server for analysis
 */

interface ErrorLog {
  message: string;
  stack?: string;
  url: string;
  userAgent: string;
  timestamp: string;
  userId?: string;
  context?: Record<string, unknown>;
}

class ErrorLogger {
  private static instance: ErrorLogger;
  private logs: ErrorLog[] = [];
  private userId: string | null = null;

  private constructor() {
    // Set up global error handlers
    this.setupGlobalHandlers();
  }

  static getInstance(): ErrorLogger {
    if (!ErrorLogger.instance) {
      ErrorLogger.instance = new ErrorLogger();
    }
    return ErrorLogger.instance;
  }

  setUserId(userId: string | null): void {
    this.userId = userId;
  }

  private setupGlobalHandlers(): void {
    // Catch unhandled errors
    window.onerror = (message, source, lineno, colno, error) => {
      this.logError({
        message: String(message),
        stack: error?.stack,
        context: { source, lineno, colno }
      });
      return false;
    };

    // Catch unhandled promise rejections
    window.onunhandledrejection = (event) => {
      this.logError({
        message: `Unhandled Promise Rejection: ${event.reason}`,
        stack: event.reason?.stack,
        context: { type: 'unhandledrejection' }
      });
    };
  }

  logError(params: {
    message: string;
    stack?: string;
    context?: Record<string, unknown>;
  }): void {
    const log: ErrorLog = {
      message: params.message,
      stack: params.stack,
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      userId: this.userId ?? undefined,
      context: params.context,
    };

    this.logs.push(log);

    // Log to console in development
    if (import.meta.env.DEV) {
      console.error('[ErrorLogger]', log);
    }

    // Send to server (debounced)
    this.sendLogs();
  }

  private sendTimeout: ReturnType<typeof setTimeout> | null = null;

  private sendLogs(): void {
    // Debounce sending logs
    if (this.sendTimeout) {
      clearTimeout(this.sendTimeout);
    }

    this.sendTimeout = setTimeout(async () => {
      if (this.logs.length === 0) return;

      const logsToSend = [...this.logs];
      this.logs = [];

      try {
        await fetch('/api/logs/errors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ errors: logsToSend }),
        });
      } catch {
        // Re-add logs if send failed
        this.logs = [...logsToSend, ...this.logs];
      }
    }, 5000);
  }

  // Manual error logging for caught errors
  captureException(error: Error, context?: Record<string, unknown>): void {
    this.logError({
      message: error.message,
      stack: error.stack,
      context,
    });
  }

  // Log custom events/metrics
  logEvent(name: string, data?: Record<string, unknown>): void {
    if (import.meta.env.DEV) {
      console.log('[Event]', name, data);
    }

    // Could send to analytics endpoint
    fetch('/api/logs/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: name, data, timestamp: new Date().toISOString() }),
    }).catch(() => {
      // Silent fail for events
    });
  }
}

export const errorLogger = ErrorLogger.getInstance();

// React error boundary helper
export function logReactError(error: Error, errorInfo: { componentStack: string }): void {
  errorLogger.captureException(error, {
    componentStack: errorInfo.componentStack,
    type: 'react-error-boundary',
  });
}
