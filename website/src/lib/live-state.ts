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
