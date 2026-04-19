// Simple in-memory IP-based rate limiter.
// Not persistent across pod restarts, but prevents basic spam/DoS on public endpoints.

interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();
const CLEANUP_INTERVAL_MS = 60_000;

// Periodically remove expired buckets to prevent unbounded memory growth.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key);
  }
}, CLEANUP_INTERVAL_MS);

/**
 * Returns true if the request should be allowed through, false if rate-limited.
 * @param key     Unique key (e.g. `ip:endpoint`)
 * @param limit   Max requests per window
 * @param windowMs  Window size in milliseconds
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = store.get(key);

  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= limit) return false;
  bucket.count++;
  return true;
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}
