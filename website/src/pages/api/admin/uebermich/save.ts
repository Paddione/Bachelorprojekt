import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { saveUebermichContent } from '../../../../lib/website-db';

const BRAND = process.env.BRAND || 'mentolder';

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

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
  if (ndNewTitle) {
    notDoing.push({ title: ndNewTitle, text: g('nd_new_text') });
  }

  await saveUebermichContent(BRAND, {
    subheadline: g('subheadline'),
    pageHeadline: g('pageHeadline'),
    introParagraphs: [g('intro_0'), g('intro_1')].filter(Boolean),
    sections: [0, 1].map(i => ({
      title: g(`sec_${i}_title`),
      content: g(`sec_${i}_content`),
    })),
    milestones,
    notDoing,
    privateText: g('privateText'),
  });

  return redirect('/admin/uebermich?saved=1');
};
