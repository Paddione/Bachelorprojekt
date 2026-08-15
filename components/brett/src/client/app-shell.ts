// brett/src/client/app-shell.ts — Phase A / A2
//
// Client view-state machine + lazy-scene-mount scaffold.
//
// ZERO static browser imports: no `three`, no `./scene`, no `./board-boot` at the
// top level. The Three.js bundle stays deferred until the board view is first
// entered, via the injected `mountBoard` hook (which dynamic-imports board-boot
// in main.ts). This module is therefore importable under node/tsx for unit tests.
//
// Driven (in B) by the session's `sessionPhase` field — see spec §4.6 / §6a. In
// Phase A we read the phase as a runtime string and map `'lobby'` defensively so
// A stays decoupled from B's `Phase` union change (contract §1).

export type ViewState = 'menu' | 'lobby' | 'board' | 'summary';

/**
 * Pure phase → view mapping. Covers all current phases and defensively maps the
 * (B-only) `'lobby'` phase plus any unknown/absent phase → `'menu'`.
 */
export function viewForPhase(phase: string | null | undefined): ViewState {
  switch (phase) {
    case 'lobby':
      return 'lobby';
    case 'warmup':
    case 'active':
    case 'paused':
      return 'board';
    case 'ended':
      return 'summary';
    case 'menu':
      return 'menu';
    default:
      return 'menu';
  }
}

export interface AppShellHooks {
  /** Lazily mount the Three.js board. Invoked at most once, on first board entry. */
  mountBoard: () => void | Promise<void>;
  /** Render the resolved view; fires on every transition. */
  renderView: (v: ViewState) => void;
}

export interface AppShell {
  setPhase(phase: string | null | undefined): void;
  goTo(v: ViewState): void;
  getView(): ViewState;
}

/**
 * Create the view-state machine. Default view is `'menu'`; `mountBoard` fires
 * exactly once on the first `'board'` entry (lazy-once latch) and never again.
 */
export function createAppShell(hooks: AppShellHooks): AppShell {
  let view: ViewState = 'menu';
  let boardMounted = false;

  function enter(next: ViewState): void {
    view = next;
    if (next === 'board' && !boardMounted) {
      boardMounted = true;
      // mountBoard may be async (dynamic import); fire-and-forget by design.
      void hooks.mountBoard();
    }
    hooks.renderView(next);
  }

  return {
    setPhase(phase) {
      enter(viewForPhase(phase));
    },
    goTo(v) {
      enter(v);
    },
    getView() {
      return view;
    },
  };
}
