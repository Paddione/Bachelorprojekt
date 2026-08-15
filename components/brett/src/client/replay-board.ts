// brett/src/client/replay-board.ts — replay mode helpers
// Extracted from board-boot.ts to keep it under 600 lines.
// maybeStartReplayMode / applyReplayStateToScene are re-exported from board-boot.ts
// so external callers are unaffected.

import { STATE } from './state';
import { createReplayController, type ReplayBoardState } from './replay-engine';
import { renderTimeline } from './ui/timeline';

/**
 * Check if replay mode is requested via URL params and, if so, start it.
 * Activated by: ?replay=1&room=<roomToken>
 * Gated by feature flag: window.__brettFeatures['replay'] (dark-launch).
 * Returns true iff replay mode was started (caller then skips the live WS connect).
 */
export async function maybeStartReplayMode(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof location === 'undefined') return false;
  const params = new URLSearchParams(location.search);
  const replayMode = params.get('replay') === '1';
  const featureEnabled = (window as any).__brettFeatures?.['replay'] === true;

  if (!replayMode || !featureEnabled) return false;

  const room = params.get('room');
  if (!room) {
    console.warn('[brett/replay] replay=1 but no room param');
    return false;
  }

  try {
    // Load events and initial snapshot from server (admin-gated endpoints).
    const [eventsRes, snapshotRes] = await Promise.all([
      fetch(`/api/sessions/${encodeURIComponent(room)}/events`),
      fetch(`/api/sessions/${encodeURIComponent(room)}/snapshot`),
    ]);
    if (!eventsRes.ok || !snapshotRes.ok) {
      console.error('[brett/replay] failed to load replay data', eventsRes.status, snapshotRes.status);
      return false;
    }

    const { events } = await eventsRes.json();
    const { state: initialState } = await snapshotRes.json();
    const ctrl = createReplayController(events ?? [], initialState ?? {});
    // Apply initial state to the scene, then render timeline overlay.
    applyReplayStateToScene(ctrl.seek(0));
    const appRoot = document.getElementById('app') ?? document.body;
    renderTimeline(appRoot, ctrl, (state: ReplayBoardState) => {
      applyReplayStateToScene(state);
    });
    return true;
  } catch (err) {
    console.error('[brett/replay] error starting replay mode:', err);
    return false;
  }
}

/**
 * Apply a replay board state to the local STATE without sending any WS messages.
 * Note: this populates STATE.figures with the reconstructed figure data; the
 * normal animation loop renders from STATE. Three.js figure objects (with .root,
 * .ring, etc.) are NOT rebuilt here — replay is a dark-launch read-only view and
 * full scene-graph reconstruction is out of scope for this slice.
 */
export function applyReplayStateToScene(state: ReplayBoardState): void {
  const figureArray = Object.values(state.figures);
  STATE.figures.length = 0;
  for (const fig of figureArray) {
    STATE.figures.push(fig as any);
  }
}
