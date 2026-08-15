// Shared admin-save handler for content domains (T001490 Task 7).
//
// All content save endpoints route their body through `publishContent`
// (no direct `site_settings` / `homepage_block_documents` writes). The
// publish pipeline handles Zod validation (422), blob-SHA optimistic
// concurrency (409), and the GitHub bot PR + squash-auto-merge flow.
//
// This helper extracts the auth check, JSON body parsing, and the
// `PublishResult → HTTP` mapping so each `save.ts` endpoint stays a
// small, focused wrapper that just identifies its content domain.
import type { APIContext } from 'astro';
import { getSession, isAdmin } from './auth';
import { publishContent, type PublishResult, type GitHubClient } from './content-publish';
import type { Domain } from '../content-schema';

export interface AdminSaveInput {
  brand: string;
  domain: Domain;
  /** Optional injectable client (tests). */
  client?: GitHubClient;
  /** Optional baseSha (legacy `baseVersion` callers can pass `null`). */
  baseSha?: string | null;
}

export interface AdminSaveBody {
  payload: unknown;
  baseSha?: string | null;
}

export interface AdminSaveSuccess {
  ok: true;
  sha: string;
  prNumber: number;
  prUrl: string;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Read+parse the JSON body. Accepts `{ payload, baseSha }` (preferred) or
 * a raw value (treated as `payload` with `baseSha` = null).
 */
async function readBody(request: Request): Promise<AdminSaveBody | null> {
  try {
    const raw = await request.json() as unknown;
    if (raw && typeof raw === 'object' && 'payload' in (raw as Record<string, unknown>)) {
      const r = raw as { payload: unknown; baseSha?: unknown };
      const baseSha = typeof r.baseSha === 'string' && r.baseSha ? r.baseSha : null;
      return { payload: r.payload, baseSha };
    }
    return { payload: raw, baseSha: null };
  } catch {
    return null;
  }
}

/**
 * Map a `PublishResult` to an HTTP response. Shared by every content
 * save endpoint. The contract is:
 *   200 → `{ ok: true, sha, prNumber, prUrl }`
 *   409 → `{ ok: false, currentSha, currentValue }`
 *   422 → `{ ok: false, errors }`
 */
export function publishResultToResponse(result: PublishResult): Response {
  if (result.ok) {
    return jsonResponse(200, {
      ok: true,
      sha: result.sha,
      prNumber: result.prNumber,
      prUrl: result.prUrl,
    });
  }
  if (result.status === 409) {
    return jsonResponse(409, {
      ok: false,
      currentSha: result.currentSha,
      currentValue: result.currentValue,
    });
  }
  return jsonResponse(422, { ok: false, errors: result.errors });
}

/**
 * Handle one admin-save POST. Returns the HTTP response; the caller
 * only needs to forward it.
 *
 * Flow:
 *   1. Authn — `getSession` + `isAdmin` (401 on fail)
 *   2. Parse body — JSON `{ payload, baseSha? }` (400 on bad JSON)
 *   3. `publishContent` → Zod 422 / GitHub 409 / PR success 200
 */
export async function handleAdminSave(
  ctx: APIContext,
  input: AdminSaveInput,
): Promise<Response> {
  const { request, locals } = ctx;
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }
  const body = await readBody(request);
  if (!body) {
    return jsonResponse(400, { error: 'Invalid JSON' });
  }
  const editor = session.email ?? session.name ?? 'unknown';
  const baseSha = body.baseSha ?? input.baseSha ?? null;
  try {
    const result = await publishContent({
      brand: input.brand,
      domain: input.domain,
      payload: body.payload,
      baseSha,
      editor,
      client: input.client,
    });
    return publishResultToResponse(result);
  } catch (e) {
    locals.requestLogger?.error({ e }, `${input.domain} save failed`);
    return jsonResponse(500, { error: 'publish failed' });
  }
}
