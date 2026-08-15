import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { getCampaign, sendCampaignById } from '../../../../../../lib/newsletter-db';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const { id } = params;
  if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });

  const campaign = await getCampaign(id);
  if (!campaign) {
    return new Response(JSON.stringify({ error: 'Kampagne nicht gefunden' }), { status: 404 });
  }
  if (campaign.status === 'sent') {
    return new Response(JSON.stringify({ error: 'Kampagne wurde bereits versendet' }), { status: 409 });
  }

  const result = await sendCampaignById(id);
  if (!result.success) {
    return new Response(JSON.stringify({ error: result.error ?? 'Versand fehlgeschlagen' }), { status: 400 });
  }
  return new Response(
    JSON.stringify({ ok: true, sent: result.recipientCount, total: result.recipientCount }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};
