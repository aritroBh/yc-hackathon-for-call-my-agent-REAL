export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
  retryOn?: (error: Error) => boolean;
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

const DEFAULT_OPTS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  jitter: true,
  retryOn: () => true,
  onRetry: () => {},
};

const RETRYABLE_STATUSES = [408, 429, 500, 502, 503, 504];

function isRetryableError(err: Error): boolean {
  if ("status" in err && typeof (err as any).status === "number") {
    return RETRYABLE_STATUSES.includes((err as any).status);
  }
  if ("code" in err) {
    const code = (err as any).code as string;
    if (code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ECONNREFUSED") return true;
  }
  const msg = err.message.toLowerCase();
  if (msg.includes("timeout") || msg.includes("rate limit") || msg.includes("too many requests")) return true;
  if (msg.includes("econnreset") || msg.includes("etimedout") || msg.includes("econnrefused")) return true;
  if (msg.includes("internal server error") || msg.includes("service unavailable")) return true;
  return false;
}

export function calculateDelay(attempt: number, opts: Required<RetryOptions>): number {
  const exp = Math.min(opts.maxDelayMs, opts.baseDelayMs * Math.pow(2, attempt - 1));
  if (!opts.jitter) return exp;
  return exp * (0.5 + Math.random() * 0.5);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const opts: Required<RetryOptions> = { ...DEFAULT_OPTS, ...options };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt >= opts.maxAttempts) break;
      if (!opts.retryOn(lastError) && !isRetryableError(lastError)) break;

      const delay = calculateDelay(attempt, opts);
      opts.onRetry(attempt, lastError, delay);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error("Retry exhausted with no error");
}

export async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fn();
  } finally {
    clearTimeout(timer);
  }
}

export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: "closed" | "open" | "half-open" = "closed";

  constructor(
    private threshold: number = 5,
    private resetTimeoutMs: number = 30_000,
  ) {}

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.state = "half-open";
      } else {
        throw new Error("Circuit breaker is open");
      }
    }

    try {
      const result = await fn();
      if (this.state === "half-open") {
        this.state = "closed";
        this.failures = 0;
      }
      return result;
    } catch (err) {
      this.failures++;
      this.lastFailureTime = Date.now();
      if (this.failures >= this.threshold) {
        this.state = "open";
      }
      throw err;
    }
  }

  get status(): string {
    return this.state;
  }

  reset(): void {
    this.state = "closed";
    this.failures = 0;
  }
}
