import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { saveReferenzen } from '../../../../lib/website-db';
import type { ReferenzItem } from '../../../../lib/website-db';

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  const BRAND = process.env.BRAND || 'mentolder';

  if (request.headers.get('content-type')?.includes('application/json')) {
    const items = await request.json() as ReferenzItem[];
    await saveReferenzen(BRAND, items);
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  const form = await request.formData();
  const items: ReferenzItem[] = [];
  let i = 0;
  while (form.has(`ref_${i}_id`)) {
    const deleted = form.get(`ref_${i}_delete`) === '1';
    if (!deleted) {
      const name = (form.get(`ref_${i}_name`) as string)?.trim();
      if (name) items.push({
        id: (form.get(`ref_${i}_id`) as string) || crypto.randomUUID(),
        name,
        url: (form.get(`ref_${i}_url`) as string)?.trim() || undefined,
        logoUrl: (form.get(`ref_${i}_logoUrl`) as string)?.trim() || undefined,
        description: (form.get(`ref_${i}_description`) as string)?.trim() || undefined,
      });
    }
    i++;
  }
  const newName = (form.get('new_name') as string)?.trim();
  if (newName) items.push({
    id: crypto.randomUUID(),
    name: newName,
    url: (form.get('new_url') as string)?.trim() || undefined,
    logoUrl: (form.get('new_logoUrl') as string)?.trim() || undefined,
    description: (form.get('new_description') as string)?.trim() || undefined,
  });

  await saveReferenzen(BRAND, items);
  return redirect('/admin/referenzen?saved=1', 303);
};
