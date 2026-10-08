import type { APIRoute } from 'astro';
import { pool } from '../../../../lib/messaging-db-pool';
import {
  TransitionError,
  generateRequestToken,
  getAppointmentRequestByToken,
  isValidRequestTokenFormat,
  transitionRequest,
  type InboxRowLike,
} from '../../../../lib/appointment-requests';
import { berlinDayKey, berlinWallMinutes } from '../../../../lib/caldav-cache';
import {
  addSlotToWhitelist,
  claimSlot,
  isSlotInAnyWindow,
  isSlotWhitelisted,
} from '../../../../lib/website-db';
import { createInboxItem } from '../../../../lib/messaging-db';
import { sendAdminNotification } from '../../../../lib/notifications';
import { checkRateLimit, getClientIp } from '../../../../lib/rate-limit';
import { isE2ETestRequest } from '../../../../lib/e2e-marker';

const BRAND = process.env.BRAND || 'mentolder';
const NOT_FOUND = { error: 'Nicht gefunden.' };
const SLOT_TAKEN = { error: 'Dieser Termin ist leider nicht mehr verfügbar.' };

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

function wallDisplay(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export const POST: APIRoute = async ({ request, params, locals }) => {
  const ip = getClientIp(request);
  if (!checkRateLimit(`anfrage-umbuchung:${ip}`, 5, 60_000)) {
    return json({ error: 'Zu viele Anfragen. Bitte warten Sie einen Moment.' }, { status: 429 });
  }
  try {
    const token = params.token;
    if (!isValidRequestTokenFormat(token)) return json(NOT_FOUND, { status: 404 });
    const { rows } = await pool.query<InboxRowLike>(
      `SELECT id, brand, payload FROM inbox_items
       WHERE type = 'booking' AND reference_id = $1 LIMIT 1`,
      [token],
    );
    const req = getAppointmentRequestByToken(rows, token);
    if (req === null) return json(NOT_FOUND, { status: 404 });

    try {
      transitionRequest(req.state, 'storniert');
    } catch (err) {
      if (!(err instanceof TransitionError)) throw err;
      return json({ error: 'Diese Anfrage kann nicht mehr umgebucht werden.' }, { status: 409 });
    }

    let body: Record<string, unknown>;
    try {
      body = await readBody(request);
    } catch {
      return json({ error: 'Die Anfrage konnte nicht verarbeitet werden.' }, { status: 400 });
    }
    const slotStartRaw = typeof body.slotStart === 'string' ? body.slotStart : '';
    const slotEndRaw = typeof body.slotEnd === 'string' ? body.slotEnd : '';
    const start = new Date(slotStartRaw);
    const end = new Date(slotEndRaw);
    if (slotStartRaw === '' || slotEndRaw === '' || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return json({ error: 'Bitte wählen Sie einen Termin.' }, { status: 400 });
    }

    // Berlin previous-day rule, same strict-after semantics as booking.ts.
    const slotDayKey = berlinDayKey(start);
    const nowDayKey = berlinDayKey(new Date());
    if (slotDayKey <= nowDayKey) {
      return json(SLOT_TAKEN, { status: 409 });
    }
    let inWindow = false;
    try {
      inWindow = await isSlotInAnyWindow(BRAND, start, end);
    } catch {
      inWindow = false;
    }
    if (!inWindow) {
      return json(SLOT_TAKEN, { status: 409 });
    }

    // Mirror the creation path: consume a released row for the new slot so
    // concurrent reschedules race on DELETE…RETURNING and one of them wins.
    let newSlotClaimed = false;
    try {
      if (await isSlotWhitelisted(BRAND, start)) {
        newSlotClaimed = await claimSlot(BRAND, start);
        if (!newSlotClaimed) return json(SLOT_TAKEN, { status: 409 });
      }
    } catch {
      return json(SLOT_TAKEN, { status: 409 });
    }

    // New open request linked to the old one — never a silent overwrite.
    // The service snapshot is copied frozen; the catalogue is not re-read.
    const newToken = generateRequestToken();
    const oldRow = rows.find((row) => row.payload.token === token);
    const oldPayload: Record<string, unknown> = oldRow?.payload ?? {};
    const newDisplay = `${wallDisplay(berlinWallMinutes(start))} - ${wallDisplay(berlinWallMinutes(end))}`;
    await createInboxItem({
      type: 'booking',
      referenceId: newToken,
      payload: {
        name: req.name,
        email: req.email,
        phone: req.phone,
        type: typeof oldPayload.type === 'string' ? oldPayload.type : 'termin',
        typeLabel: typeof oldPayload.typeLabel === 'string' ? oldPayload.typeLabel : 'Termin vor Ort',
        slotStart: start.toISOString(),
        slotEnd: end.toISOString(),
        slotDisplay: newDisplay,
        date: berlinDayKey(start),
        serviceKey: req.serviceKey,
        serviceSnapshot: req.serviceSnapshot,
        message: req.message,
        token: newToken,
        state: 'offen',
        idempotencyKey: null,
        slotClaimed: newSlotClaimed,
        supersedesId: req.id,
      },
      isTestData: isE2ETestRequest(request),
    });

    const merged = JSON.stringify({
      state: 'storniert',
      outcome: 'storniert',
      cancelledAt: new Date().toISOString(),
      cancelNote: 'Durch Umbuchung ersetzt.',
    });
    await pool.query(
      `UPDATE inbox_items SET payload = payload || $1::jsonb,
       status = 'actioned', actioned_at = now()
       WHERE id = $2 AND payload->>'state' = $3`,
      [merged, req.id, req.state],
    );
    if (req.slotClaimed && req.slotStart !== null && req.slotEnd !== null) {
      await addSlotToWhitelist(BRAND, new Date(req.slotStart), new Date(req.slotEnd));
    }

    const oldInfo = req.slotDisplay ?? req.slotStart ?? 'Rückruf';
    await sendAdminNotification({
      type: 'booking',
      subject: `[Umbuchung] ${req.name}: ${oldInfo} → ${newDisplay}`,
      text: `Umbuchung einer Terminanfrage (alte Anfrage #${req.id} ist storniert).\n\nName: ${req.name}\nE-Mail: ${req.email}\nAlter Termin: ${oldInfo}\nNeuer Termin: ${newDisplay} (${berlinDayKey(start)})`,
      replyTo: req.email,
    }, request);

    return json({ success: true, status: 'offen', requestToken: newToken }, { status: 200 });
  } catch (err) {
    locals.requestLogger.error({ err }, '[anfrage/umbuchung]');
    return json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
};
