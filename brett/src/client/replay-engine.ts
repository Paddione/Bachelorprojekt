// brett/src/client/replay-engine.ts
// Client-side replay engine for Timeline/Replay (Slice 5, T000472).
// Pure computation — no DOM, no WS, no Three.js imports.
// Reconstructs board state at any point in time by replaying events
// on top of an initial snapshot.

import type { RecordedEvent } from '../types/events';

// ── Types ────────────────────────────────────────────────────────

/** Simplified board state for replay purposes. */
export interface ReplayBoardState {
  figures: Record<string, any>;
  stiffness: number;
  phase: string;
  sessionCode: string | null;
  coachingSteps: { steps: string[]; index: number } | null;
  optik: any | null;
}

/** A replay controller returned by createReplayController. */
export interface ReplayController {
  /** Seek to a position in milliseconds from the start. Returns the board state at that point. */
  seek(positionMs: number): ReplayBoardState;
  /** Start auto-playback. Calls onFrame on each animation tick. */
  play(onFrame: (state: ReplayBoardState, positionMs: number) => void): void;
  /** Pause auto-playback. */
  pause(): void;
  isPlaying: boolean;
  /** Total duration of the recording in milliseconds. */
  readonly totalDurationMs: number;
  /** Current playback position in milliseconds. */
  currentPositionMs: number;
  /** Raw events (sorted by seq). */
  readonly events: RecordedEvent[];
}

// ── Event application ────────────────────────────────────────────

/**
 * Apply a single recorded event to a replay board state.
 * Returns a new state object (immutable update pattern).
 */
export function applyEventToState(state: ReplayBoardState, event: RecordedEvent): ReplayBoardState {
  const figures = { ...state.figures };
  const p = event.payload;

  switch (event.eventType) {
    case 'add': {
      // `add` payloads carry the figure either flat or under `figure`/`fig`.
      const fig = p.figure ?? p.fig ?? p;
      if (fig?.id) figures[fig.id] = { ...fig };
      break;
    }
    case 'move': {
      if (p.id && figures[p.id]) {
        figures[p.id] = { ...figures[p.id], x: p.x, z: p.z, facingY: p.facingY };
      }
      break;
    }
    case 'update': {
      if (p.id && figures[p.id] && p.changes) {
        const existing = figures[p.id];
        const { id: _id, ownerId: _ownerId, ...safeChanges } = p.changes;
        const merged = { ...existing, ...safeChanges };
        if (safeChanges.appearance && existing.appearance) {
          merged.appearance = {
            ...existing.appearance,
            ...safeChanges.appearance,
            accessories: { ...(existing.appearance.accessories || {}), ...(safeChanges.appearance?.accessories || {}) },
          };
        }
        figures[p.id] = merged;
      }
      break;
    }
    case 'delete': {
      if (p.id) delete figures[p.id];
      break;
    }
    case 'clear': {
      // Remove all non-sentinel figures
      for (const k of Object.keys(figures)) {
        if (!k.startsWith('__')) delete figures[k];
      }
      break;
    }
    case 'stiffness': {
      return { ...state, figures, stiffness: typeof p.value === 'number' ? p.value : state.stiffness };
    }
    case 'session_phase_change': {
      return { ...state, figures, phase: p.phase ?? state.phase };
    }
    case 'figure_type_set': {
      if (p.figureId && figures[p.figureId]) {
        figures[p.figureId] = { ...figures[p.figureId], figureType: p.figureType };
      }
      break;
    }
    case 'figure_possess': {
      if (p.figureId && figures[p.figureId]) {
        figures[p.figureId] = { ...figures[p.figureId], possessor: p.playerId };
      }
      break;
    }
    case 'figure_release': {
      if (p.figureId && figures[p.figureId]) {
        figures[p.figureId] = { ...figures[p.figureId], possessor: null };
      }
      break;
    }
    default:
      // Unknown event type — ignore, return state unchanged
      return { ...state, figures };
  }

  return { ...state, figures };
}

// ── State reconstruction ─────────────────────────────────────────

