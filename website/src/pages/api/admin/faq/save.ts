import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { publishContent } from '../../../../lib/content-publish';
import { publishResultToResponse } from '../../../../lib/content-publish-handler';
import type { FaqItem } from '../../../../content-schema';

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
    let body: { payload: FaqItem[]; baseSha?: string };
    try {
      body = await request.json() as typeof body;
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON' });
    }
    const baseSha = typeof body.baseSha === 'string' && body.baseSha ? body.baseSha : null;
    try {
      const result = await publishContent({
        brand: BRAND, domain: 'faq', payload: body.payload, baseSha, editor,
      });
      return publishResultToResponse(result);
    } catch (e) {
      locals.requestLogger?.error?.({ e }, 'faq save failed');
      return jsonResponse(500, { error: 'publish failed' });
    }
  }

  // Legacy form-encoded path.
  const form = await request.formData();
  const g = (k: string) => (form.get(k) as string | null) ?? '';
  const count = Math.max(0, parseInt(g('faq_count') || '0', 10) || 0);
  const rawItems: FaqItem[] = Array.from({ length: count }, (_, i) => ({
    question: g(`faq_${i}_question`).trim(),
    answer: g(`faq_${i}_answer`).trim(),
  }));
  const moveUp = form.get('move_up');
  const moveDown = form.get('move_down');
  if (moveUp !== null) {
    const idx = parseInt(moveUp as string, 10);
    if (idx > 0 && idx < rawItems.length) [rawItems[idx - 1], rawItems[idx]] = [rawItems[idx], rawItems[idx - 1]];
  } else if (moveDown !== null) {
    const idx = parseInt(moveDown as string, 10);
    if (idx >= 0 && idx < rawItems.length - 1) [rawItems[idx], rawItems[idx + 1]] = [rawItems[idx + 1], rawItems[idx]];
  }
  const items = rawItems.filter((item) => item.question);
  const newQ = g('faq_new_question').trim();
  const newA = g('faq_new_answer').trim();
  if (newQ) items.push({ question: newQ, answer: newA });

  try {
    const result = await publishContent({
      brand: BRAND, domain: 'faq', payload: items, baseSha: null, editor,
    });
    if (result.ok) return redirect('/admin/faq?saved=1', 303);
    return publishResultToResponse(result);
  } catch (e) {
    locals.requestLogger?.error?.({ e }, 'faq save failed');
    return jsonResponse(500, { error: 'publish failed' });
  }
};
