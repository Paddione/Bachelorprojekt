const BEARER_RE = /Bearer\s+[A-Za-z0-9._\-+/=]+/g;
const PG_URL_RE = /(postgres(?:ql)?:\/\/)([^:@\s]+):([^@\s]+)(@)/g;
const EMAIL_RE  = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const MAX_LEN   = 2000;

export function sanitizeForLog(input: string | undefined | null): string {
  if (!input) return '';
  let out = String(input);
  out = out.replace(BEARER_RE, 'Bearer ***');
  out = out.replace(PG_URL_RE, '$1***:***$4');
  out = out.replace(EMAIL_RE, '***@***');
  if (out.length > MAX_LEN) {
    const suffix = '… [truncated]';
    out = out.slice(0, MAX_LEN - suffix.length) + suffix;
  }
  return out;
}
