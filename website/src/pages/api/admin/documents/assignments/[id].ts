import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import {
  getDocumentAssignmentById,
  revokeAssignment,
  extendAssignmentDeadline,
} from '../../../../../lib/documents-db';
import { logSigningEvent } from '../../../../../lib/signing/audit';

export const DELETE: APIRoute = async ({ params, request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  const { id } = params;
  if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });

  const assignment = await getDocumentAssignmentById(id);
  if (!assignment) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  if (assignment.status === 'completed') {
    return new Response(JSON.stringify({ error: 'Cannot revoke completed assignment' }), { status: 409 });
  }

  await revokeAssignment(id);
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0';
  await logSigningEvent(id, 'revoked', ip, null, session.email ?? null);

  return new Response(JSON.stringify({ success: true }), { status: 200 });
};

export const PATCH: APIRoute = async ({ params, request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  const { id } = params;
  if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });

  const { expiresAt } = await request.json();
  if (!expiresAt || isNaN(Date.parse(expiresAt))) {
    return new Response(JSON.stringify({ error: 'Valid expiresAt required' }), { status: 400 });
  }

  await extendAssignmentDeadline(id, new Date(expiresAt));
  return new Response(JSON.stringify({ success: true }), { status: 200 });
};
