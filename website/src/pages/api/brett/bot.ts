import type { APIRoute } from 'astro';
import { verifyTalkSignature, postBotReply } from '../../../lib/brett-bot';

const BOT_SECRET   = process.env.BRETT_BOT_SECRET || '';
const BRETT_DOMAIN = process.env.BRETT_DOMAIN || 'brett.localhost';

export const POST: APIRoute = async ({ request }) => {
  const body   = await request.text();
  const random = request.headers.get('x-nextcloud-talk-random') ?? '';
  const sig    = request.headers.get('x-nextcloud-talk-signature') ?? '';

  if (!verifyTalkSignature(BOT_SECRET, random, body, sig)) {
    return new Response('forbidden', { status: 401 });
  }

  let evt: any;
  try { evt = JSON.parse(body); } catch { return new Response(null, { status: 200 }); }

  if (evt.type !== 'Create' || evt.object?.name !== 'message') {
    return new Response(null, { status: 200 });
  }

  let messageText = '';
  try {
    const content = JSON.parse(evt.object.content);
    messageText = (content?.message || '').trim();
  } catch { /* ignore */ }

  if (!/^\/brett(\s|$)/.test(messageText)) {
    return new Response(null, { status: 200 });
  }

  const roomToken = evt.target?.id;
  if (!roomToken || typeof roomToken !== 'string') {
    return new Response(null, { status: 200 });
  }

  const url = `https://${BRETT_DOMAIN}/?room=${encodeURIComponent(roomToken)}`;
  await postBotReply(roomToken, `🎯 Systemisches Brett: ${url}`, BOT_SECRET);

  return new Response(null, { status: 201 });
};
