import type { APIRoute } from 'astro';
import { requireOwner, ownerBusiness } from '../../../../../lib/owner-guard';
import { pool } from '../../../../../lib/messaging-db-pool';
import {
  TransitionError,
  toAppointmentRequest,
  transitionRequest,
  type InboxRowLike,
} from '../../../../../lib/appointment-requests';
import { berlinDayKey } from '../../../../../lib/caldav-cache';
import {
  addSlotToWhitelist,
  claimSlot,
  isSlotInAnyWindow,
  isSlotWhitelisted,
} from '../../../../../lib/website-db';
import { createCalendarEvent, getAllBookings } from '../../../../../lib/caldav';
import { appendNotifyLog, notifyEntryFromResult, readNotifyLog, sendNotify } from '../../../../../lib/appointment-notify';

const BRAND_FALLBACK = process.env.BRAND || 'mentolder';
const BRAND_NAME = process.env.BRAND_NAME || 'Workspace';
const SLOT_TAKEN = { error: 'Dieser Termin ist leider nicht mehr verfügbar.' };

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
    try {
      transitionRequest(req.state, 'bestaetigt');
    } catch (err) {
      if (!(err instanceof TransitionError)) throw err;
      return json({ error: 'Diese Anfrage wurde bereits bearbeitet.' }, { status: 409 });
    }

    // Slotless requests (callback without appointment) skip every slot check,
    // the slot claim and the calendar block, and go straight to confirmation.
    let start: Date | null = null;
    let end: Date | null = null;
    let claimedHere = false;
    if (req.slotStart !== null) {
      const s = new Date(req.slotStart);
      const e = req.slotEnd !== null ? new Date(req.slotEnd) : new Date(s.getTime() + 3600000);
      const now = new Date();
      if (Number.isNaN(s.getTime()) || s <= now) {
        return json({ error: 'Der gewünschte Termin liegt in der Vergangenheit.' }, { status: 409 });
      }
      if (berlinDayKey(s) <= berlinDayKey(now)) {
        return json({ error: 'Der Mindestvorlauf ist nicht mehr eingehalten. Anfragen sind nur bis zum Vortag möglich.' }, { status: 409 });
      }
      let inWindow = false;
      try {
        inWindow = await isSlotInAnyWindow(brand, s, e);
      } catch {
        inWindow = false;
      }
      if (!inWindow) {
        return json(SLOT_TAKEN, { status: 409 });
      }

      // Atomic availability recheck (mirrors booking.ts): only a present
      // whitelist row is consumed; a lost race answers 409.
      try {
        if (await isSlotWhitelisted(brand, s)) {
          claimedHere = await claimSlot(brand, s);
          if (!claimedHere) {
            return json({ error: 'Der Slot wurde gerade anderweitig vergeben.' }, { status: 409 });
          }
        }
      } catch {
        return json(SLOT_TAKEN, { status: 409 });
      }
      start = s;
      end = e;
    }

    let caldavUid: string | null = null;
    if (start !== null && end !== null) {
      let bookings;
      try {
        bookings = await getAllBookings();
      } catch (err) {
        if (claimedHere) await addSlotToWhitelist(brand, start, end);
        throw err;
      }
      const overlaps = bookings.some((b) => b.status !== 'CANCELLED' && b.start < end && b.end > start);
      if (overlaps) {
        if (claimedHere) await addSlotToWhitelist(brand, start, end);
        return json({ error: 'Der Termin überschneidet sich mit einer bestehenden Buchung.' }, { status: 409 });
      }
      const phonePart = req.phone !== null && req.phone !== '' ? `, ${req.phone}` : '';
      const created = await createCalendarEvent({
        summary: `${req.serviceName ?? 'Termin'} – ${req.name}`,
        description: `Anfrage #${req.id} von ${req.name} (${req.email}${phonePart})${req.message ? `: ${req.message}` : ''}`,
        start,
        end,
        attendeeEmail: req.email,
        attendeeName: req.name,
      });
      if (created === null) {
        if (claimedHere) await addSlotToWhitelist(brand, start, end);
        return json({ error: 'Kalender konnte nicht geschrieben werden.' }, { status: 502 });
      }
      caldavUid = created.uid;
    }

    // Atomic persist: the state guard in WHERE turns a parallel decision
    // into rowCount 0, so double POSTs stay idempotent.
    const merged = JSON.stringify({
      state: 'bestaetigt',
      outcome: 'bestaetigt',
      caldavUid,
      decidedAt: new Date().toISOString(),
      decidedBy: session.email ?? null,
    });
    const updated = await pool.query(
      `UPDATE inbox_items SET payload = payload || $1::jsonb,
       status = 'actioned', actioned_at = now(), actioned_by = $2
       WHERE id = $3 AND payload->>'state' = 'offen'`,
      [merged, session.email ?? null, req.id],
    );
    if ((updated.rowCount ?? 0) === 0) {
      if (claimedHere && start !== null && end !== null) {
        const current = await pool.query<{ state: string | null }>(
          `SELECT payload->>'state' AS state FROM inbox_items WHERE id = $1`,
          [req.id],
        );
        if (current.rows[0]?.state !== 'bestaetigt') {
          await addSlotToWhitelist(brand, start, end);
        }
      }
      return json({ error: 'Diese Anfrage wurde bereits bearbeitet.' }, { status: 409 });
    }

    const manageUrl = `${new URL(request.url).origin}/anfrage/${req.token}`;
    const rowPayload = rows.find((row) => row.id === req.id)?.payload ?? {};
    const result = await sendNotify(
      { request: req, kind: 'bestaetigung', manageUrl, brandName: BRAND_NAME },
      { request, log: readNotifyLog(rowPayload) },
    );
    if (!result.ok) {
      locals.requestLogger.warn({ requestId: req.id }, '[owner/anfragen/annehmen] confirmation mail failed');
    }
    try {
      const next = appendNotifyLog(rowPayload, notifyEntryFromResult(result));
      await pool.query(`UPDATE inbox_items SET payload = payload || $1::jsonb WHERE id = $2`, [JSON.stringify({ notify: next.notify }), req.id]);
    } catch (err) {
      locals.requestLogger.warn({ err, requestId: req.id }, '[owner/anfragen/annehmen] notify log persist failed');
    }
    return json({ success: true }, { status: 200 });
  } catch (err) {
    locals.requestLogger.error({ err }, '[owner/anfragen/annehmen]');
    return json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
};
