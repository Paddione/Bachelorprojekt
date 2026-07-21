import { nanoid } from 'nanoid';
import type { APIContext, MiddlewareNext } from 'astro';
import { createRequestLogger } from '../lib/logger';

const REQUEST_ID_HEADER = 'X-Request-ID';

export async function loggingMiddleware(
  context: APIContext,
  next: MiddlewareNext,
): Promise<Response> {
  const incoming = context.request.headers.get(REQUEST_ID_HEADER);
  const requestId = incoming && incoming.length > 0 ? incoming : nanoid(12);

  const url = new URL(context.request.url);
  const method = context.request.method;
  const path = url.pathname;

  const requestLogger = createRequestLogger({ requestId, method, path });
  context.locals.requestId = requestId;
  context.locals.requestLogger = requestLogger;

  const start = Date.now();
  requestLogger.info({ msg: 'request.start' });

  const response = await next();

  const durationMs = Date.now() - start;
  const statusCode = response.status;
  const logFields = { statusCode, durationMs, msg: 'request.end' };
  if (statusCode >= 500) requestLogger.error(logFields);
  else if (statusCode >= 400) requestLogger.warn(logFields);
  else requestLogger.info(logFields);

  // Clone headers before mutating — Astro's Node.js adapter may return a
  // Response whose headers are immutable (already committed to the stream).
  const headers = new Headers(response.headers);

  // Allow search-engine indexing for all public pages
  if (statusCode < 400) {
    headers.set('X-Robots-Tag', 'index, follow');
  }

  headers.set(REQUEST_ID_HEADER, requestId);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
