// lib/cache.ts — In-Memory Cache with TTL and stale-on-error fallback
interface CacheEntry<T> {
  data: T;
  fetchedAt: string;       // ISO 8601
  expiresAt: number;       // Date.now() + ttl
  error?: string;          // set when last fetch failed
  staleSince?: string;     // set when first fetch failure occurred (D12)
}

const store = new Map<string, CacheEntry<any>>();

export function getCached<T>(key: string): CacheEntry<T> | undefined {
  return store.get(key);
}

export function setCache<T>(key: string, data: T, ttlMs: number, error?: string): CacheEntry<T> {
  const now = new Date();
  const prev = store.get(key);
  
  const entry: CacheEntry<T> = {
    data: error ? (prev?.data ?? data) : data,   // keep stale data on error
    fetchedAt: now.toISOString(),
    expiresAt: Date.now() + ttlMs,
    error,
    staleSince: error
      ? (prev?.staleSince || now.toISOString())
      : undefined,
  };
  
  store.set(key, entry);
  return entry;
}

export function isFresh<T>(entry: CacheEntry<T>): boolean {
  return Date.now() < entry.expiresAt;
}
