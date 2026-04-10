import type { APIRoute } from 'astro';
import { createTalkRoom, inviteGuestByEmail } from '../../../../lib/talk';
import { getFirstTeamId, getOrCreateCustomerChannel, postToChannel, postInteractiveMessage } from '../../../../lib/mattermost';

// Mattermost slash command: /meeting
// Starts an ad-hoc meeting with full pipeline integration.
//
// Usage:
//   /meeting Max Mustermann max@example.de           → Coaching (default)
//   /meeting Max Mustermann max@example.de Workshop   → custom type
//   /meeting                                          → quick meeting (no customer)
//
// Mattermost sends a POST with application/x-www-form-urlencoded:
//   text, channel_id, user_id, team_id, command, ...
export const POST: APIRoute = async ({ request }) => {
  try {
    const form = await request.formData();
    const text = (form.get('text') as string || '').trim();
    const channelId = form.get('channel_id') as string || '';
    // Parse arguments: name email [type]
    const parts = text.split(/\s+/);
    let customerName = '';
    let customerEmail = '';
    let meetingType = 'Ad-Hoc Meeting';

    if (parts.length >= 3 && parts[1].includes('@')) {
      // /meeting Max max@example.de [Type...]
      customerName = parts[0];
      customerEmail = parts[1];
      meetingType = parts.slice(2).join(' ') || meetingType;
    } else if (parts.length >= 4 && parts[2].includes('@')) {
      // /meeting Max Mustermann max@example.de [Type...]
      customerName = `${parts[0]} ${parts[1]}`;
      customerEmail = parts[2];
      meetingType = parts.slice(3).join(' ') || meetingType;
    } else if (parts.length >= 2 && !parts[0].includes('@')) {
      // /meeting Max Mustermann (no email)
      customerName = parts.join(' ');
    } else if (parts.length === 1 && parts[0].includes('@')) {
      // /meeting max@example.de
      customerEmail = parts[0];
      customerName = parts[0].split('@')[0];
    }

    const dateFormatted = new Date().toLocaleDateString('de-DE', {
      weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
    });
    const timeFormatted = new Date().toLocaleTimeString('de-DE', {
      hour: '2-digit', minute: '2-digit',
    });

    // 1. Create Talk room
    const roomName = customerName
      ? `${meetingType}: ${customerName}`
      : `${meetingType} — ${timeFormatted}`;

    const room = await createTalkRoom({
      name: roomName,
      description: customerName
        ? `${meetingType} mit ${customerName}${customerEmail ? ` (${customerEmail})` : ''} — ${dateFormatted}`
        : `Ad-Hoc Meeting gestartet am ${dateFormatted} um ${timeFormatted}`,
      public: true,
    });

    if (!room) {
      return slashResponse(':warning: Talk-Raum konnte nicht erstellt werden. Ist Nextcloud erreichbar?');
    }

    // 2. Invite customer if email provided
    if (customerEmail) {
      await inviteGuestByEmail(room.token, customerEmail);
    }

    // 3. Post meeting info + finalize button to appropriate channel
    const teamId = await getFirstTeamId();
    let targetChannelId = channelId;

    // If we have a customer, create/use their dedicated channel
    if (customerName && teamId) {
      const customerChannel = await getOrCreateCustomerChannel(teamId, customerName);
      if (customerChannel) {
        targetChannelId = customerChannel.id;
      }
    }

    // Post meeting info
    const infoParts = [
      `### :video_camera: ${meetingType} gestartet`,
      '',
      `**Datum:** ${dateFormatted} um ${timeFormatted}`,
    ];
    if (customerName) infoParts.push(`**Kunde:** ${customerName}${customerEmail ? ` (${customerEmail})` : ''}`);
    infoParts.push('', `:link: **Meeting-Link:** ${room.url}`, '', '---', '_Aufnahme kann im Talk-Call ueber das Drei-Punkte-Menu gestartet werden._');

    await postToChannel(targetChannelId, infoParts.join('\n'));

    // Post finalize button
    await postInteractiveMessage({
      channelId: targetChannelId,
      text: ':point_down: _Nach dem Meeting: Pipeline ausfuehren (Transkript, DB, Outline, Embeddings)._',
      actions: [
        { id: 'finalize_meeting', name: 'Meeting abschliessen', style: 'primary' },
      ],
      context: {
        customerName: customerName || 'Unbekannt',
        customerEmail: customerEmail || `adhoc-${Date.now()}@intern`,
        meetingType,
        meetingDate: dateFormatted,
        customerChannelId: targetChannelId,
        roomToken: room.token,
      },
    });

    // Respond to the slash command (only visible to the user who typed it)
    const response = customerName
      ? `:white_check_mark: **${meetingType}** mit **${customerName}** gestartet → ${room.url}`
      : `:white_check_mark: **${meetingType}** gestartet → ${room.url}`;

    return slashResponse(response);
  } catch (err) {
    console.error('/meeting slash command error:', err);
    return slashResponse(`:rotating_light: Fehler: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`);
  }
};

function slashResponse(text: string) {
  return new Response(
    JSON.stringify({ response_type: 'ephemeral', text }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
