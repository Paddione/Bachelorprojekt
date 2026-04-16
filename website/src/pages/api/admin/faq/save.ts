import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { saveFaqContent } from '../../../../lib/website-db';
import type { FaqItem } from '../../../../lib/website-db';

const BRAND = process.env.BRAND || 'mentolder';

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  const form = await request.formData();
  const g = (k: string) => (form.get(k) as string | null) ?? '';

  const count = parseInt(g('faq_count') || '0', 10);
  let items: FaqItem[] = Array.from({ length: count }, (_, i) => ({
    question: g(`faq_${i}_question`).trim(),
    answer: g(`faq_${i}_answer`).trim(),
  })).filter(item => item.question);

  // Move up/down
  const moveUp = form.get('move_up');
  const moveDown = form.get('move_down');
  if (moveUp !== null) {
    const idx = parseInt(moveUp as string, 10);
    if (idx > 0) [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]];
  } else if (moveDown !== null) {
    const idx = parseInt(moveDown as string, 10);
    if (idx < items.length - 1) [items[idx], items[idx + 1]] = [items[idx + 1], items[idx]];
  }

  // New entry
  const newQ = g('faq_new_question').trim();
  const newA = g('faq_new_answer').trim();
  if (newQ) items.push({ question: newQ, answer: newA });

  await saveFaqContent(BRAND, items);
  return redirect('/admin/faq?saved=1');
};
