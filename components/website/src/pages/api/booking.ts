import type { APIRoute } from 'astro';
import { createInboxItem } from '../../lib/messaging-db';
import { sendEmail } from '../../lib/email';
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
    const { name, email, phone, type, message, slotStart, slotEnd, slotDisplay, date, serviceKey, projectId, leistungKey } = await request.json();

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

    await createInboxItem({
      type: 'booking',
      payload: {
        name, email, phone: phone ?? null, type, typeLabel,
        slotStart: slotStart ?? null, slotEnd: slotEnd ?? null,
        slotDisplay: slotDisplay ?? null, date: date ?? null,
        serviceKey: serviceKey ?? null, serviceSnapshot,
        message: message ?? null,
        projectId: projectId ?? null, leistungKey: leistungKey ?? null,
      },
      isTestData: isE2ETestRequest(request),
    });

    // Confirmation email to user
    await sendEmail({
      to: email,
      subject: isCallback ? `Rückruf-Anfrage bei ${BRAND_NAME}` : `Terminanfrage: ${typeLabel} am ${dateFormatted}`,
      text: isCallback
        ? `Hallo ${name},\n\nvielen Dank für Ihre Rückruf-Anfrage bei ${BRAND_NAME}.\n\nWir melden uns in Kürze unter ${phone} bei Ihnen.\n\nMit freundlichen Grüßen\n${BRAND_NAME}`
        : `Hallo ${name},\n\nvielen Dank für Ihre Terminanfrage bei ${BRAND_NAME}.\n\nIhr gewünschter Termin:\n  Typ:     ${typeLabel}\n  Datum:   ${dateFormatted}\n  Uhrzeit: ${slotDisplay}\n\nWir prüfen Ihre Anfrage und melden uns in Kürze mit einer Bestätigung.\n\nMit freundlichen Grüßen\n${BRAND_NAME}`,
    }, request);

    // Admin notification
    const phoneInfo = phone ? `\nTelefon: ${phone}` : '';
    const adminText = isCallback
      ? `Neue Rückruf-Anfrage auf ${BRAND_NAME}.\n\nName: ${name}\nE-Mail: ${email}${phoneInfo}${message ? `\n\nAnmerkungen:\n${message}` : ''}`
      : `Neue Terminanfrage auf ${BRAND_NAME}.\n\nName: ${name}\nE-Mail: ${email}${phoneInfo}\nTyp: ${typeLabel}\nDatum: ${dateFormatted}\nUhrzeit: ${slotDisplay}${message ? `\n\nAnmerkungen:\n${message}` : ''}`;
    await sendAdminNotification({
      type: 'booking',
      subject: isCallback ? `[Rückruf] Anfrage von ${name}` : `[Terminanfrage: ${typeLabel}] ${name} am ${dateFormatted}`,
      text: adminText,
      html: `<p>${adminText.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`,
      replyTo: email,
    }, request);

    return new Response(
      JSON.stringify({ success: true }),
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
