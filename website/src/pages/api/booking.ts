import type { APIRoute } from 'astro';
import { postWebhook, postInteractiveMessage, getFirstTeamId, getChannelByName } from '../../lib/mattermost';
import { sendEmail } from '../../lib/email';
import { isSlotWhitelisted } from '../../lib/website-db';

const BRAND_NAME = process.env.BRAND_NAME || 'Workspace';
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || '';
const BRAND = process.env.BRAND_NAME || 'mentolder';

const TYPE_LABELS: Record<string, string> = {
  erstgespraech: 'Kostenloses Erstgespräch',
  callback: 'Rückruf',
  meeting: 'Online-Meeting',
  termin: 'Termin vor Ort',
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const { name, email, phone, type, message, slotStart, slotEnd, slotDisplay, date, serviceKey } = await request.json();

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

    // Whitelist check: slot must be explicitly released by admin
    if (!isCallback && slotStart) {
      const whitelisted = await isSlotWhitelisted(BRAND, new Date(slotStart));
      if (!whitelisted) {
        return new Response(
          JSON.stringify({ error: 'Dieser Termin ist leider nicht mehr verfügbar.' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
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

    const text = isCallback
      ? `### :phone: Rückruf-Anfrage\n\n| Feld | Inhalt |\n|------|--------|\n| **Name** | ${name} |\n| **E-Mail** | ${email} |\n| **Telefon** | ${phone} |\n\n${message ? `**Anmerkungen:**\n> ${message.replace(/\n/g, '\n> ')}` : ''}`
      : `### :calendar: Neue Terminanfrage: ${typeLabel}\n\n| Feld | Inhalt |\n|------|--------|\n| **Name** | ${name} |\n| **E-Mail** | ${email} |\n| **Telefon** | ${phone || 'Nicht angegeben'} |\n| **Typ** | ${typeLabel} |\n| **Datum** | ${dateFormatted} |\n| **Uhrzeit** | ${slotDisplay} |\n\n${message ? `**Anmerkungen:**\n> ${message.replace(/\n/g, '\n> ')}` : ''}`;

    // Post interactive message
    const teamId = await getFirstTeamId();
    const channelId = teamId ? await getChannelByName(teamId, 'anfragen') : null;

    if (channelId) {
      await postInteractiveMessage({
        channelId,
        text,
        actions: [
          { id: 'approve_booking', name: 'Bestätigen', style: 'success' },
          { id: 'decline_booking', name: 'Ablehnen', style: 'danger' },
        ],
        context: {
          name, email, phone, type, typeLabel, message,
          slotStart, slotEnd, slotDisplay, date, serviceKey,
        },
      });
    } else {
      await postWebhook({
        channel: 'anfragen',
        username: 'Website-Bot',
        icon_emoji: ':calendar:',
        text,
      });
    }

    // Confirmation email to user
    await sendEmail({
      to: email,
      subject: isCallback ? `Rückruf-Anfrage bei ${BRAND_NAME}` : `Terminanfrage: ${typeLabel} am ${dateFormatted}`,
      text: isCallback
        ? `Hallo ${name},\n\nvielen Dank für Ihre Rückruf-Anfrage bei ${BRAND_NAME}.\n\nWir melden uns in Kürze unter ${phone} bei Ihnen.\n\nMit freundlichen Grüßen\n${BRAND_NAME}`
        : `Hallo ${name},\n\nvielen Dank für Ihre Terminanfrage bei ${BRAND_NAME}.\n\nIhr gewünschter Termin:\n  Typ:     ${typeLabel}\n  Datum:   ${dateFormatted}\n  Uhrzeit: ${slotDisplay}\n\nWir prüfen Ihre Anfrage und melden uns in Kürze mit einer Bestätigung.\n\nMit freundlichen Grüßen\n${BRAND_NAME}`,
    });

    // Admin notification email
    if (CONTACT_EMAIL) {
      const phoneInfo = phone ? `\nTelefon: ${phone}` : '';
      const adminText = isCallback
        ? `Neue Rückruf-Anfrage auf ${BRAND_NAME}.\n\nName: ${name}\nE-Mail: ${email}${phoneInfo}${message ? `\n\nAnmerkungen:\n${message}` : ''}`
        : `Neue Terminanfrage auf ${BRAND_NAME}.\n\nName: ${name}\nE-Mail: ${email}${phoneInfo}\nTyp: ${typeLabel}\nDatum: ${dateFormatted}\nUhrzeit: ${slotDisplay}${message ? `\n\nAnmerkungen:\n${message}` : ''}`;
      await sendEmail({
        to: CONTACT_EMAIL,
        subject: isCallback
          ? `[Rückruf] Anfrage von ${name}`
          : `[Terminanfrage: ${typeLabel}] ${name} am ${dateFormatted}`,
        replyTo: email,
        text: adminText,
        html: isCallback
          ? `<p>Neue Rückruf-Anfrage auf ${BRAND_NAME}.</p><table><tr><td><strong>Name</strong></td><td>${name}</td></tr><tr><td><strong>E-Mail</strong></td><td><a href="mailto:${email}">${email}</a></td></tr>${phone ? `<tr><td><strong>Telefon</strong></td><td>${phone}</td></tr>` : ''}</table>${message ? `<p><strong>Anmerkungen:</strong><br>${message.replace(/\n/g, '<br>')}</p>` : ''}`
          : `<p>Neue Terminanfrage auf ${BRAND_NAME}.</p><table><tr><td><strong>Name</strong></td><td>${name}</td></tr><tr><td><strong>E-Mail</strong></td><td><a href="mailto:${email}">${email}</a></td></tr>${phone ? `<tr><td><strong>Telefon</strong></td><td>${phone}</td></tr>` : ''}<tr><td><strong>Typ</strong></td><td>${typeLabel}</td></tr><tr><td><strong>Datum</strong></td><td>${dateFormatted}</td></tr><tr><td><strong>Uhrzeit</strong></td><td>${slotDisplay}</td></tr></table>${message ? `<p><strong>Anmerkungen:</strong><br>${message.replace(/\n/g, '<br>')}</p>` : ''}`,
      });
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Booking error:', err);
    return new Response(
      JSON.stringify({ error: 'Interner Serverfehler.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
