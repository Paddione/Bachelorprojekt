/**
 * Access gate for anonymous ticket comments (F6).
 *
 * Session forms live on *.sessions.mentolder.de and POST here cross-origin
 * without a login cookie. Admin UI (TicketQuickEdit) always sends a session.
 *
 * Rules:
 * - admin session → everything allowed (create + comment any ticket)
 * - anonymous creation (no ticketId) → allowed, rate-limited at the route
 *   (session-form flow: every submission becomes its own ticket)
 * - anonymous comment on an EXISTING ticket → only from an allowlisted
 *   Origin/Referer (the hosted session forms), enforced server-side.
 *   Header forgery via curl remains possible but is rate-limited;
 *   blind enumeration scripts and cross-site abuse are blocked.
 */

// Session-forms live on *.sessions.mentolder.de and POST here cross-origin.
export const COMMENT_CORS_ORIGINS: RegExp[] = [
  /^https?:\/\/session-[a-z0-9-]+\.sessions\.mentolder\.de$/,
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
];

export type CommentVerdict = { allow: true } | { allow: false; status: 401 | 403 };

export function checkCommentAccess(opts: {
  origin: string | null;
  referer: string | null;
  hasSession: boolean;
  hasTicketId: boolean;
}): CommentVerdict {
  if (opts.hasSession) return { allow: true };
  if (!opts.hasTicketId) return { allow: true };
  const known = COMMENT_CORS_ORIGINS.some(
    re => re.test(opts.origin ?? '') || re.test(opts.referer ?? ''),
  );
  if (known) return { allow: true };
  return { allow: false, status: 403 };
}
