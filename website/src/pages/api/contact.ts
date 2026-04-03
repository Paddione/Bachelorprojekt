import type { APIRoute } from 'astro';
import { postWebhook, postInteractiveMessage, getFirstTeamId, getChannelByName } from '../../lib/mattermost';

const TYPE_LABELS: Record<string, string> = {
  allgemein: 'Allgemeine Anfrage',
  erstgespraech: 'Kostenloses Erstgesprach',
  'digital-cafe': 'Digital Cafe 50+',
  coaching: 'Fuhrungskrafte-Coaching',
  beratung: 'Unternehmensberatung',
  support: 'Support',
  feedback: 'Feedback',
};

const TYPE_ICONS: Record<string, string> = {
  allgemein: ':envelope:',
  erstgespraech: ':calendar:',
  'digital-cafe': ':computer:',
  coaching: ':dart:',
  beratung: ':office:',
  support: ':wrench:',
  feedback: ':star:',
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { name, email, phone, type, message } = body;

    if (!name?.trim() || !email?.trim() || !message?.trim()) {
      return new Response(
        JSON.stringify({ error: 'Bitte fullen Sie alle Pflichtfelder aus.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Bitte geben Sie eine gultige E-Mail-Adresse an.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const typeLabel = TYPE_LABELS[type] || 'Unbekannt';
    const typeIcon = TYPE_ICONS[type] || ':grey_question:';
    const text = `### ${typeIcon} Neue Anfrage: ${typeLabel}\n\n| Feld | Inhalt |\n|------|--------|\n| **Name** | ${name} |\n| **E-Mail** | ${email} |\n| **Telefon** | ${phone || 'Nicht angegeben'} |\n| **Typ** | ${typeLabel} |\n\n**Nachricht:**\n> ${message.replace(/\n/g, '\n> ')}`;

    // Try interactive message with Reply/Archive buttons
    const teamId = await getFirstTeamId();
    const channelId = teamId ? await getChannelByName(teamId, 'anfragen') : null;

    if (channelId) {
      await postInteractiveMessage({
        channelId,
        text,
        actions: [
          { id: 'reply_contact', name: 'Antworten', style: 'primary' },
          { id: 'archive_contact', name: 'Archivieren', style: 'default' },
        ],
        context: { senderName: name, senderEmail: email, senderPhone: phone, type, message },
      });
    } else {
      // Fallback: simple webhook
      await postWebhook({
        channel: 'anfragen',
        username: 'Website-Bot',
        icon_emoji: ':globe_with_meridians:',
        text,
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
