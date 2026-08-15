import type { APIRoute } from 'astro';
import {
  listDueCampaignIds,
  lockDueCampaign,
  unlockCampaignToScheduled,
  resetStaleSendingCampaigns,
  sendCampaignById,
} from '../../../lib/newsletter-db';
import { errorResponse } from '../_errors';

const CRON_SECRET = process.env.CRON_SECRET ?? '';

export const GET: APIRoute = async ({ request , locals }) => {
  const auth = request.headers.get('authorization') ?? '';
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return errorResponse('Unauthorized', locals.requestId, 401);
  }

  try {
    const reset = await resetStaleSendingCampaigns();
    if (reset > 0) locals.requestLogger.info(`[scheduled-publish] reset ${reset} stale sending campaigns`);

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

    locals.requestLogger.info(`[scheduled-publish] processed=${processed} sent=${sent} errors=${errors.length}`);
    return new Response(JSON.stringify({ processed, sent, errors }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    locals.requestLogger.error({ err }, '[scheduled-publish]');
    return errorResponse('Internal error', locals.requestId);
  }
};
