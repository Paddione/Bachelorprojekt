// website/src/pages/api/admin/rooms.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { listRoomsForAdmin, createRoom } from '../../../lib/messaging-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const rooms = await listRoomsForAdmin();
  return new Response(JSON.stringify({ rooms }), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const { name } = await request.json() as { name: string };
  if (!name?.trim()) return new Response(JSON.stringify({ error: 'name required' }), { status: 400 });
  const room = await createRoom(name.trim(), session.sub);
  return new Response(JSON.stringify({ room }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
