import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { writeContent, readContent, listVersions } from '../../../../lib/website-db';

const BRAND = import.meta.env.BRAND || process.env.BRAND || 'mentolder';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const { contentKey, versionId } = await request.json();
  const versions = await listVersions(BRAND, contentKey);
  const target = versions.find((v) => v.id === versionId);
  if (!target) return new Response('version not found', { status: 404 });

  const current = await readContent(BRAND, contentKey);
  const editor = session.email ?? session.name ?? 'unknown';
  const snapshot = target.snapshot as { value: unknown };
  const { version } = await writeContent(BRAND, contentKey, snapshot.value, current.version, editor);
  return new Response(JSON.stringify({ version }), { status: 200, headers: { 'content-type': 'application/json' } });
};
