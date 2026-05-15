import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { upsertStepTemplate, deleteStepTemplate, listStepTemplates } from '../../../../../lib/coaching-templates-db';
import { pool } from '../../../../../lib/website-db';

export const prerender = false;

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const brand = process.env.BRAND || 'mentolder';
  let body: Parameters<typeof upsertStepTemplate>[1];
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  const t = await upsertStepTemplate(pool, { ...body, brand });
  return new Response(JSON.stringify({ template: t }), { headers: { 'content-type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const brand = process.env.BRAND || 'mentolder';
  const templates = await listStepTemplates(pool, brand);
  const target = templates.find(t => t.id === params.id);
  if (!target) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
  const activeForStep = templates.filter(t => t.stepNumber === target.stepNumber && t.isActive);
  if (activeForStep.length <= 1 && target.isActive) {
    return new Response(JSON.stringify({ error: 'Letztes aktives Template für diesen Schritt kann nicht gelöscht werden' }), { status: 409, headers: { 'content-type': 'application/json' } });
  }
  await deleteStepTemplate(pool, params.id as string);
  return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
};
