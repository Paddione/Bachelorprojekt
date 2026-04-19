// website/src/pages/api/admin/bookings/create.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { isSlotWhitelisted } from '../../../../lib/website-db';
import { createInboxItem } from '../../../../lib/messaging-db';
import { sendEmail } from '../../../../lib/email';

const BRAND_NAME = process.env.BRAND_NAME || 'Workspace';
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || '';

const TYPE_LABELS: Record<string, string> = {
  erstgespraech: 'Kostenloses Erstgespräch',
  callback: 'Rückruf',
  meeting: 'Online-Meeting',
  termin: 'Termin vor Ort',
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  if (!isAdmin(session)) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });

  try {
    const {
      clientEmail, clientName,
      type, leistungKey, projectId,
      slotStart, slotEnd, slotDisplay, date,
      phone, message,
    } = await request.json();

    const isCallback = type === 'callback';

    if (!clientEmail?.trim() || !clientName?.trim()) {
      return new Response(JSON.stringify({ error: 'clientEmail und clientName sind Pflichtfelder.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (!type || !leistungKey?.trim()) {
      return new Response(JSON.stringify({ error: 'Typ und Leistung sind Pflichtfelder.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (!isCallback && (!slotStart || !slotEnd)) {
      return new Response(JSON.stringify({ error: 'Bitte einen Termin wählen.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (isCallback && !phone?.trim()) {
      return new Response(JSON.stringify({ error: 'Telefonnummer ist bei Rückruf Pflicht.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    if (!isCallback && slotStart) {
      const whitelisted = await isSlotWhitelisted(BRAND_NAME, new Date(slotStart));
      if (!whitelisted) {
        return new Response(JSON.stringify({ error: 'Dieser Slot ist nicht freigegeben.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
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
        name: clientName,
        email: clientEmail,
        phone: phone ?? null,
        type,
        typeLabel,
        slotStart: slotStart ?? null,
        slotEnd: slotEnd ?? null,
        slotDisplay: slotDisplay ?? null,
        date: date ?? null,
        serviceKey: leistungKey,
        leistungKey,
        message: message ?? null,
        projectId: projectId ?? null,
        adminCreated: true,
      },
    });

    await sendEmail({
      to: clientEmail,
      subject: isCallback
        ? `Rückruf-Anfrage bei ${BRAND_NAME}`
        : `Terminbuchung: ${typeLabel} am ${dateFormatted}`,
      text: isCallback
        ? `Hallo ${clientName},\n\nIhr Termin wurde vom Admin eingetragen.\n\nWir melden uns in Kürze unter ${phone} bei Ihnen.\n\nMit freundlichen Grüßen\n${BRAND_NAME}`
        : `Hallo ${clientName},\n\nIhr Termin wurde vom Admin eingetragen.\n\nTyp:     ${typeLabel}\nDatum:   ${dateFormatted}\nUhrzeit: ${slotDisplay}\n\nMit freundlichen Grüßen\n${BRAND_NAME}`,
    });

    if (CONTACT_EMAIL) {
      await sendEmail({
        to: CONTACT_EMAIL,
        subject: isCallback
          ? `[Admin-Buchung/Rückruf] ${clientName}`
          : `[Admin-Buchung: ${typeLabel}] ${clientName} am ${dateFormatted}`,
        replyTo: clientEmail,
        text: isCallback
          ? `Admin-Buchung für ${clientName} (${clientEmail}).\nTyp: Rückruf\nTelefon: ${phone}${message ? `\n\nNachricht:\n${message}` : ''}`
          : `Admin-Buchung für ${clientName} (${clientEmail}).\nTyp: ${typeLabel}\nDatum: ${dateFormatted}\nUhrzeit: ${slotDisplay}\nLeistung: ${leistungKey}${projectId ? `\nProjekt-ID: ${projectId}` : ''}${message ? `\n\nNachricht:\n${message}` : ''}`,
      });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[api/admin/bookings/create]', err);
    return new Response(JSON.stringify({ error: 'Interner Serverfehler.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
