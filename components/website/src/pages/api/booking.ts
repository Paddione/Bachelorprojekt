import type { APIRoute } from 'astro';
import { createInboxItem } from '../../lib/messaging-db';
import { pool } from '../../lib/messaging-db-pool';
import {
  IdempotencyKeyError,
  generateRequestToken,
  resolveIdempotencyKey,
  toAppointmentRequest,
} from '../../lib/appointment-requests';
import { appendNotifyLog, notifyEntryFromResult, readNotifyLog, sendNotify } from '../../lib/appointment-notify';
import { sendAdminNotification } from '../../lib/notifications';
import { isSlotInAnyWindow, isSlotWhitelisted, claimSlot } from '../../lib/website-db';
import { berlinDayKey } from '../../lib/caldav-cache';
import { getEffectiveLeistungen } from '../../lib/content';
import { checkRateLimit, getClientIp } from '../../lib/rate-limit';
import { isE2ETestRequest } from '../../lib/e2e-marker';

const BRAND_NAME = process.env.BRAND_NAME || 'Workspace';
const BRAND = process.env.BRAND || 'mentolder';

const TYPE_LABELS: Record<string, string> = {
  erstgespraech: 'Kostenloses Erstgespräch',
  callback: 'Rückruf',
  meeting: 'Online-Meeting',
  termin: 'Termin vor Ort',
};

