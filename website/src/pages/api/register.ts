import type { APIRoute } from 'astro';
import { createInboxItem } from '../../lib/messaging-db';
import { sendRegistrationConfirmation } from '../../lib/email';

export const POST: APIRoute = async ({ request }) => {
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
