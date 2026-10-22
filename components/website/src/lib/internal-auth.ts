// Constant-time gate for internal-only API routes (e.g. /api/meeting/*).
// The talk-transcriber in the cluster calls these routes with INTERNAL_API_TOKEN
// (shared secret, available to the website via website-secrets).
// Fail closed: a missing/empty expected token denies everything.
// Comparisons use timingSafeEqual (F7) — never `===` on secrets.
import { timingSafeEqual } from 'node:crypto';

function safeEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * True when the request carries `expected` via `Authorization: Bearer …`
 * or `x-internal-token: …`. An empty `expected` never matches (fail closed).
 */
export function matchesInternalToken(request: Request, expected: string): boolean {
  if (!expected) return false;
  const auth = request.headers.get('authorization') ?? '';
  if (auth.startsWith('Bearer ')) {
    if (safeEqual(auth.slice('Bearer '.length).trim(), expected)) return true;
  }
  const xToken = request.headers.get('x-internal-token') ?? '';
  if (xToken && safeEqual(xToken, expected)) return true;
  return false;
}

/** 401 JSON denial for internal-only routes. */
export function internalUnauthorized(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
