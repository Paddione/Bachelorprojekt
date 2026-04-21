import type { APIRoute } from 'astro';
import { createInboxItem } from '../../lib/messaging-db';
import { sendRegistrationConfirmation } from '../../lib/email';
import { sendAdminNotification } from '../../lib/notifications';
import { checkRateLimit, getClientIp } from '../../lib/rate-limit';

export const POST: APIRoute = async ({ request }) => {
  const ip = getClientIp(request);
  if (!checkRateLimit(`register:${ip}`, 5, 60_000)) {
    return new Response(JSON.stringify({ error: 'Zu viele Anfragen. Bitte warten Sie einen Moment.' }), {
      status: 429, headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const { firstName, lastName, email, phone, company, message } = await request.json();

    if (!firstName?.trim() || !lastName?.trim() || !email?.trim()) {
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

    const fullName = `${firstName} ${lastName}`;

    await createInboxItem({
      type: 'registration',
      payload: { firstName, lastName, email, phone: phone ?? null, company: company ?? null, message: message ?? null },
    });

    // Confirmation email is best-effort — inbox item is the authoritative record
    sendRegistrationConfirmation(email, fullName).catch(err =>
      console.error('[register] Failed to send confirmation email:', err)
    );

    sendAdminNotification({
      type: 'registration',
      subject: `[Neue Registrierung] ${fullName}`,
      text: `Neue Registrierungsanfrage eingegangen.\n\nName: ${fullName}\nE-Mail: ${email}\n\nZum Bearbeiten: /admin/inbox`,
    }).catch(err => console.error('[register] Failed to send admin notification:', err));

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Registration error:', err);
    return new Response(
      JSON.stringify({ error: 'Interner Serverfehler.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
