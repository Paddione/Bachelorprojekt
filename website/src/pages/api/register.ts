import type { APIRoute } from 'astro';
import { postWebhook, postInteractiveMessage, getFirstTeamId, getChannelByName } from '../../lib/mattermost';
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

    // Try to post interactive message with Accept/Decline buttons
    const teamId = await getFirstTeamId();
    const channelId = teamId ? await getChannelByName(teamId, 'anfragen') : null;

    if (channelId) {
      // Post with interactive buttons (requires bot token)
      await postInteractiveMessage({
        channelId,
        text: `### :bust_in_silhouette: Neue Registrierung\n\n| Feld | Inhalt |\n|------|--------|\n| **Name** | ${fullName} |\n| **E-Mail** | ${email} |\n| **Telefon** | ${phone || 'Nicht angegeben'} |\n| **Unternehmen** | ${company || 'Nicht angegeben'} |\n\n${message ? `**Nachricht:**\n> ${message.replace(/\n/g, '\n> ')}` : ''}`,
        actions: [
          { id: 'approve_registration', name: 'Freischalten', style: 'success' },
          { id: 'decline_registration', name: 'Ablehnen', style: 'danger' },
        ],
        context: { email, firstName, lastName, phone, company },
      });
    } else {
      // Fallback: post via webhook without interactive buttons
      await postWebhook({
        channel: 'anfragen',
        username: 'Website-Bot',
        icon_emoji: ':bust_in_silhouette:',
        text: `### :bust_in_silhouette: Neue Registrierung\n\n| Feld | Inhalt |\n|------|--------|\n| **Name** | ${fullName} |\n| **E-Mail** | ${email} |\n| **Telefon** | ${phone || 'Nicht angegeben'} |\n| **Unternehmen** | ${company || 'Nicht angegeben'} |\n\n${message ? `**Nachricht:**\n> ${message.replace(/\n/g, '\n> ')}` : ''}\n\n:warning: Interaktive Buttons nicht verfugbar. Benutzer manuell in Keycloak anlegen.`,
      });
    }

    // Send confirmation email to user
    await sendRegistrationConfirmation(email, fullName);

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
