import type { APIRoute } from 'astro';
import {
  postWebhook,
  postInteractiveMessage,
  getFirstTeamId,
  getChannelByName,
  uploadFile,
} from '../../lib/mattermost';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
const DEFAULT_CHANNEL = process.env.BUG_REPORT_CHANNEL || 'bugs';
const FALLBACK_CHANNEL = 'anfragen';

function jsonError(message: string, status: number): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { 'Content-Type': 'application/json' } }
  );
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();

    const description = (formData.get('description')?.toString() ?? '').trim();
    const url = (formData.get('url')?.toString() ?? 'unbekannt').slice(0, 500).replace(/[\r\n]/g, ' ');
    const userAgent = (formData.get('userAgent')?.toString() ?? 'unbekannt').slice(0, 500).replace(/[\r\n]/g, ' ');
    const viewport = (formData.get('viewport')?.toString() ?? 'unbekannt').slice(0, 40).replace(/[\r\n]/g, ' ');
    const screenshot = formData.get('screenshot');

    if (!description) {
      return jsonError('Bitte beschreiben Sie das Problem.', 400);
    }
    if (description.length > 2000) {
      return jsonError('Beschreibung zu lang (max. 2000 Zeichen).', 400);
    }

    let file: File | null = null;
    if (screenshot instanceof File && screenshot.size > 0) {
      if (screenshot.size > MAX_BYTES) {
        return jsonError('Datei zu groß (max. 5 MB).', 400);
      }
      if (!ALLOWED_MIME.has(screenshot.type)) {
        return jsonError('Dateiformat nicht unterstützt. Erlaubt: PNG, JPEG, WEBP.', 400);
      }
      file = screenshot;
    }

    // Resolve Mattermost team + channel (fall back to anfragen if bugs missing)
    const teamId = await getFirstTeamId();
    let channelName = DEFAULT_CHANNEL;
    let channelId: string | null = teamId ? await getChannelByName(teamId, DEFAULT_CHANNEL) : null;
    let fallbackPrefix = '';
    if (!channelId && teamId) {
      channelId = await getChannelByName(teamId, FALLBACK_CHANNEL);
      if (channelId) {
        channelName = FALLBACK_CHANNEL;
        fallbackPrefix = '[BUG] ';
        console.warn(`[bug-report] Channel "${DEFAULT_CHANNEL}" missing, falling back to "${FALLBACK_CHANNEL}"`);
      }
    }

    // Upload screenshot if present (best-effort — lost screenshot is soft failure)
    let fileId: string | null = null;
    let uploadWarning = '';
    if (file && channelId) {
      fileId = await uploadFile({ channelId, file });
      if (!fileId) {
        uploadWarning = '\n\n:warning: Screenshot-Upload fehlgeschlagen';
      }
    }

    const escapedDescription = description.replace(/\n/g, '\n> ');
    const text =
      `### :bug: ${fallbackPrefix}Neuer Bug Report\n\n` +
      `| Feld | Inhalt |\n` +
      `|------|--------|\n` +
      `| **URL** | ${url} |\n` +
      `| **Browser** | \`${userAgent}\` |\n` +
      `| **Viewport** | ${viewport} |\n\n` +
      `**Beschreibung:**\n> ${escapedDescription}${uploadWarning}`;

    let delivered = false;
    if (channelId) {
      const postId = await postInteractiveMessage({
        channelId,
        text,
        actions: [{ id: 'archive_bug', name: 'Archivieren', style: 'default' }],
        context: { description, url, userAgent, viewport },
        fileIds: fileId ? [fileId] : undefined,
      });
      delivered = postId !== null;
    }

    if (!delivered) {
      const webhookOk = await postWebhook({
        channel: channelName,
        username: 'Bug-Bot',
        icon_emoji: ':bug:',
        text,
      });
      delivered = webhookOk;
    }

    if (!delivered) {
      return jsonError('Interner Serverfehler. Bitte versuchen Sie es später erneut.', 500);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Bug report error:', err);
    return jsonError('Interner Serverfehler. Bitte versuchen Sie es später erneut.', 500);
  }
};
