import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { publishContent } from '../../../../lib/content-publish';
import { publishResultToResponse } from '../../../../lib/content-publish-handler';
import type { KontaktContent } from '../../../../content-schema';

const BRAND = process.env.BRAND || 'mentolder';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, redirect, locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });
  const editor = session.email ?? session.name ?? 'unknown';

  if (request.headers.get('content-type')?.includes('application/json')) {
    let body: { payload: KontaktContent; baseSha?: string };
    try {
      body = await request.json() as typeof body;
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON' });
    }
    const baseSha = typeof body.baseSha === 'string' && body.baseSha ? body.baseSha : null;
    try {
      const result = await publishContent({
        brand: BRAND, domain: 'kontakt', payload: body.payload, baseSha, editor,
      });
      return publishResultToResponse(result);
    } catch (e) {
      locals.requestLogger?.error?.({ e }, 'kontakt save failed');
      return jsonResponse(500, { error: 'publish failed' });
    }
  }

  // Legacy form-encoded path.
  const form = await request.formData();
  const g = (k: string) => (form.get(k) as string | null) ?? '';
  const payload: KontaktContent = {
    intro: g('intro'),
    sidebarTitle: g('sidebarTitle'),
    sidebarText: g('sidebarText'),
    sidebarCta: g('sidebarCta'),
    showPhone: form.get('showPhone') === '1',
  };
  try {
    const result = await publishContent({
      brand: BRAND, domain: 'kontakt', payload, baseSha: null, editor,
    });
    if (result.ok) return redirect('/admin/kontakt?saved=1', 303);
    return publishResultToResponse(result);
  } catch (e) {
    locals.requestLogger?.error?.({ e }, 'kontakt save failed');
    return jsonResponse(500, { error: 'publish failed' });
  }
};
