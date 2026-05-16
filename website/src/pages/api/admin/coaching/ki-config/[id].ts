import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { updateKiProvider, deleteKiProvider, type UpdateKiProviderFields } from '../../../../../lib/coaching-ki-config-db';
import { pool } from '../../../../../lib/website-db';

export const prerender = false;

const ALLOWED_FIELDS: (keyof UpdateKiProviderFields)[] = [
  'modelName', 'displayName', 'apiKey', 'apiEndpoint',
  'temperature', 'maxTokens', 'topP', 'systemPrompt', 'notes',
  'topK', 'thinkingMode', 'presencePenalty', 'frequencyPenalty',
  'safePrompt', 'randomSeed', 'organizationId', 'euEndpoint',
];

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return new Response(JSON.stringify({ error: 'Ungültige ID' }), { status: 400, headers: { 'content-type': 'application/json' } });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  if ('displayName' in body && (typeof body.displayName !== 'string' || (body.displayName as string).trim() === '')) {
    return new Response(JSON.stringify({ error: 'displayName darf nicht leer sein' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const fields: UpdateKiProviderFields = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in body) {
      if (key === 'displayName') {
        fields.displayName = (body.displayName as string).trim();
      } else {
        (fields as Record<string, unknown>)[key] = body[key];
      }
    }
  }

  const provider = await updateKiProvider(pool, id, fields);
  return new Response(JSON.stringify({ provider }), { headers: { 'content-type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return new Response(JSON.stringify({ error: 'Ungültige ID' }), { status: 400, headers: { 'content-type': 'application/json' } });

  try {
    await deleteKiProvider(pool, id);
    return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
};
