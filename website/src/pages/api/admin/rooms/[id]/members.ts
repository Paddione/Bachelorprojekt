// website/src/pages/api/admin/rooms/[id]/members.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { addRoomMember, removeRoomMember } from '../../../../../lib/messaging-db';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const roomId = parseInt(params.id!, 10);
  if (isNaN(roomId)) return new Response(JSON.stringify({ error: 'Invalid ID' }), { status: 400 });
  const { customerId, action } = await request.json() as { customerId: string; action: 'add' | 'remove' };
  if (!customerId || !['add', 'remove'].includes(action)) {
    return new Response(JSON.stringify({ error: 'customerId and action (add|remove) required' }), { status: 400 });
  }
  if (action === 'add') await addRoomMember(roomId, customerId);
  else await removeRoomMember(roomId, customerId);
  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
};
