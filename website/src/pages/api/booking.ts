import type { APIRoute } from 'astro';
import { postWebhook, postInteractiveMessage, getFirstTeamId, getChannelByName } from '../../lib/mattermost';
import { sendEmail } from '../../lib/email';

const BRAND_NAME = process.env.BRAND_NAME || 'Workspace';

const TYPE_LABELS: Record<string, string> = {
  erstgespraech: 'Kostenloses Erstgesprach',
  callback: 'Ruckruf',
  meeting: 'Online-Meeting',
  termin: 'Termin vor Ort',
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const { name, email, phone, type, message, slotStart, slotEnd, slotDisplay, date, serviceKey } = await request.json();

    if (!name?.trim() || !email?.trim() || !slotStart || !slotEnd) {
      return new Response(
        JSON.stringify({ error: 'Bitte fullen Sie alle Pflichtfelder aus und wahlen einen Termin.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const typeLabel = TYPE_LABELS[type] || type;
    const dateFormatted = new Date(date + 'T00:00:00').toLocaleDateString('de-DE', {
      weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
    });

    const text = `### :calendar: Neue Terminanfrage: ${typeLabel}\n\n| Feld | Inhalt |\n|------|--------|\n| **Name** | ${name} |\n| **E-Mail** | ${email} |\n| **Telefon** | ${phone || 'Nicht angegeben'} |\n| **Typ** | ${typeLabel} |\n| **Datum** | ${dateFormatted} |\n| **Uhrzeit** | ${slotDisplay} |\n\n${message ? `**Anmerkungen:**\n> ${message.replace(/\n/g, '\n> ')}` : ''}`;

    // Post interactive message
    const teamId = await getFirstTeamId();
    const channelId = teamId ? await getChannelByName(teamId, 'anfragen') : null;

    if (channelId) {
      await postInteractiveMessage({
        channelId,
        text,
        actions: [
          { id: 'approve_booking', name: 'Bestatigen', style: 'success' },
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
      subject: `Terminanfrage: ${typeLabel} am ${dateFormatted}`,
      text: `Hallo ${name},

vielen Dank fur Ihre Terminanfrage bei ${BRAND_NAME}.

Ihr gewunschter Termin:
  Typ:     ${typeLabel}
  Datum:   ${dateFormatted}
  Uhrzeit: ${slotDisplay}

Wir prufen Ihre Anfrage und melden uns in Kurze mit einer Bestatigung.

Mit freundlichen Grussen
${BRAND_NAME}`,
    });

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
