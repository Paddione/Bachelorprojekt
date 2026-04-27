import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { saveFaqContent } from '../../../../lib/website-db';
import type { FaqItem } from '../../../../lib/website-db';

const BRAND = process.env.BRAND || 'mentolder';

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  if (request.headers.get('content-type')?.includes('application/json')) {
    const items = await request.json() as FaqItem[];
    await saveFaqContent(BRAND, items);
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  }

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

  const items = rawItems.filter(item => item.question);
  const newQ = g('faq_new_question').trim();
  const newA = g('faq_new_answer').trim();
  if (newQ) items.push({ question: newQ, answer: newA });

  await saveFaqContent(BRAND, items);
  return redirect('/admin/faq?saved=1');
};
