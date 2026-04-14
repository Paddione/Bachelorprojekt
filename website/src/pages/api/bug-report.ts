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
const BRAND = process.env.BRAND || 'mentolder';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CATEGORY_LABELS: Record<string, string> = {
  fehler: 'Fehler',
  verbesserung: 'Verbesserung',
  erweiterungswunsch: 'Erweiterungswunsch',
};
const CATEGORY_EMOJI: Record<string, string> = {
  fehler: ':red_circle:',
  verbesserung: ':bulb:',
  erweiterungswunsch: ':sparkles:',
};

function jsonError(message: string, status: number): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { 'Content-Type': 'application/json' } }
  );
}

function generateTicketId(): string {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `BR-${today}-${rand}`;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();

    const description = (formData.get('description')?.toString() ?? '').replace(/\r/g, '').trim();
    const email = (formData.get('email')?.toString() ?? '').trim().slice(0, 200);
    const category = (formData.get('category')?.toString() ?? '').trim();
    const url = (formData.get('url')?.toString() ?? 'unbekannt').slice(0, 500).replace(/[\r\n]/g, ' ');
    const userAgent = (formData.get('userAgent')?.toString() ?? 'unbekannt').slice(0, 500).replace(/[\r\n]/g, ' ');
    const viewport = (formData.get('viewport')?.toString() ?? 'unbekannt').slice(0, 40).replace(/[\r\n]/g, ' ');
    if (!description) {
      return jsonError('Bitte beschreiben Sie das Problem.', 400);
    }
    if (description.length > 2000) {
      return jsonError('Beschreibung zu lang (max. 2000 Zeichen).', 400);
    }
    if (!email || !EMAIL_RE.test(email)) {
      return jsonError('Bitte geben Sie eine gültige E-Mail-Adresse an.', 400);
    }
    if (!category || !(category in CATEGORY_LABELS)) {
      return jsonError('Bitte wählen Sie eine Kategorie.', 400);
    }

    const screenshots = formData.getAll('screenshot');

    const validFiles: File[] = [];
    for (const item of screenshots) {
      if (!(item instanceof File) || item.size === 0) continue;
      if (item.size > MAX_BYTES) {
        return jsonError(`Datei "${item.name}" zu groß (max. 5 MB).`, 400);
      }
      if (!ALLOWED_MIME.has(item.type)) {
        return jsonError(`"${item.name}": Dateiformat nicht unterstützt. Erlaubt: PNG, JPEG, WEBP.`, 400);
      }
      validFiles.push(item);
    }
    if (validFiles.length > 3) {
      return jsonError('Maximal 3 Screenshots erlaubt.', 400);
    }

    const ticketId = generateTicketId();
    const categoryLabel = CATEGORY_LABELS[category];
    const categoryEmoji = CATEGORY_EMOJI[category];

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

    // Upload screenshots — best-effort, partial failure is a soft warning
    const fileIds: string[] = [];
    let uploadWarning = '';
    if (validFiles.length > 0 && channelId) {
      for (const f of validFiles) {
        const fid = await uploadFile({ channelId, file: f });
        if (fid) {
          fileIds.push(fid);
        } else {
          uploadWarning = '\n\n:warning: Ein oder mehrere Screenshots konnten nicht hochgeladen werden';
        }
      }
    }

    const escapedDescription = description.replace(/\n/g, '\n> ');
    const text =
      `### :bug: ${fallbackPrefix}${ticketId} · Neuer Bug Report\n` +
      `**Kategorie:** ${categoryEmoji} ${categoryLabel}\n` +
      `**Status:** :hourglass_flowing_sand: offen\n` +
      `**Reporter:** ${email}\n` +
      `**Marke:** ${BRAND}\n\n` +
      `| Feld | Inhalt |\n` +
      `|------|--------|\n` +
      `| **URL** | ${url} |\n` +
      `| **Browser** | \`${userAgent}\` |\n` +
      `| **Viewport** | ${viewport} |\n\n` +
      `**Beschreibung:**\n> ${escapedDescription}${uploadWarning}`;

    const sharedContext = {
      ticketId,
      category,
      categoryLabel,
      reporterEmail: email,
      description,
      url,
      userAgent,
      viewport,
      brand: BRAND,
    };

    let delivered = false;
    if (channelId) {
      const postId = await postInteractiveMessage({
        channelId,
        text,
        actions: [
          { id: 'erledigt_bug', name: 'Erledigt', style: 'primary' },
          { id: 'archive_bug', name: 'Archivieren', style: 'default' },
        ],
        context: sharedContext,
        fileIds: fileIds.length > 0 ? fileIds : undefined,
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
      JSON.stringify({ success: true, ticketId }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Bug report error:', err);
    return jsonError('Interner Serverfehler. Bitte versuchen Sie es später erneut.', 500);
  }
};
