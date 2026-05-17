import { logger } from "@/lib/logger";

let _initialized = false;

export function initSentry(): void {
  if (_initialized) return;
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    logger.info("Sentry not configured (no DSN)");
    return;
  }
  _initialized = true;
  logger.info("Sentry initialized", { metadata: { dsn: dsn.substring(0, 20) + "..." } });
}

export function captureException(error: Error, context?: Record<string, unknown>): void {
  logger.error(error.message, {
    error: error.stack || error.message,
    metadata: context,
  });
}

export function captureMessage(message: string, level: "info" | "warning" | "error" = "info", context?: Record<string, unknown>): void {
  logger[level === "error" ? "error" : level === "warning" ? "warn" : "info"](message, {
    metadata: context,
  });
}

export function withSentry<T>(
  fn: () => Promise<T>,
  errorContext?: Record<string, unknown>,
): Promise<T> {
  return fn().catch((err) => {
    captureException(err instanceof Error ? err : new Error(String(err)), errorContext);
    throw err;
  });
}

export function sentryWrap<T extends (...args: any[]) => any>(
  fn: T,
  context?: Record<string, unknown>,
): T {
  return ((...args: any[]) => {
    try {
      const result = fn(...args);
      if (result instanceof Promise) {
        return result.catch((err) => {
          captureException(err instanceof Error ? err : new Error(String(err)), context);
          throw err;
        });
      }
      return result;
    } catch (err) {
      captureException(err instanceof Error ? err : new Error(String(err)), context);
      throw err;
    }
  }) as T;
}
