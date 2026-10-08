import type { APIRoute } from 'astro';
import { requireOwner, ownerBusiness } from '../../../../../lib/owner-guard';
import { pool } from '../../../../../lib/messaging-db-pool';
import {
  toAppointmentRequest,
  type InboxRowLike,
} from '../../../../../lib/appointment-requests';
import {
  appendNotifyLog,
  lastFailedNotifyKind,
  notifyEntryFromResult,
  notifyStatusFor,
  readNotifyLog,
  sendNotify,
} from '../../../../../lib/appointment-notify';

const BRAND_FALLBACK = process.env.BRAND || 'mentolder';
const BRAND_NAME = process.env.BRAND_NAME || 'Workspace';

function json(body: Record<string, unknown>, init: { status: number }): Response {
  return new Response(JSON.stringify(body), {
    status: init.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export const POST: APIRoute = async ({ request, params, locals }) => {
  const session = await requireOwner(request.headers.get('cookie'));
  if (!session) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  const brand = ownerBusiness(session).brand ?? BRAND_FALLBACK;
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return json({ error: 'Anfrage nicht gefunden.' }, { status: 404 });
  }

  try {
    const { rows } = await pool.query<InboxRowLike>(
      `SELECT id, brand, payload FROM inbox_items
       WHERE id = $1 AND type = 'booking' LIMIT 1`,
      [id],
    );
    const row = rows.find((candidate) => candidate.id === id) ?? null;
    const req = row !== null ? toAppointmentRequest(row) : null;
    if (req === null || row === null) {
      return json({ error: 'Anfrage nicht gefunden.' }, { status: 404 });
    }
    if (req.brand !== null && req.brand !== brand) {
      return json({ error: 'Anfrage nicht gefunden.' }, { status: 404 });
    }
    if (notifyStatusFor(row.payload) !== 'fehlgeschlagen') {
      return json({ error: 'Nur fehlgeschlagene Nachrichten können erneut gesendet werden.' }, { status: 409 });
    }
    const kind = lastFailedNotifyKind(row.payload);
    if (kind === null) {
      return json({ error: 'Nur fehlgeschlagene Nachrichten können erneut gesendet werden.' }, { status: 409 });
    }

    const manageUrl = `${new URL(request.url).origin}/anfrage/${req.token}`;
    const note = asString(row.payload.declineNote) ?? '';
    const typeLabel = asString(row.payload.typeLabel) ?? undefined;
    const result = await sendNotify(
      { request: req, kind, manageUrl, note, typeLabel, brandName: BRAND_NAME },
      { request, log: readNotifyLog(row.payload) },
    );
    const next = appendNotifyLog(row.payload, notifyEntryFromResult(result));
    await pool.query(`UPDATE inbox_items SET payload = payload || $1::jsonb WHERE id = $2`, [JSON.stringify({ notify: next.notify }), req.id]);
    if (!result.ok) {
      locals.requestLogger.warn({ requestId: req.id }, '[owner/anfragen/resend] resend failed');
      return json({ error: 'Die Nachricht konnte nicht erneut gesendet werden.' }, { status: 502 });
    }
    return json({ success: true }, { status: 200 });
  } catch (err) {
    locals.requestLogger.error({ err }, '[owner/anfragen/resend]');
    return json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
};
