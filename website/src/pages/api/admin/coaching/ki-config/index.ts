import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listKiProviders, createKiProvider } from '../../../../../lib/coaching-ki-config-db';
import { pool } from '../../../../../lib/website-db';

export const prerender = false;

const ALL_FIELDS = [
  'apiKey', 'apiEndpoint', 'modelName', 'temperature', 'maxTokens', 'topP',
  'topK', 'thinkingMode', 'presencePenalty', 'frequencyPenalty',
  'safePrompt', 'randomSeed', 'organizationId', 'euEndpoint',
  'systemPrompt', 'notes',
] as const;

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const brand = process.env.BRAND || 'mentolder';
  const providers = await listKiProviders(pool, brand);
  return new Response(JSON.stringify({ providers }), { headers: { 'content-type': 'application/json' } });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  if (!displayName) {
    return new Response(JSON.stringify({ error: 'displayName darf nicht leer sein' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-') : '';
  if (!slug) {
    return new Response(JSON.stringify({ error: 'slug darf nicht leer sein' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const rawFields = Array.isArray(body.enabledFields) ? body.enabledFields as string[] : [];
  const enabledFields = rawFields.filter(f => (ALL_FIELDS as readonly string[]).includes(f));

  const brand = process.env.BRAND || 'mentolder';
  try {
    const provider = await createKiProvider(pool, brand, {
      displayName,
      provider: `custom_${slug}`,
      enabledFields,
    });
    return new Response(JSON.stringify({ provider }), { status: 201, headers: { 'content-type': 'application/json' } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('unique') || msg.includes('UNIQUE') || msg.includes('duplicate')) {
      return new Response(JSON.stringify({ error: `Slug '${slug}' bereits vergeben` }), { status: 409, headers: { 'content-type': 'application/json' } });
    }
    throw e;
  }
};
