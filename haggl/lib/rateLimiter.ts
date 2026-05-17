import { logger } from "@/lib/logger";

// WARNING: In-memory rate limiter. Ineffective in serverless — replace with Redis before production.
if (process.env.VERCEL && process.env.NODE_ENV === 'production') {
  logger.warn("Using in-memory rate limiter in a serverless environment. This is ineffective.");
}

interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  burstSize?: number;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const limits = new Map<string, Bucket>();

export function createRateLimiter(opts: RateLimiterOptions) {
  const burstSize = opts.burstSize || opts.maxRequests;

  return {
    check: (key: string): { allowed: boolean; retryAfterMs: number } => {
      const now = Date.now();
      let bucket = limits.get(key);

      if (!bucket) {
        bucket = { tokens: burstSize, lastRefill: now };
        limits.set(key, bucket);
      }

      const elapsed = now - bucket.lastRefill;
      const refill = Math.floor(elapsed / opts.windowMs) * opts.maxRequests;

      if (refill > 0) {
        bucket.tokens = Math.min(burstSize, bucket.tokens + refill);
        bucket.lastRefill = now;
      }

      if (bucket.tokens > 0) {
        bucket.tokens--;
        return { allowed: true, retryAfterMs: 0 };
      }

      const retryAfterMs = opts.windowMs - (now - bucket.lastRefill);
      return { allowed: false, retryAfterMs };
    },

    reset: (key: string): void => {
      limits.delete(key);
    },

    resetAll: (): void => {
      limits.clear();
    },
  };
}

export function cleanupExpiredBuckets(): void {
  const now = Date.now();
  limits.forEach((bucket, key) => {
    if (now - bucket.lastRefill > 60_000) limits.delete(key);
  });
}

setInterval(cleanupExpiredBuckets, 60_000);

export const globalRateLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 60,
  burstSize: 10,
});

export const callRateLimiter = createRateLimiter({
  windowMs: 1000,
  maxRequests: 1,
  burstSize: 1,
});

export function rateLimitMiddleware(
  handler: (request: Request) => Promise<Response>,
  limiter: ReturnType<typeof createRateLimiter> = globalRateLimiter,
  keyFn: (request: Request) => string = (req) => {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    return "rl:" + ip;
  },
) {
  return async (request: Request): Promise<Response> => {
    const key = keyFn(request);
    const { allowed, retryAfterMs } = limiter.check(key);

    if (!allowed) {
      logger.warn("Rate limit exceeded", { metadata: { key, retryAfterMs } });
      return new Response(JSON.stringify({ error: "Too many requests", retry_after_ms: retryAfterMs }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil(retryAfterMs / 1000)),
          "X-RateLimit-Limit": "60",
          "X-RateLimit-Remaining": "0",
        },
      });
    }

    return handler(request);
  };
}
