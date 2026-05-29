import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { readContent } from '../../../../lib/website-db';
import { proposeRetokenize } from '../../../../lib/legal-tokens';
import { getEffectiveStammdaten } from '../../../../lib/content';

const BRAND = import.meta.env.BRAND || process.env.BRAND || 'mentolder';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const { contentKey } = await request.json();
  if (!contentKey?.startsWith('legal:')) return new Response('contentKey must be a legal: key', { status: 400 });

  const [current, sd] = await Promise.all([
    readContent(BRAND, contentKey),
    getEffectiveStammdaten().catch(() => null),
  ]);
  if (!current.value || !sd) return new Response(JSON.stringify({ result: '', replacements: [] }), { status: 200, headers: { 'content-type': 'application/json' } });

  const { result, replacements } = proposeRetokenize(String(current.value), sd);
  return new Response(JSON.stringify({ result, replacements }), { status: 200, headers: { 'content-type': 'application/json' } });
};
