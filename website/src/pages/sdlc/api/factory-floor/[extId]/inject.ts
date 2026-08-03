import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { insertInjection, type InjectionKind, type Phase } from '../../../../lib/factory-floor';

export const prerender = false;

const KINDS = new Set<InjectionKind>(['context', 'note', 'asset']);
const PHASES = new Set(['scout', 'design', 'plan', 'implement', 'verify', 'deploy']);
const CONTENT_CAP = 8 * 1024;          // ~8 KB text
const DATAURL_CAP = 14 * 1024 * 1024;  // ~10 MB binary base64-expanded

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export const POST: APIRoute = async ({ request, params , locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return json({ error: 'Unauthorized' }, 401);

  const extId = params.extId ?? '';
  if (!extId) return json({ error: 'extId missing' }, 400);

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return json({ error: 'invalid JSON' }, 400); }

  const kind = body.kind as InjectionKind;
  if (!KINDS.has(kind)) return json({ error: 'kind must be context|note|asset' }, 400);
  const phase = body.phase as Phase | undefined;
  if (phase != null && !PHASES.has(phase)) return json({ error: 'invalid phase' }, 400);

  const content = typeof body.content === 'string' ? body.content : null;
  if (content && content.length > CONTENT_CAP) return json({ error: 'content too large' }, 413);

  const file = body.file as { filename?: string; mimeType?: string; dataUrl?: string } | undefined;
  if (kind === 'asset') {
    const ncPath = body.ncPath as string | undefined;
    if (!file?.dataUrl && !ncPath) return json({ error: 'asset requires file.dataUrl or ncPath' }, 400);
    if (file?.dataUrl && !/^data:[\w.+-]+\/[\w.+-]+;base64,/.test(file.dataUrl)) return json({ error: 'invalid data URL' }, 400);
    if (file?.dataUrl && file.dataUrl.length > DATAURL_CAP) return json({ error: 'asset too large' }, 413);
  }

  const targetFiles = Array.isArray(body.targetFiles)
    ? body.targetFiles.filter((s: unknown) => typeof s === 'string').slice(0, 50)
    : null;

  try {
    const ncPath = body.ncPath as string | undefined;
    const title = body.title as string | undefined;
    const created = await insertInjection({
      extId, kind, phase: phase ?? null,
      title: typeof title === 'string' ? title.slice(0, 200) : null,
      content, targetFiles,
      dataUrl: file?.dataUrl ?? null, ncPath: ncPath ?? null,
      filename: file?.filename ?? null, mimeType: file?.mimeType ?? null,
      injectedBy: session.preferred_username ?? 'admin',
    });
    if (!created) return json({ error: 'ticket not found' }, 404);
    return json({ ok: true, id: created.id }, 201);
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/factory-floor/[extId]/inject]');
    return json({ error: 'insert_failed' }, 500);
  }
};
