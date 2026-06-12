// brett/src/client/board-replay.ts
// Replay-Modus-Logik (Slice 5, T000472). Dark-Launch, gated by window.__brettFeatures['replay'].

import { STATE } from './state';
import { createReplayController, type ReplayBoardState } from './replay-engine';
import { renderTimeline } from './ui/timeline';

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

export function applyReplayStateToScene(state: ReplayBoardState): void {
  const figureArray = Object.values(state.figures);
  STATE.figures.length = 0;
  for (const fig of figureArray) {
    STATE.figures.push(fig as any);
  }
}
