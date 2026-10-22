import { timingSafeEqual } from 'node:crypto';

/**
 * Internal-caller gate for machine-to-machine routes (F4).
 *
 * Callers (talk-transcriber, admin inbox action) send
 * `Authorization: Bearer <MEETING_INTERNAL_TOKEN>`. Human browser flows
 * never hit these routes directly.
 *
 * Returns `null` when the caller is authorized, otherwise a `Response`
 * to return as-is: 503 when the server is misconfigured (env missing —
 * fail closed, never open), 401 for missing/wrong credentials.
 */
export function requireInternalToken(request: Request): Response | null {
  const expected = process.env.MEETING_INTERNAL_TOKEN;
  if (!expected) {
    return new Response(JSON.stringify({ error: 'Internal auth not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer (.+)$/.exec(header);
  const provided = match?.[1] ?? '';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}
