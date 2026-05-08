import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/auth';
import { transcribeAudio } from '../../../lib/whisper';

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return json({ error: 'unauthorized' }, 401);

  const form = await request.formData();
  const file = form.get('audio');
  if (!(file instanceof Blob) || file.size === 0) return json({ error: 'missing audio blob' }, 400);
  if (file.size > 8 * 1024 * 1024) return json({ error: 'audio too large (max 8 MB)' }, 413);

  const result = await transcribeAudio(file, 'voice.webm', 'de');
  if (!result) return json({ error: 'transcription failed' }, 502);

  return json({ text: result.text });
};
