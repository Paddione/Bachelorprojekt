// brett/src/types/events.ts
// Shared types for the event-log / replay system (Slice 5, T000472).

/** A single recorded mutation event as stored in and returned from session_events. */
export interface RecordedEvent {
  /** DB primary key (BIGSERIAL). */
  id: number;
  roomToken: string;
  /** Coaching session code (e.g. "ABC-123") or null in free-board mode. */
  sessionCode: string | null;
  /** Monotone per-room sequence number — guarantees insert order is preserved. */
  seq: number;
  /** The mutation type string (mirrors ClientMessage['type']). */
  eventType: string;
  /** Full payload of the original message (player-id stripped by server). */
  payload: Record<string, any>;
  /** ISO 8601 timestamp with timezone as returned by PostgreSQL. */
  recordedAt: string;
}

/** Lightweight metadata about a recorded session (for session-picker UI). */
export interface SessionMeta {
  roomToken: string;
  sessionCode: string | null;
  startedAt: string;   // ISO 8601
  endedAt: string | null;
  eventCount: number;
}

/** Full replay bundle returned by GET /api/sessions/:room/events. */
export interface ReplayBundle {
  events: RecordedEvent[];
  initialState: any;
  meta: SessionMeta;
}
