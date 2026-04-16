// website/src/pages/api/admin/rooms/[id].ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { updateRoom, getRoomMessages, addRoomMessage, getRoomMembers } from '../../../../lib/messaging-db';

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const roomId = parseInt(params.id!, 10);
  if (isNaN(roomId)) return new Response(JSON.stringify({ error: 'Invalid ID' }), { status: 400 });
  const url = new URL(request.url);
  const afterId = url.searchParams.get('after') ? parseInt(url.searchParams.get('after')!, 10) : undefined;
  const [messages, members] = await Promise.all([getRoomMessages(roomId, afterId), getRoomMembers(roomId)]);
  return new Response(JSON.stringify({ messages, members }), { headers: { 'Content-Type': 'application/json' } });
};

export const PUT: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const roomId = parseInt(params.id!, 10);
  if (isNaN(roomId)) return new Response(JSON.stringify({ error: 'Invalid ID' }), { status: 400 });
  const { name, archived } = await request.json() as { name?: string; archived?: boolean };
  await updateRoom(roomId, { name, archived });
  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const roomId = parseInt(params.id!, 10);
  if (isNaN(roomId)) return new Response(JSON.stringify({ error: 'Invalid ID' }), { status: 400 });
  const { body } = await request.json() as { body: string };
  if (!body?.trim()) return new Response(JSON.stringify({ error: 'body required' }), { status: 400 });
  const msg = await addRoomMessage({ roomId, senderId: session.sub, senderName: session.name ?? session.preferred_username, body: body.trim() });
  return new Response(JSON.stringify({ message: msg }), { headers: { 'Content-Type': 'application/json' } });
};
