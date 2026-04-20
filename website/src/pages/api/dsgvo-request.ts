import type { APIRoute } from 'astro';
import { sendEmail } from '../../lib/email';
import { sendAdminNotification } from '../../lib/notifications';
import { insertDsgvoRequest } from '../../lib/website-db';
import { checkRateLimit, getClientIp } from '../../lib/rate-limit';

const BRAND_NAME = process.env.BRAND_NAME || 'Workspace';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: APIRoute = async ({ request }) => {
  const ip = getClientIp(request);
  if (!checkRateLimit(`dsgvo:${ip}`, 3, 3_600_000)) {
    return new Response(JSON.stringify({ error: 'Zu viele Anfragen. Bitte warten Sie eine Stunde.' }), {
      status: 429, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { type, name, email } = await request.json();

    if (!type || !['auskunft', 'loeschung'].includes(type)) {
      return new Response(JSON.stringify({ error: 'Ungültiger Anfragetyp.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!name?.trim() || name.length > 200) {
      return new Response(JSON.stringify({ error: 'Bitte geben Sie Ihren Namen an.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!email?.trim() || !EMAIL_RE.test(email) || email.length > 200) {
      return new Response(JSON.stringify({ error: 'Bitte geben Sie eine gültige E-Mail-Adresse an.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const articleNum = type === 'auskunft' ? '15' : '17';
    const subject = type === 'auskunft' ? 'DSGVO-Auskunftsanfrage' : 'DSGVO-Löschungsanfrage';
    const deadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('de-DE');

    // 1. Audit-Log in DB (Pflicht für Nachweispflicht nach DSGVO)
    await insertDsgvoRequest({ type, name, email, ipAddress: ip });

    // 2. Bestätigungs-E-Mail an Antragsteller (Art. 12 DSGVO)
    sendEmail({
      to: email,
      subject: `Ihre ${subject} bei ${BRAND_NAME}`,
      text: `Hallo ${name},\n\nwir haben Ihre ${subject} erhalten und werden diese innerhalb von 30 Tagen bearbeiten.\n\nFristdatum: ${deadline}\nRechtsgrundlage: Art. ${articleNum} DSGVO\n\nMit freundlichen Grüßen\n${BRAND_NAME}`,
    }).catch(err => console.error('[dsgvo-request] Failed to send confirmation email:', err));

    // 3. Admin-Benachrichtigung (best-effort)
    sendAdminNotification({
      type: 'contact',
      subject: `[DSGVO] ${subject} von ${name}`,
      text: `${subject}\n\nName: ${name}\nE-Mail: ${email}\nEingegangen: ${new Date().toLocaleString('de-DE')}\nFrist: ${deadline}\n\nBitte bearbeiten Sie diese Anfrage innerhalb von 30 Tagen gemäß Art. ${articleNum} DSGVO.`,
      replyTo: email,
    }).catch(err => console.error('[dsgvo-request] Failed to send admin notification:', err));

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[dsgvo-request] Error:', err);
    return new Response(JSON.stringify({ error: 'Interner Fehler.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
