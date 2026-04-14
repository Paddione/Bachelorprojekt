import type { APIRoute } from 'astro';
import { updatePost, replyToPost } from '../../../lib/mattermost';
import { sendEmail } from '../../../lib/email';
import { resolveBugTicket } from '../../../lib/meetings-db';

const BRAND_INBOX: Record<string, string> = {
  mentolder: 'info@mentolder.de',
  korczewski: 'info@korczewski.de',
};
const FALLBACK_INBOX = 'info@mentolder.de';

export const POST: APIRoute = async ({ request }) => {
  try {
    // Verify the request came from Mattermost using the bot token
    const authHeader = request.headers.get('authorization') ?? '';
    const mmToken = process.env.MM_TOKEN ?? '';
    if (mmToken && authHeader !== `Token ${mmToken}`) {
      return new Response('Forbidden', { status: 403 });
    }

    const payload = await request.json();
    const { callback_id, state: stateJson, submission } = payload;

    if (callback_id !== 'erledigt_bug' || !stateJson) {
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const state = JSON.parse(stateJson) as {
      postId: string;
      channelId: string;
      ticketId: string;
      category: string;
      categoryLabel: string;
      reporterEmail: string;
      description: string;
      url: string;
      userAgent: string;
      viewport: string;
      brand: string;
    };

    const note = (submission?.note ?? '').toString().trim();
    if (!note) {
      return new Response(
        JSON.stringify({ errors: { note: 'Bitte beschreiben Sie kurz, was Sie gemacht haben.' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (note.length > 500) {
      return new Response(
        JSON.stringify({ errors: { note: 'Max. 500 Zeichen.' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 1. Edit the original post in place
    const now = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
    const escapedNote = note.replace(/\n/g, '\n> ');
    const escapedDescription = state.description.replace(/\n/g, '\n> ');
    const updatedMessage =
      `### :bug: ${state.ticketId} · Neuer Bug Report\n` +
      `**Kategorie:** ${state.categoryLabel}\n` +
      `**Status:** :white_check_mark: erledigt\n` +
      `**Reporter:** ${state.reporterEmail}\n` +
      `**Marke:** ${state.brand}\n\n` +
      `| Feld | Inhalt |\n` +
      `|------|--------|\n` +
      `| **URL** | ${state.url} |\n` +
      `| **Browser** | \`${state.userAgent}\` |\n` +
      `| **Viewport** | ${state.viewport} |\n\n` +
      `**Beschreibung:**\n> ${escapedDescription}\n\n` +
      `---\n` +
      `**Erledigt (${now}):**\n> ${escapedNote}`;

    await updatePost(state.postId, updatedMessage);

    // Update ticket status in DB (best-effort)
    try {
      await resolveBugTicket(state.ticketId, note);
    } catch (err) {
      console.warn('[dialog-submit] DB update failed (non-fatal):', err);
    }

    // 2. Send email to the brand-appropriate inbox
    const toInbox = BRAND_INBOX[state.brand] ?? FALLBACK_INBOX;
    const siteUrl = process.env.SITE_URL || '';
    const mmPublicUrl = process.env.MATTERMOST_PUBLIC_URL || '';
    const mmLink = mmPublicUrl
      ? `${mmPublicUrl}/pl/${state.postId}`
      : siteUrl
        ? `${siteUrl.replace(/^https?:\/\/web\./, (m) => m.replace('web.', 'chat.'))}/pl/${state.postId}`
        : '(siehe Mattermost)';

    const subject = `[${state.ticketId}] ${state.categoryLabel}: ${state.description.slice(0, 60)}`;
    const text =
      `Ticket ${state.ticketId} wurde als ERLEDIGT markiert.\n\n` +
      `Kategorie:  ${state.categoryLabel}\n` +
      `Reporter:   ${state.reporterEmail}\n` +
      `\n` +
      `Beschreibung:\n` +
      `  ${state.description.replace(/\n/g, '\n  ')}\n` +
      `\n` +
      `Was wurde gemacht:\n` +
      `  ${note.replace(/\n/g, '\n  ')}\n` +
      `\n` +
      `Ursprünglicher Mattermost-Post:\n` +
      `  ${mmLink}\n` +
      `\n` +
      `Falls etwas noch offen ist, antworte im Mattermost-Thread oder\n` +
      `direkt auf diese E-Mail (der Reporter ist auf Reply-To gesetzt).\n`;

    await sendEmail({
      to: toInbox,
      subject,
      text,
      replyTo: state.reporterEmail,
    });

    // 3. Post a thread reply asking for verification
    await replyToPost(
      state.postId,
      state.channelId,
      `:white_check_mark: Als erledigt markiert.\n\n` +
      `Geprüft? Reagiere mit :white_check_mark: oder antworte in diesem Thread, ` +
      `wenn etwas offen geblieben ist.`
    );

    return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[dialog-submit] erledigt_bug failed:', err);
    return new Response(
      JSON.stringify({ errors: { note: 'Interner Fehler beim Markieren. Bitte erneut versuchen.' } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
