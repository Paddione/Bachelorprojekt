// website/src/pages/api/admin/rooms/[id].ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getRoom, updateRoom, getRoomMessages, addRoomMessage, getRoomMembers } from '../../../../lib/messaging-db';

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const roomId = parseInt(params.id!, 10);
  if (isNaN(roomId)) return new Response(JSON.stringify({ error: 'Invalid ID' }), { status: 400 });
  if (!await getRoom(roomId)) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  const url = new URL(request.url);
  const afterRaw = url.searchParams.get('after');
  const afterId = afterRaw ? parseInt(afterRaw, 10) : undefined;
  if (afterId !== undefined && isNaN(afterId)) return new Response(JSON.stringify({ error: 'Invalid after param' }), { status: 400 });
  const [messages, members] = await Promise.all([getRoomMessages(roomId, afterId), getRoomMembers(roomId)]);
  return new Response(JSON.stringify({ messages, members }), { headers: { 'Content-Type': 'application/json' } });
};

export const PUT: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const roomId = parseInt(params.id!, 10);
  if (isNaN(roomId)) return new Response(JSON.stringify({ error: 'Invalid ID' }), { status: 400 });
  if (!await getRoom(roomId)) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  const { name, archived } = await request.json() as { name?: string; archived?: boolean };
  await updateRoom(roomId, { name, archived });
  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const roomId = parseInt(params.id!, 10);
  if (isNaN(roomId)) return new Response(JSON.stringify({ error: 'Invalid ID' }), { status: 400 });
  if (!await getRoom(roomId)) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  const { body } = await request.json() as { body: string };
  if (!body?.trim()) return new Response(JSON.stringify({ error: 'body required' }), { status: 400 });
  const msg = await addRoomMessage({ roomId, senderId: session.sub, body: body.trim() });
  return new Response(JSON.stringify({ message: msg }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