/**
 * Reconstruct the board state at a given timestamp by replaying all events
 * up to (and including) that point.
 * Uses binary search to find the cutoff index, then replays sequentially.
 */
export function seekToTimestamp(
  events: RecordedEvent[],
  initialState: ReplayBoardState,
  targetMs: number,
): ReplayBoardState {
  if (events.length === 0) return { ...initialState, figures: { ...initialState.figures } };

  const startMs = new Date(events[0].recordedAt).getTime();
  let cutoffIdx = 0;

  // Binary search for the last event with recordedAt <= startMs + targetMs
  let lo = 0, hi = events.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const eventMs = new Date(events[mid].recordedAt).getTime() - startMs;
    if (eventMs <= targetMs) {
      cutoffIdx = mid + 1;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  let state: ReplayBoardState = { ...initialState, figures: { ...initialState.figures } };
  for (let i = 0; i < cutoffIdx; i++) {
    state = applyEventToState(state, events[i]);
  }
  return state;
}

// ── Controller factory ───────────────────────────────────────────

/**
 * Create a replay controller for a set of recorded events and an initial state.
 * The initial state should be the board state at the time recording started
 * (typically the first snapshot from GET /api/sessions/:room/snapshot).
 */
export function createReplayController(
  events: RecordedEvent[],
  initialState: any,
): ReplayController {
  // Normalize initialState to ReplayBoardState
  const baseState: ReplayBoardState = {
    figures: initialState?.figures
      ? (Array.isArray(initialState.figures)
        ? Object.fromEntries(initialState.figures.map((f: any) => [f.id, f]))
        : { ...initialState.figures })
      : {},
    stiffness: initialState?.stiffness ?? 0.65,
    phase: initialState?.sessionPhase ?? initialState?.phase ?? 'lobby',
    sessionCode: initialState?.sessionCode ?? null,
    coachingSteps: initialState?.coachingSteps ?? null,
    optik: initialState?.optik ?? null,
  };

  // Sort events by seq (should already be sorted from DB, but be defensive)
  const sortedEvents = [...events].sort((a, b) => a.seq - b.seq);

  const startMs = sortedEvents.length > 0
    ? new Date(sortedEvents[0].recordedAt).getTime()
    : Date.now();
  const endMs = sortedEvents.length > 0
    ? new Date(sortedEvents[sortedEvents.length - 1].recordedAt).getTime()
    : startMs;
  const totalDurationMs = Math.max(0, endMs - startMs);

  let currentPositionMs = 0;
  let isPlaying = false;
  let rafHandle: ReturnType<typeof setTimeout> | null = null;
  let playStartWallMs = 0;
  let playStartPositionMs = 0;

  const controller: ReplayController = {
    get events() { return sortedEvents; },
    get totalDurationMs() { return totalDurationMs; },
    get currentPositionMs() { return currentPositionMs; },
    set currentPositionMs(v: number) { currentPositionMs = Math.max(0, Math.min(v, totalDurationMs)); },
    get isPlaying() { return isPlaying; },
    set isPlaying(v: boolean) { isPlaying = v; },

    seek(positionMs: number): ReplayBoardState {
      controller.currentPositionMs = positionMs;
      return seekToTimestamp(sortedEvents, baseState, currentPositionMs);
    },

    play(onFrame: (state: ReplayBoardState, positionMs: number) => void): void {
      if (isPlaying) return;
      isPlaying = true;
      playStartWallMs = Date.now();
      playStartPositionMs = currentPositionMs;

      function tick() {
        if (!isPlaying) return;
        const elapsed = Date.now() - playStartWallMs;
        currentPositionMs = Math.min(playStartPositionMs + elapsed, totalDurationMs);
        const state = seekToTimestamp(sortedEvents, baseState, currentPositionMs);
        onFrame(state, currentPositionMs);
        if (currentPositionMs >= totalDurationMs) {
          isPlaying = false;
          return;
        }
        rafHandle = setTimeout(tick, 16); // ~60fps
      }
      tick();
    },

    pause(): void {
      isPlaying = false;
      if (rafHandle !== null) { clearTimeout(rafHandle); rafHandle = null; }
    },
  };

  return controller;
}
