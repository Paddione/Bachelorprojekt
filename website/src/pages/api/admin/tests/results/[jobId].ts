import type { APIRoute } from 'astro';
import { readdir, readFile } from 'fs/promises';
import { getSession, isAdmin } from '../../../../../lib/auth';

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const format = url.searchParams.get('format') ?? 'json';
  const resultsDir = '/app/tests/results';

  try {
    const files = await readdir(resultsDir);
    const candidates = files.filter(
      (f) => !f.startsWith('.tmp') && (f.endsWith('.json') || f.endsWith('.md'))
    );

    if (format === 'md') {
      const mdFiles = candidates.filter((f) => f.endsWith('.md')).sort();
      if (mdFiles.length === 0) return new Response('No report found', { status: 404 });
      const content = await readFile(`${resultsDir}/${mdFiles[mdFiles.length - 1]}`, 'utf-8');
      return new Response(content, { headers: { 'Content-Type': 'text/markdown' } });
    }

    const jsonFiles = candidates.filter((f) => f.endsWith('.json')).sort();
    if (jsonFiles.length === 0) return new Response('No report found', { status: 404 });
    const content = await readFile(`${resultsDir}/${jsonFiles[jsonFiles.length - 1]}`, 'utf-8');
    return new Response(content, { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response('Results not available', { status: 404 });
  }
};
