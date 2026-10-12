// routes/_shared.ts — shared responder for cache-then-JSON GET handlers.
//
// Same status as the other route modules: thin hono layer, `Context` is a
// type-only import (erased at runtime, no hono dependency pulled).
import type { Context } from 'hono';
import { setCache } from '../lib/cache';

// Fetch → cache → `{ [dataKey]: data, fetchedAt }`, or `{ error, fetchedAt }`
// on failure. Key order matches the previously inlined shape exactly
// (data key first, fetchedAt second).
export async function cachedJson<T>(
  c: Context,
  cacheKey: string,
  ttlMs: number,
  dataKey: string,
  fetcher: () => Promise<T>,
) {
  try {
    const data = await fetcher();
    const entry = setCache(cacheKey, data, ttlMs);
    return c.json({ [dataKey]: data, fetchedAt: entry.fetchedAt });
  } catch (e: any) {
    return c.json({ error: e.message, fetchedAt: new Date().toISOString() });
  }
}
