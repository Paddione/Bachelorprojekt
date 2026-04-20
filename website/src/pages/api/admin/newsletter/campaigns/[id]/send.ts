import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import {
  getCampaign,
  getConfirmedSubscribers,
  markCampaignSent,
  createSendLog,
} from '../../../../../../lib/newsletter-db';
import { sendNewsletterCampaign } from '../../../../../../lib/email';

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

  const subscribers = await getConfirmedSubscribers();
  if (subscribers.length === 0) {
    return new Response(JSON.stringify({ error: 'Keine bestätigten Abonnenten vorhanden' }), { status: 400 });
  }

  const prodDomain = process.env.PROD_DOMAIN || '';
  const baseUrl = prodDomain ? `https://web.${prodDomain}` : 'http://web.localhost';

  let sent = 0;
  for (const sub of subscribers) {
    const unsubscribeUrl = `${baseUrl}/api/newsletter/unsubscribe?token=${sub.unsubscribe_token}`;
    const ok = await sendNewsletterCampaign({
      to: sub.email,
      subject: campaign.subject,
      html: campaign.html_body,
      unsubscribeUrl,
    });
    await createSendLog({
      campaignId: id,
      subscriberId: sub.id,
      status: ok ? 'sent' : 'failed',
    });
    if (ok) sent++;
  }

  await markCampaignSent(id, sent);

  return new Response(JSON.stringify({ ok: true, sent, total: subscribers.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
