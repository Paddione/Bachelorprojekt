import type { APIRoute } from 'astro';
import { createInboxItem } from '../../lib/messaging-db';
import { sendAdminNotification } from '../../lib/notifications';
import { checkRateLimit, getClientIp } from '../../lib/rate-limit';
const BRAND_NAME = process.env.BRAND_NAME || 'Workspace';

const TYPE_LABELS: Record<string, string> = {
  allgemein: 'Allgemeine Anfrage',
  erstgespraech: 'Kostenloses Erstgespräch',
  '50plus-digital': '50+ digital',
  'digital-cafe': '50+ digital',
  coaching: 'Führungskräfte-Coaching',
  beratung: 'Unternehmensberatung',
  support: 'Support',
  feedback: 'Feedback',
};

export const POST: APIRoute = async ({ request }) => {
  const ip = getClientIp(request);
  if (!checkRateLimit(`contact:${ip}`, 5, 60_000)) {
    return new Response(JSON.stringify({ error: 'Zu viele Anfragen. Bitte warten Sie einen Moment.' }), {
      status: 429, headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const body = await request.json();
    const { name, email, phone, type, message } = body;

    if (!name?.trim() || !email?.trim() || !message?.trim()) {
      return new Response(
        JSON.stringify({ error: 'Bitte füllen Sie alle Pflichtfelder aus.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Bitte geben Sie eine gültige E-Mail-Adresse an.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const typeLabel = TYPE_LABELS[type] || 'Unbekannt';

    await createInboxItem({
      type: 'contact',
      payload: { name, email, phone: phone ?? null, type, typeLabel, message },
    });

    // Admin notification is best-effort — inbox item is the authoritative record
    const phoneInfo = phone ? `\nTelefon: ${phone}` : '';
    sendAdminNotification({
      type: 'contact',
      subject: `[${typeLabel}] Neue Anfrage von ${name}`,
      replyTo: email,
      text: `Neue Anfrage über das Kontaktformular auf ${BRAND_NAME}.\n\nName: ${name}\nE-Mail: ${email}${phoneInfo}\nTyp: ${typeLabel}\n\nNachricht:\n${message}`,
      html: `<p><strong>Neue Anfrage über das Kontaktformular auf ${BRAND_NAME}.</strong></p><p>Name: ${name}<br>E-Mail: <a href="mailto:${email}">${email}</a>${phone ? `<br>Telefon: ${phone}` : ''}<br>Typ: ${typeLabel}</p><p><strong>Nachricht:</strong><br>${message.replace(/\n/g, '<br>')}</p>`,
    }).catch(err => console.error('[contact] Failed to send admin notification:', err));

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Contact form error:', err);
    return new Response(
      JSON.stringify({ error: 'Interner Serverfehler.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
