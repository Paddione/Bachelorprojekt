// website/src/pages/api/portal/rooms/[id]/messages.ts
import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import { getCustomerByEmail, getRoom, isRoomMember, getRoomMessages, addRoomMessage, markRoomMessagesRead } from '../../../../../lib/messaging-db';

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const customer = await getCustomerByEmail(session.email);
  if (!customer) return new Response(JSON.stringify({ error: 'Customer not found' }), { status: 403 });
  const roomId = parseInt(params.id!, 10);
  if (isNaN(roomId)) return new Response(JSON.stringify({ error: 'Invalid ID' }), { status: 400 });
  if (!await isRoomMember(roomId, customer.id)) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  const url = new URL(request.url);
  const afterRaw = url.searchParams.get('after');
  const afterId = afterRaw ? parseInt(afterRaw, 10) : undefined;
  if (afterId !== undefined && isNaN(afterId)) return new Response(JSON.stringify({ error: 'Invalid after param' }), { status: 400 });
  const messages = await getRoomMessages(roomId, afterId);
  if (messages.length > 0) {
    await markRoomMessagesRead(roomId, customer.id, messages[messages.length - 1].id);
  }
  return new Response(JSON.stringify({ messages }), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const customer = await getCustomerByEmail(session.email);
  if (!customer) return new Response(JSON.stringify({ error: 'Customer not found' }), { status: 403 });
  const roomId = parseInt(params.id!, 10);
  if (isNaN(roomId)) return new Response(JSON.stringify({ error: 'Invalid ID' }), { status: 400 });
  if (!await isRoomMember(roomId, customer.id)) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  const room = await getRoom(roomId);
  if (room?.archived_at) return new Response(JSON.stringify({ error: 'Room is archived' }), { status: 403 });
  const { body } = await request.json() as { body: string };
  if (!body?.trim()) return new Response(JSON.stringify({ error: 'body required' }), { status: 400 });
  const msg = await addRoomMessage({ roomId, senderId: session.sub, senderName: customer.name, body: body.trim() });
  return new Response(JSON.stringify({ message: msg }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
