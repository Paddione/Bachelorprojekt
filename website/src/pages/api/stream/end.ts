// website/src/pages/api/stream/end.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { IngressClient, RoomServiceClient } from 'livekit-server-sdk';

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devlivekit';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'devlivekitsecret1234567890abcdef';
const LIVEKIT_URL = process.env.LIVEKIT_SERVICE_URL || `http://${process.env.LIVEKIT_DOMAIN || 'livekit.localhost'}`;
const ROOM_NAME = 'main-stream';

// POST /api/stream/end
// Forcibly ends the active livestream:
//   - deletes any active LiveKit Ingress (RTMP/OBS publishers)
//   - removes every participant in the room that is publishing tracks
// Idempotent: returns 200 with counts even when nothing was active.
export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const ingressClient = new IngressClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
  const roomClient = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  let ingressDeleted = 0;
  let participantsRemoved = 0;
  const errors: string[] = [];

  try {
    const ingresses = await ingressClient.listIngress({ roomName: ROOM_NAME });
    for (const ing of ingresses) {
      if (!ing.ingressId) continue;
      try {
        await ingressClient.deleteIngress(ing.ingressId);
        ingressDeleted++;
      } catch (e) {
        errors.push(`ingress ${ing.ingressId}: ${(e as Error).message}`);
      }
    }
  } catch (e) {
    errors.push(`listIngress: ${(e as Error).message}`);
  }

  try {
    const participants = await roomClient.listParticipants(ROOM_NAME);
    for (const p of participants) {
      const isPublishing = (p.tracks ?? []).length > 0;
      if (!isPublishing) continue;
      try {
        await roomClient.removeParticipant(ROOM_NAME, p.identity);
        participantsRemoved++;
      } catch (e) {
        errors.push(`removeParticipant ${p.identity}: ${(e as Error).message}`);
      }
    }
  } catch (e) {
    // Room may simply not exist yet — treat as "nothing to end".
    if (!String(e).includes('not found')) {
      errors.push(`listParticipants: ${(e as Error).message}`);
    }
  }

  return new Response(
    JSON.stringify({ ingressDeleted, participantsRemoved, errors }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