export const POST: APIRoute = async ({ request , locals }) => {
  const ip = getClientIp(request);
  if (!checkRateLimit(`booking:${ip}`, 5, 60_000)) {
    return new Response(JSON.stringify({ error: 'Zu viele Anfragen. Bitte warten Sie einen Moment.' }), {
      status: 429, headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const { name, email, phone, type, message, slotStart, slotEnd, slotDisplay, date, serviceKey, projectId, leistungKey, idempotencyKey: bodyKey } = await request.json();

    // Idempotency-Key: header wins over body (T901024). Invalid keys fail
    // with 400; a replay within 24h returns the original answer verbatim.
    let idempotencyKey: string | null;
    try {
      idempotencyKey = resolveIdempotencyKey(request.headers.get('Idempotency-Key'), bodyKey);
    } catch (err) {
      if (!(err instanceof IdempotencyKeyError)) throw err;
      return new Response(
        JSON.stringify({ error: 'Der Idempotency-Key ist ungültig.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (idempotencyKey !== null) {
      try {
        const { rows } = await pool.query<{ payload: Record<string, unknown>; reference_id: string | null }>(
          `SELECT payload, reference_id FROM inbox_items
           WHERE type = 'booking' AND payload->>'idempotencyKey' = $1
             AND created_at > now() - interval '24 hours'
           ORDER BY created_at DESC LIMIT 1`,
          [idempotencyKey],
        );
        const prev = rows[0];
        const prevToken = prev !== undefined
          ? (typeof prev.payload.token === 'string' ? prev.payload.token : prev.reference_id)
          : null;
        if (prev !== undefined && prevToken !== null) {
          return new Response(
            JSON.stringify({ success: true, requestToken: prevToken, state: 'offen' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
      } catch {
        // Dedupe lookup unavailable — proceed; the insert below fails loudly when the DB is down.
      }
    }

    const isCallback = type === 'callback';

    if (!name?.trim() || !email?.trim()) {
      return new Response(
        JSON.stringify({ error: 'Bitte füllen Sie alle Pflichtfelder aus.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (!isCallback && (!slotStart || !slotEnd)) {
      return new Response(
        JSON.stringify({ error: 'Bitte wählen Sie einen Termin.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Price/duration snapshot: freeze the catalogue entry at request time.
    // Later catalogue changes never touch the stored request.
    let serviceSnapshot: { key: string; name: string; price: string; durationMin: number | null } | null = null;
    if (serviceKey) {
      const catalogue = await getEffectiveLeistungen();
      const entry = catalogue.flatMap((cat) => cat.services).find((svc) => svc.key === serviceKey);
      if (!entry) {
        return new Response(
          JSON.stringify({ error: 'Unbekannte Leistung.' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      serviceSnapshot = {
        key: entry.key,
        name: entry.name,
        price: entry.price,
        durationMin: entry.durationMin ?? null,
      };
    }

    // Berlin previous-day rule: the Berlin slot date must be strictly after
    // the Berlin request date — same-day requests always fail with 409.
    // NOTE (T901024): isLeadTimeOk() in lib/appointment-requests.ts encodes
    // this same strict-after rule for new routes; the inline check stays
    // because the committed T901023 spec guards assert it in this file.
    if (!isCallback && slotStart && slotEnd) {
      const slotDayKey = berlinDayKey(new Date(slotStart));
      const nowDayKey = berlinDayKey(new Date());
      if (slotDayKey <= nowDayKey) {
        return new Response(
          JSON.stringify({ error: 'Dieser Termin ist leider nicht mehr verfügbar.' }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Validate that the requested slot falls within an admin-defined time window.
    if (!isCallback && slotStart && slotEnd) {
      let valid = false;
      try {
        valid = await isSlotInAnyWindow(BRAND, new Date(slotStart), new Date(slotEnd));
      } catch {
        // DB/table unavailable — treat slot as not whitelisted → 409 below
      }
      if (!valid) {
        return new Response(
          JSON.stringify({ error: 'Dieser Termin ist leider nicht mehr verfügbar.' }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Atomic overlap guard for released (whitelisted) slots: consume the row
    // immediately before the inbox insert, so concurrent double bookings race
    // on DELETE…RETURNING and exactly one of them wins. Window-validated
    // slots without a whitelist row stay bookable (released implicitly).
    // slotClaimed is stored in the payload so cancel paths can restore the row.
    let slotClaimed = false;
    if (!isCallback && slotStart && slotEnd) {
      let released = false;
      try {
        released = await isSlotWhitelisted(BRAND, new Date(slotStart));
      } catch {
        released = false;
      }
      if (released) {
        let claimed = false;
        try {
          claimed = await claimSlot(BRAND, new Date(slotStart));
        } catch {
          // DB unavailable mid-claim — fail closed like the window check above.
        }
        if (!claimed) {
          return new Response(
            JSON.stringify({ error: 'Dieser Termin ist leider nicht mehr verfügbar.' }),
            { status: 409, headers: { 'Content-Type': 'application/json' } }
          );
        }
        slotClaimed = true;
      }
    }

    if (isCallback && !phone?.trim()) {
      return new Response(
        JSON.stringify({ error: 'Bitte geben Sie eine Telefonnummer für den Rückruf an.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const typeLabel = TYPE_LABELS[type] || type;
    const dateFormatted = date
      ? new Date(date + 'T00:00:00').toLocaleDateString('de-DE', {
          weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
        })
      : '';

    // Request token (T901024): status/storno/umbuchung run through the
    // token link; the state starts unconfirmed (`offen`). The brand column
    // stays NULL like every other creation path (FK to public.brands).
    const requestToken = generateRequestToken();
    const manageUrl = `${new URL(request.url).origin}/anfrage/${requestToken}`;

    const requestPayload: Record<string, unknown> = {
      name, email, phone: phone ?? null, type, typeLabel,
      slotStart: slotStart ?? null, slotEnd: slotEnd ?? null,
      slotDisplay: slotDisplay ?? null, date: date ?? null,
      serviceKey: serviceKey ?? null, serviceSnapshot,
      message: message ?? null,
      projectId: projectId ?? null, leistungKey: leistungKey ?? null,
      token: requestToken, state: 'offen',
      idempotencyKey: idempotencyKey ?? null, slotClaimed,
    };
    const created = await createInboxItem({
      type: 'booking',
      referenceId: requestToken,
      payload: requestPayload,
      isTestData: isE2ETestRequest(request),
    });

    // Receipt mail to the guest via the notify lib (dedupe + retry + log).
    const guest = toAppointmentRequest({ id: created.id, brand: created.brand ?? null, payload: requestPayload });
    if (guest === null) {
      locals.requestLogger.warn('Booking notify skipped: unmappable row');
    } else {
      const result = await sendNotify(
        { request: guest, kind: 'eingang', manageUrl, typeLabel, brandName: BRAND_NAME },
        { request, log: readNotifyLog(requestPayload) },
      );
      const next = appendNotifyLog(requestPayload, notifyEntryFromResult(result));
      try {
        await pool.query(`UPDATE inbox_items SET payload = payload || $1::jsonb WHERE id = $2`, [JSON.stringify({ notify: next.notify }), created.id]);
      } catch (err) {
        locals.requestLogger.warn({ err }, 'Booking notify log persist failed');
      }
    }

    // Admin notification
    const phoneInfo = phone ? `\nTelefon: ${phone}` : '';
    const adminText = isCallback
      ? `Neue Rückruf-Anfrage auf ${BRAND_NAME}.\n\nName: ${name}\nE-Mail: ${email}${phoneInfo}${message ? `\n\nAnmerkungen:\n${message}` : ''}\n\nAnfrage-Token: ${requestToken}\nStatus-Link: ${manageUrl}`
      : `Neue Terminanfrage auf ${BRAND_NAME}.\n\nName: ${name}\nE-Mail: ${email}${phoneInfo}\nTyp: ${typeLabel}\nDatum: ${dateFormatted}\nUhrzeit: ${slotDisplay}${message ? `\n\nAnmerkungen:\n${message}` : ''}\n\nAnfrage-Token: ${requestToken}\nStatus-Link: ${manageUrl}`;
    await sendAdminNotification({
      type: 'booking',
      subject: isCallback ? `[Rückruf] Anfrage von ${name}` : `[Terminanfrage: ${typeLabel}] ${name} am ${dateFormatted}`,
      text: adminText,
      html: `<p>${adminText.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`,
      replyTo: email,
    }, request);

    return new Response(
      JSON.stringify({ success: true, requestToken, state: 'offen' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    locals.requestLogger.error({ err }, 'Booking error:');
    return new Response(
      JSON.stringify({ error: 'Interner Serverfehler.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
