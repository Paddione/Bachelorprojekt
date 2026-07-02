import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { publishContent } from '../../../../lib/content-publish';
import { publishResultToResponse } from '../../../../lib/content-publish-handler';
import type { UebermichContent } from '../../../../content-schema';

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
    let body: { payload: UebermichContent; baseSha?: string };
    try {
      body = await request.json() as typeof body;
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON' });
    }
    const baseSha = typeof body.baseSha === 'string' && body.baseSha ? body.baseSha : null;
    try {
      const result = await publishContent({
        brand: BRAND, domain: 'ueber-mich', payload: body.payload, baseSha, editor,
      });
      return publishResultToResponse(result);
    } catch (e) {
      locals.requestLogger?.error?.({ e }, 'uebermich save failed');
      return jsonResponse(500, { error: 'publish failed' });
    }
  }

  // Legacy form-encoded path.
  const form = await request.formData();
  const g = (k: string) => (form.get(k) as string | null) ?? '';

  const milestoneCount = parseInt(g('milestone_count') || '0', 10);
  const milestones = Array.from({ length: milestoneCount }, (_, i) => ({
    year: g(`ms_${i}_year`),
    title: g(`ms_${i}_title`),
    desc: g(`ms_${i}_desc`),
  }));
  const msNewYear = g('ms_new_year').trim();
  const msNewTitle = g('ms_new_title').trim();
  if (msNewYear || msNewTitle) {
    milestones.push({ year: msNewYear, title: msNewTitle, desc: g('ms_new_desc') });
  }

  const notDoingCount = parseInt(g('notdoing_count') || '0', 10);
  const notDoing = Array.from({ length: notDoingCount }, (_, i) => ({
    title: g(`nd_${i}_title`),
    text: g(`nd_${i}_text`),
  }));
  const ndNewTitle = g('nd_new_title').trim();
  if (ndNewTitle) notDoing.push({ title: ndNewTitle, text: g('nd_new_text') });

  const payload: UebermichContent = {
    subheadline: g('subheadline'),
    pageHeadline: g('pageHeadline'),
    introParagraphs: Array.from(
      { length: parseInt(g('intro_count') || '2', 10) },
      (_, i) => g(`intro_${i}`),
    ).filter(Boolean),
    sections: [0, 1].map((i) => ({ title: g(`sec_${i}_title`), content: g(`sec_${i}_content`) })),
    milestones,
    notDoing,
    privateText: g('privateText'),
  };

  try {
    const result = await publishContent({
      brand: BRAND, domain: 'ueber-mich', payload, baseSha: null, editor,
    });
    if (result.ok) return redirect('/admin/uebermich?saved=1', 303);
    return publishResultToResponse(result);
  } catch (e) {
    locals.requestLogger?.error?.({ e }, 'uebermich save failed');
    return jsonResponse(500, { error: 'publish failed' });
  }
};
