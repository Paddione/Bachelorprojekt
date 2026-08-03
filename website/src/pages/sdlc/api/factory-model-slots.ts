import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../lib/auth';
import { readAllSlots, writeSlot, modelCatalog, isPhase } from '../../lib/factory-model-slots';

export const prerender = false;

function authGuard(session: Awaited<ReturnType<typeof getSession>>): Response | null {
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}

export const GET: APIRoute = async ({ request, locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  const guard = authGuard(session);
  if (guard) return guard;

  try {
    const slots = await readAllSlots();
    const catalog = await modelCatalog();
    return new Response(JSON.stringify({ slots, catalog }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    locals.requestLogger.error({ err }, '[api/factory-model-slots] GET error:');
    return new Response(JSON.stringify({ error: 'fetch_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const PUT: APIRoute = async ({ request, locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  const guard = authGuard(session);
  if (guard) return guard;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { phase, provider, modelId, baseUrl } = body;

  if (!isPhase(phase)) {
    return new Response(JSON.stringify({ error: 'invalid_value', field: 'phase' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (typeof provider !== 'string' || !provider.trim()) {
    return new Response(JSON.stringify({ error: 'invalid_value', field: 'provider' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (typeof modelId !== 'string' || !modelId.trim()) {
    return new Response(JSON.stringify({ error: 'invalid_value', field: 'modelId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cleanBaseUrl = typeof baseUrl === 'string' && baseUrl.trim() ? baseUrl.trim() : null;

  try {
    await writeSlot(phase, provider, modelId, cleanBaseUrl, session!.preferred_username);
    const slots = await readAllSlots();
    return new Response(JSON.stringify(slots), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    locals.requestLogger.error({ err }, '[api/factory-model-slots] PUT error:');
    return new Response(JSON.stringify({ error: 'update_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
