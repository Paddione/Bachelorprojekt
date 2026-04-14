import type { APIRoute } from 'astro';
import { sendEmail } from '../../lib/email';

const CONTACT_EMAIL = process.env.CONTACT_EMAIL || '';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: APIRoute = async ({ request }) => {
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

    const subject = type === 'auskunft'
      ? 'DSGVO-Auskunftsanfrage'
      : 'DSGVO-Löschungsanfrage';

    const text = `${subject}\n\nName: ${name}\nE-Mail: ${email}\n\nBitte bearbeiten Sie diese Anfrage innerhalb von 30 Tagen gemäß Art. ${type === 'auskunft' ? '15' : '17'} DSGVO.`;

    if (!CONTACT_EMAIL) {
      console.warn('[dsgvo-request] CONTACT_EMAIL not set, email not sent');
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    await sendEmail({ to: CONTACT_EMAIL, subject, text, replyTo: email });

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
