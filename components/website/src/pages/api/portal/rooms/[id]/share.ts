import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import { getCustomerByEmail, getRoom, isRoomMember, addRoomMessage } from '../../../../../lib/messaging-db';
import { assertPathAllowed, createShareLink } from '../../../../../lib/nextcloud-shares';

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

  const { path, shareType, permissions, password, expireDate, note } = await request.json() as {
    path: string;
    shareType: number;
    permissions?: number;
    password?: string;
    expireDate?: string;
    note?: string;
  };

  if (!path?.trim()) return new Response(JSON.stringify({ error: 'path required' }), { status: 400 });
  if (shareType == null) return new Response(JSON.stringify({ error: 'shareType required' }), { status: 400 });

  let safePath: string;
  try {
    safePath = assertPathAllowed(path, { isAdmin: false, username: session.preferred_username });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 403 });
  }

  let result;
  try {
    result = await createShareLink({ path: safePath, shareType, permissions, password, expireDate, note });
  } catch (err) {
    return new Response(JSON.stringify({ error: `Share-Erstellung fehlgeschlagen: ${(err as Error).message}` }), { status: 502 });
  }

  const body = (note ? note + ' ' : '') + result.url;
  const msg = await addRoomMessage({ roomId, senderId: session.sub, senderCustomerId: customer.id, body });
  return new Response(JSON.stringify({ message: msg }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
