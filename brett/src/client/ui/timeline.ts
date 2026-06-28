// brett/src/client/ui/timeline.ts
// Timeline scrubber UI for replay mode (Slice 5, T000472).
// Renders a fixed overlay with a playhead scrubber, play/pause button,
// and phase markers. Uses CSS custom properties from skin.ts for theming.

import type { ReplayController, ReplayBoardState } from '../replay-engine';

// ── DOM references ───────────────────────────────────────────────

let container: HTMLElement | null = null;
let trackEl: HTMLElement | null = null;
let playheadEl: HTMLElement | null = null;
let timeDisplayEl: HTMLElement | null = null;
let animFrame: ReturnType<typeof setTimeout> | null = null;

let activeController: ReplayController | null = null;
let onSeekCallback: ((state: ReplayBoardState) => void) | null = null;

// ── Formatting ────────────────────────────────────────────────────

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Render the timeline overlay into `parentEl`.
 * Call after the board canvas is initialized.
 */
export function renderTimeline(
  parentEl: HTMLElement,
  ctrl: ReplayController,
  onSeek: (state: ReplayBoardState) => void,
): HTMLElement {
  activeController = ctrl;
  onSeekCallback = onSeek;

  // Create wrapper
  const wrap = document.createElement('div');
  wrap.id = 'brett-timeline';
  wrap.setAttribute('data-testid', 'brett-timeline');
  wrap.style.cssText = [
    'position:fixed',
    'bottom:16px',
    'left:50%',
    'transform:translateX(-50%)',
    'width:min(700px,90vw)',
    'background:var(--surface-2,#1e2128)',
    'border:1px solid var(--border,#333)',
    'border-radius:10px',
    'padding:12px 16px',
    'display:flex',
    'align-items:center',
    'gap:12px',
    'z-index:9999',
    'box-shadow:0 4px 24px rgba(0,0,0,0.5)',
  ].join(';');

  // Play/Pause button
  const playBtn = document.createElement('button');
  playBtn.setAttribute('data-testid', 'timeline-play-pause');
  playBtn.textContent = '▶';
  playBtn.style.cssText = 'background:none;border:none;color:var(--text,#e0e0e0);font-size:18px;cursor:pointer;min-width:24px';
  playBtn.addEventListener('click', () => {
    if (!activeController) return;
    if (activeController.isPlaying) {
      activeController.pause();
      playBtn.textContent = '▶';
    } else {
      activeController.play((state, pos) => {
        updatePlayhead(pos);
        if (onSeekCallback) onSeekCallback(state);
        if (!activeController?.isPlaying) playBtn.textContent = '▶';
      });
      playBtn.textContent = '⏸';
    }
  });

  // Track container
  const track = document.createElement('div');
  track.setAttribute('data-testid', 'timeline-track');
  track.style.cssText = 'flex:1;height:6px;background:var(--surface-3,#2c2f38);border-radius:3px;position:relative;cursor:pointer';

  // Playhead
  const playhead = document.createElement('div');
  playhead.setAttribute('data-testid', 'timeline-playhead');
  playhead.style.cssText = 'position:absolute;top:-5px;width:16px;height:16px;border-radius:50%;background:var(--accent,#4ea1ff);transform:translateX(-50%);left:0%';

  // Progress fill
  const fill = document.createElement('div');
  fill.setAttribute('data-testid', 'timeline-fill');
  fill.style.cssText = 'position:absolute;top:0;left:0;height:100%;background:var(--accent,#4ea1ff);border-radius:3px;width:0%';
  track.appendChild(fill);
  track.appendChild(playhead);

  // Click/drag scrubbing on track
  track.addEventListener('click', (e) => {
    if (!activeController) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetMs = ratio * activeController.totalDurationMs;
    const state = activeController.seek(targetMs);
    updatePlayhead(targetMs);
    if (onSeekCallback) onSeekCallback(state);
  });
  playheadEl = playhead;
  trackEl = track;

  // Time display
  const timeDisplay = document.createElement('span');
  timeDisplay.setAttribute('data-testid', 'timeline-time');
  timeDisplay.style.cssText = 'color:var(--text-muted,#888);font-size:12px;min-width:72px;text-align:right;font-variant-numeric:tabular-nums';
  timeDisplay.textContent = `0:00 / ${formatMs(ctrl.totalDurationMs)}`;
  timeDisplayEl = timeDisplay;

  // Assemble
  wrap.appendChild(playBtn);
  wrap.appendChild(track);
  wrap.appendChild(timeDisplay);
  parentEl.appendChild(wrap);
  container = wrap;

  return wrap;
}

/**
 * Update the playhead visual position to match positionMs.
 */
export function updatePlayhead(positionMs: number): void {
  if (!activeController || !trackEl || !playheadEl || !timeDisplayEl) return;
  const ratio = activeController.totalDurationMs > 0
    ? positionMs / activeController.totalDurationMs
    : 0;
  const pct = `${(ratio * 100).toFixed(2)}%`;
  playheadEl.style.left = pct;
  // Update fill
  const fill = trackEl.querySelector('[data-testid="timeline-fill"]') as HTMLElement | null;
  if (fill) fill.style.width = pct;
  timeDisplayEl.textContent = `${formatMs(positionMs)} / ${formatMs(activeController.totalDurationMs)}`;
}

/**
 * Remove the timeline overlay and clean up all state.
 */
export function destroyTimeline(): void {
  if (animFrame !== null) { clearTimeout(animFrame); animFrame = null; }
  activeController?.pause();
  container?.remove();
  container = null;
  trackEl = null;
  playheadEl = null;
  timeDisplayEl = null;
  activeController = null;
  onSeekCallback = null;
}
