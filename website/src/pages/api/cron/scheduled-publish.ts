import type { APIRoute } from 'astro';
import {
  listDueCampaignIds,
  lockDueCampaign,
  unlockCampaignToScheduled,
  resetStaleSendingCampaigns,
  sendCampaignById,
} from '../../../lib/newsletter-db';

const CRON_SECRET = process.env.CRON_SECRET ?? '';

export const GET: APIRoute = async ({ request }) => {
  const auth = request.headers.get('authorization') ?? '';
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const reset = await resetStaleSendingCampaigns();
    if (reset > 0) console.log(`[scheduled-publish] reset ${reset} stale sending campaigns`);

    const dueIds = await listDueCampaignIds();
    let processed = 0;
    let sent = 0;
    const errors: { id: string; error: string }[] = [];

    for (const id of dueIds) {
      const locked = await lockDueCampaign(id);
      if (!locked) continue;
      processed++;
      try {
        const result = await sendCampaignById(id);
        if (result.success) {
          sent++;
        } else {
          await unlockCampaignToScheduled(id);
          errors.push({ id, error: result.error ?? 'Versand fehlgeschlagen' });
        }
      } catch (err) {
        await unlockCampaignToScheduled(id);
        errors.push({ id, error: err instanceof Error ? err.message : String(err) });
      }
    }

    console.log(`[scheduled-publish] processed=${processed} sent=${sent} errors=${errors.length}`);
    return new Response(JSON.stringify({ processed, sent, errors }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[scheduled-publish]', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
};
