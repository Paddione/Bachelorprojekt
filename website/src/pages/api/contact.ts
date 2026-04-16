import type { APIRoute } from 'astro';
import { createInboxItem } from '../../lib/messaging-db';
import { sendEmail } from '../../lib/email';

const CONTACT_EMAIL = process.env.CONTACT_EMAIL || '';
const BRAND_NAME = process.env.BRAND_NAME || 'Workspace';

const TYPE_LABELS: Record<string, string> = {
  allgemein: 'Allgemeine Anfrage',
  erstgespraech: 'Kostenloses Erstgespräch',
  'digital-cafe': '50+ digital',
  coaching: 'Führungskräfte-Coaching',
  beratung: 'Unternehmensberatung',
  support: 'Support',
  feedback: 'Feedback',
};

export const POST: APIRoute = async ({ request }) => {
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

    // E-Mail-Benachrichtigung an Admin
    if (CONTACT_EMAIL) {
      const phoneInfo = phone ? `\nTelefon: ${phone}` : '';
      await sendEmail({
        to: CONTACT_EMAIL,
        subject: `[${typeLabel}] Neue Anfrage von ${name}`,
        replyTo: email,
        text: `Neue Anfrage über das Kontaktformular auf ${BRAND_NAME}.\n\nName: ${name}\nE-Mail: ${email}${phoneInfo}\nTyp: ${typeLabel}\n\nNachricht:\n${message}`,
        html: `<p>Neue Anfrage über das Kontaktformular auf ${BRAND_NAME}.</p>
<table>
<tr><td><strong>Name</strong></td><td>${name}</td></tr>
<tr><td><strong>E-Mail</strong></td><td><a href="mailto:${email}">${email}</a></td></tr>
${phone ? `<tr><td><strong>Telefon</strong></td><td>${phone}</td></tr>` : ''}
<tr><td><strong>Typ</strong></td><td>${typeLabel}</td></tr>
</table>
<p><strong>Nachricht:</strong><br>${message.replace(/\n/g, '<br>')}</p>`,
      });
    }

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
