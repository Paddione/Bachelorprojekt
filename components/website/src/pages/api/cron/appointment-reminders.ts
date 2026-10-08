// components/website/src/pages/api/cron/appointment-reminders.ts
// Called by K8s CronJob hourly. Sends one 24h reminder per confirmed
// appointment via the notify lib (dedupe + retry + log).
import type { APIRoute } from 'astro';
import { pool } from '../../../lib/messaging-db-pool';
import {
  toAppointmentRequest,
  type InboxRowLike,
} from '../../../lib/appointment-requests';
import {
  appendNotifyLog,
  isReminderDue,
  notifyEntryFromResult,
  notifyManageUrl,
  readNotifyLog,
  sendNotify,
} from '../../../lib/appointment-notify';
import { errorResponse } from '../_errors';

const BRAND_NAME = process.env.BRAND_NAME || 'Workspace';

interface ReminderCandidate extends InboxRowLike {
  slot_start: string | null;
}

export const POST: APIRoute = async ({ request, locals }) => {
  // Fail-closed bearer check (error-log-retention pattern): a missing
  // CRON_SECRET never opens the endpoint.
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization') ?? '';
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    // Candidates: confirmed appointments in ~24h without a reminder marker.
    // Only 'bestaetigt' rows are selected — 'offen', 'abgelehnt' and
    // 'storniert' never enter the send path (rechecked per row below).
    const { rows } = await pool.query<ReminderCandidate>(
      `SELECT id, brand, payload, payload->>'slotStart' AS slot_start
       FROM inbox_items
       WHERE type = 'booking'
         AND payload->>'state' = 'bestaetigt'
         AND payload->>'reminderSentAt' IS NULL
         AND (payload->>'slotStart')::timestamptz > NOW() + INTERVAL '23 hours'
         AND (payload->>'slotStart')::timestamptz <= NOW() + INTERVAL '25 hours'`,
    );

    let remindersSent = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of rows) {
      const req = toAppointmentRequest(row);
      // Second state gate: only bestaetigt is reminded; offen, abgelehnt
      // and storniert rows (or legacy rows without a request) are skipped.
      if (req === null || req.state !== 'bestaetigt') {
        skipped += 1;
        continue;
      }
      if (req.slotStart === null || !isReminderDue(req.slotStart)) {
        skipped += 1;
        continue;
      }
      // Atomic claim: exactly one run wins the marker per request.
      const claimed = await pool.query(
        `UPDATE inbox_items SET payload = payload || $1::jsonb
         WHERE id = $2 AND payload->>'reminderSentAt' IS NULL`,
        [JSON.stringify({ reminderSentAt: new Date().toISOString() }), req.id],
      );
      if ((claimed.rowCount ?? 0) === 0) {
        skipped += 1;
        continue;
      }
      const result = await sendNotify(
        { request: req, kind: 'erinnerung', manageUrl: notifyManageUrl(req.token), brandName: BRAND_NAME },
        { request, log: readNotifyLog(row.payload) },
      );
      if (result.attempts === 0) {
        // Dedupe hit: already sent, nothing went out in this run.
        skipped += 1;
        continue;
      }
      if (result.ok) {
        const next = appendNotifyLog(row.payload, notifyEntryFromResult(result));
        await pool.query(`UPDATE inbox_items SET payload = payload || $1::jsonb WHERE id = $2`, [JSON.stringify({ notify: next.notify }), req.id]);
        remindersSent += 1;
      } else {
        // Release the marker so the next hourly run retries; keep the
        // failed entry in the log for owner visibility + resend.
        const next = appendNotifyLog(row.payload, notifyEntryFromResult(result));
        await pool.query(
          `UPDATE inbox_items SET payload = (payload - 'reminderSentAt') || $1::jsonb WHERE id = $2`,
          [JSON.stringify({ notify: next.notify }), req.id],
        );
        failed += 1;
        locals.requestLogger.warn({ requestId: req.id, error: result.error }, '[appointment-reminders] send failed');
      }
    }

    locals.requestLogger.info(`[appointment-reminders] Sent ${remindersSent} reminders (${skipped} skipped, ${failed} failed)`);
    return new Response(JSON.stringify({ remindersSent, skipped, failed }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    locals.requestLogger.error({ err }, '[appointment-reminders]');
    return errorResponse('Internal error', locals.requestId);
  }
};
