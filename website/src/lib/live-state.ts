import type { ActiveCallRoom } from './nextcloud-talk-db';
import type { AdminMeeting } from './website-db';

export type LiveState = 'empty' | 'stream' | 'rooms' | 'both';

export interface StreamLiveStatus {
  live: boolean;
  recording: boolean;
  recordingStartedAt?: string | null;
}

export interface ActivePoll {
  id: string;
  question: string;
  kind: 'multiple_choice' | 'text';
}

export interface ScheduleHint {
  startsAt: string;
  label: string;
  talkRoomToken?: string | null;
}

export interface LiveCockpitData {
  stream: StreamLiveStatus;
  rooms: ActiveCallRoom[];
  pollActive: ActivePoll | null;
  recentSessions: AdminMeeting[];
  schedule: { nextEvent: ScheduleHint | null };
}

export function deriveLiveState(data: LiveCockpitData): LiveState {
  const streamOn = data.stream.live || data.stream.recording;
  const roomsOn = data.rooms.length > 0;
  if (streamOn && roomsOn) return 'both';
  if (streamOn) return 'stream';
  if (roomsOn) return 'rooms';
  return 'empty';
}

import { listActiveCallRooms } from './nextcloud-talk-db';
import { listAllMeetings, pool } from './website-db';
import { RoomServiceClient } from 'livekit-server-sdk';

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devlivekit';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'devlivekitsecret1234567890abcdef';
const LIVEKIT_URL = process.env.LIVEKIT_SERVICE_URL || `http://${process.env.LIVEKIT_DOMAIN || 'livekit.localhost'}`;
const ROOM_NAME = 'main-stream';

async function fetchStreamStatus(): Promise<StreamLiveStatus> {
  const client = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
  try {
    const participants = await client.listParticipants(ROOM_NAME);
    const live = participants.some((p) => (p.tracks ?? []).length > 0);
    return { live, recording: false, recordingStartedAt: null };
  } catch {
    return { live: false, recording: false, recordingStartedAt: null };
  }
}

async function fetchActivePoll(): Promise<ActivePoll | null> {
  try {
    const r = await pool.query<{ id: string; question: string; kind: 'multiple_choice' | 'text' }>(
      `SELECT id, question, kind FROM polls WHERE closed_at IS NULL ORDER BY created_at DESC LIMIT 1`
    );
    return r.rows[0] ?? null;
  } catch (err) {
    console.error('[live-state] fetchActivePoll failed:', err);
    return null;
  }
}

async function fetchRecentSessions(): Promise<AdminMeeting[]> {
  try {
    return await listAllMeetings({ limit: 12 });
  } catch (err) {
    console.error('[live-state] listAllMeetings failed:', err);
    return [];
  }
}

export async function fetchLiveCockpitData(): Promise<LiveCockpitData> {
  const [stream, rooms, pollActive, recentSessions] = await Promise.all([
    fetchStreamStatus(),
    listActiveCallRooms(),
    fetchActivePoll(),
    fetchRecentSessions(),
  ]);
  return {
    stream,
    rooms,
    pollActive,
    recentSessions,
    schedule: { nextEvent: null },
  };
}
