import type { APIRoute } from 'astro';
import { createInboxItem } from '../../lib/messaging-db';
import { sendAdminNotification } from '../../lib/notifications';
import { checkRateLimit, getClientIp } from '../../lib/rate-limit';
import { isE2ETestRequest } from '../../lib/e2e-marker';
import { sanitizeContactInput, escapeHtml } from '../../lib/contact-sanitize';
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

export const POST: APIRoute = async ({ request , locals }) => {
  const ip = getClientIp(request);
  if (!checkRateLimit(`contact:${ip}`, 5, 60_000)) {
    return new Response(JSON.stringify({ error: 'Zu viele Anfragen. Bitte warten Sie einen Moment.' }), {
      status: 429, headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const body = await request.json();
    const sanitized = sanitizeContactInput(body);

    if (sanitized.error || !sanitized.data) {
      return new Response(
        JSON.stringify({ error: sanitized.error || 'Ungültige Eingabe.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { name, email, phone, type, message } = sanitized.data;
    const typeLabel = TYPE_LABELS[type] || 'Unbekannt';

    await createInboxItem({
      type: 'contact',
      payload: { name, email, phone, type, typeLabel, message },
      isTestData: isE2ETestRequest(request),
    });

    // Admin notification is best-effort — inbox item is the authoritative record
    const phoneInfo = phone ? `\nTelefon: ${phone}` : '';
    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safePhone = phone ? escapeHtml(phone) : '';
    const safePhoneHtml = safePhone ? `<br>Telefon: ${safePhone}` : '';
    const safeMessageHtml = escapeHtml(message).replace(/\n/g, '<br>');

    sendAdminNotification({
      type: 'contact',
      subject: `[${typeLabel}] Neue Anfrage von ${name}`,
      replyTo: email,
      text: `Neue Anfrage über das Kontaktformular auf ${BRAND_NAME}.\n\nName: ${name}\nE-Mail: ${email}${phoneInfo}\nTyp: ${typeLabel}\n\nNachricht:\n${message}`,
      html: `<p><strong>Neue Anfrage über das Kontaktformular auf ${BRAND_NAME}.</strong></p><p>Name: ${safeName}<br>E-Mail: <a href="mailto:${safeEmail}">${safeEmail}</a>${safePhoneHtml}<br>Typ: ${typeLabel}</p><p><strong>Nachricht:</strong><br>${safeMessageHtml}</p>`,
    }, request).catch(err => locals.requestLogger.error({ err }, '[contact] Failed to send admin notification:'));

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    locals.requestLogger.error({ err }, 'Contact form error:');
    return new Response(
      JSON.stringify({ error: 'Interner Serverfehler.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
