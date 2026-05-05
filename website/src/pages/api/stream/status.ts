// website/src/pages/api/stream/status.ts
import type { APIRoute } from 'astro';
import { RoomServiceClient } from 'livekit-server-sdk';

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devlivekit';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'devlivekitsecret1234567890abcdef';
const LIVEKIT_URL = process.env.LIVEKIT_SERVICE_URL || `http://${process.env.LIVEKIT_DOMAIN || 'livekit.localhost'}`;
const ROOM_NAME = 'main-stream';

export const GET: APIRoute = async () => {
  const roomClient = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  try {
    const participants = await roomClient.listParticipants(ROOM_NAME);
    const live = participants.some((p) => (p.tracks ?? []).length > 0);
    return new Response(JSON.stringify({ live }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch {
    // Room doesn't exist yet → not live
    return new Response(JSON.stringify({ live: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
};
