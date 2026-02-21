/**
 * In-memory sliding-window rate limiter.
 *
 * NOTE: This is per-process. For multi-instance deployments (Vercel, etc.)
 * replace with a Redis-backed solution (e.g. @upstash/ratelimit).
 */

interface RateLimitEntry {
  timestamps: number[]; // request timestamps within the current window
}

const store = new Map<string, RateLimitEntry>();

// Prune stale keys every 5 minutes to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.timestamps.length === 0 || entry.timestamps[entry.timestamps.length - 1] < now - 5 * 60 * 1000) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

export interface RateLimitResult {
  allowed:     boolean;
  remaining:   number;
  resetInMs:   number;
}

/**
 * @param key        Unique identifier — typically `${ip}:${route}`
 * @param limit      Max requests allowed in the window
 * @param windowMs   Window duration in milliseconds
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Drop timestamps outside the current window (sliding window)
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  if (entry.timestamps.length >= limit) {
    const oldestInWindow = entry.timestamps[0];
    return {
      allowed:   false,
      remaining: 0,
      resetInMs: oldestInWindow + windowMs - now,
    };
  }

  entry.timestamps.push(now);

  return {
    allowed:   true,
    remaining: limit - entry.timestamps.length,
    resetInMs: windowMs,
  };
}

/**
 * Extract best-effort client IP from Next.js request headers.
 * Falls back to "unknown" — still better than no limiting.
 */
export function getClientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    headers.get("x-real-ip") ??
    "unknown"
  );
}
