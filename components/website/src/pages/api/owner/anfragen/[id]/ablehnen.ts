import type { APIRoute } from 'astro';
import { requireOwner, ownerBusiness } from '../../../../../lib/owner-guard';
import { pool } from '../../../../../lib/messaging-db-pool';
import {
  TransitionError,
  toAppointmentRequest,
  transitionRequest,
  type InboxRowLike,
} from '../../../../../lib/appointment-requests';
import { addSlotToWhitelist } from '../../../../../lib/website-db';
import { appendNotifyLog, notifyEntryFromResult, readNotifyLog, sendNotify } from '../../../../../lib/appointment-notify';

const BRAND_FALLBACK = process.env.BRAND || 'mentolder';
const BRAND_NAME = process.env.BRAND_NAME || 'Workspace';

/** Reads a JSON or HTML-form body into a plain object. */
async function readBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await request.json()) as Record<string, unknown>;
  }
  const form = await request.formData();
  const out: Record<string, unknown> = {};
  form.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function json(body: Record<string, unknown>, init: { status: number }): Response {
  return new Response(JSON.stringify(body), {
    status: init.status,
    headers: { 'Content-Type': 'application/json' },
  });
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
    const req = rows.map((row) => toAppointmentRequest(row)).find((r) => r !== null) ?? null;
    if (req === null) {
      return json({ error: 'Anfrage nicht gefunden.' }, { status: 404 });
    }
    if (req.brand !== null && req.brand !== brand) {
      return json({ error: 'Anfrage nicht gefunden.' }, { status: 404 });
    }

    let body: Record<string, unknown>;
    try {
      body = await readBody(request);
    } catch {
      return json({ error: 'Die Anfrage konnte nicht verarbeitet werden.' }, { status: 400 });
    }
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (note.length > 1000) {
      return json({ error: 'Notiz maximal 1000 Zeichen.' }, { status: 400 });
    }

    try {
      transitionRequest(req.state, 'abgelehnt');
    } catch (err) {
      if (!(err instanceof TransitionError)) throw err;
      return json({ error: 'Diese Anfrage wurde bereits bearbeitet.' }, { status: 409 });
    }

    const merged = JSON.stringify({
      state: 'abgelehnt',
      outcome: 'abgelehnt',
      decidedAt: new Date().toISOString(),
      decidedBy: session.email ?? null,
      declineNote: note === '' ? null : note,
    });
    const updated = await pool.query(
      `UPDATE inbox_items SET payload = payload || $1::jsonb,
       status = 'actioned', actioned_at = now(), actioned_by = $2
       WHERE id = $3 AND payload->>'state' = 'offen'`,
      [merged, session.email ?? null, req.id],
    );
    if ((updated.rowCount ?? 0) === 0) {
      return json({ error: 'Diese Anfrage wurde bereits bearbeitet.' }, { status: 409 });
    }
    if (req.slotClaimed && req.slotStart !== null && req.slotEnd !== null) {
      // Declining consumes no slot: hand back the row the creation path
      // took so the slot stays bookable for other requests.
      await addSlotToWhitelist(BRAND_FALLBACK, new Date(req.slotStart), new Date(req.slotEnd));
    }

    const manageUrl = `${new URL(request.url).origin}/anfrage/${req.token}`;
    const rowPayload = rows.find((row) => row.id === req.id)?.payload ?? {};
    const result = await sendNotify(
      { request: req, kind: 'absage', manageUrl, note, brandName: BRAND_NAME },
      { request, log: readNotifyLog(rowPayload) },
    );
    if (!result.ok) {
      locals.requestLogger.warn({ requestId: req.id }, '[owner/anfragen/ablehnen] rejection mail failed');
    }
    try {
      const next = appendNotifyLog(rowPayload, notifyEntryFromResult(result));
      await pool.query(`UPDATE inbox_items SET payload = payload || $1::jsonb WHERE id = $2`, [JSON.stringify({ notify: next.notify }), req.id]);
    } catch (err) {
      locals.requestLogger.warn({ err, requestId: req.id }, '[owner/anfragen/ablehnen] notify log persist failed');
    }
    return json({ success: true }, { status: 200 });
  } catch (err) {
    locals.requestLogger.error({ err }, '[owner/anfragen/ablehnen]');
    return json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
};
