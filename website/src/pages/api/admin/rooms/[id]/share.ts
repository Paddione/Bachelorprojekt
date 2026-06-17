import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getRoom, addRoomMessage } from '../../../../lib/messaging-db';
import { assertPathAllowed, createShareLink } from '../../../../lib/nextcloud-shares';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const roomId = parseInt(params.id!, 10);
  if (isNaN(roomId)) return new Response(JSON.stringify({ error: 'Invalid ID' }), { status: 400 });
  if (!await getRoom(roomId)) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });

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
    safePath = assertPathAllowed(path, { isAdmin: true, username: session.preferred_username });
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
  const msg = await addRoomMessage({ roomId, senderId: session.sub, body });
  return new Response(JSON.stringify({ message: msg }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
