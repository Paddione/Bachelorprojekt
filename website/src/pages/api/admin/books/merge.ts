// website/src/pages/api/admin/books/merge.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { pool } from '../../../../lib/website-db';
import { mergeBooks, listSmallBooks } from '../../../../lib/coaching-merge';
import type { MergeSpec } from '../../../../lib/coaching-merge';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  try {
    const books = await listSmallBooks(pool);
    return new Response(JSON.stringify({ books }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let spec: MergeSpec;
  try {
    spec = await request.json() as MergeSpec;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  if (!spec.title?.trim()) {
    return new Response(JSON.stringify({ error: 'title is required' }), { status: 400 });
  }
  if (!spec.slug?.trim()) {
    return new Response(JSON.stringify({ error: 'slug is required' }), { status: 400 });
  }
  if (!Array.isArray(spec.sourceBookIds) || spec.sourceBookIds.length < 2) {
    return new Response(JSON.stringify({ error: 'At least 2 sourceBookIds required' }), { status: 400 });
  }

  try {
    const result = await mergeBooks(pool, spec);
    return new Response(JSON.stringify(result), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    const msg = String(err);
    const status = msg.includes('not found') || msg.includes('threshold') ? 400 : 500;
    return new Response(JSON.stringify({ error: msg }), { status });
  }
};
