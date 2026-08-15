// brett/src/client/main.ts — Phase A / A5
//
// Thin, Three-free entry point. Injects the design system, builds the view-state
// machine, and either deep-links to the board (?room present, legacy/coaching
// path) or renders the Hauptmenü first. The 3D scene + Three.js are mounted
// LAZILY via `import('./board-boot')` only on first board-view entry — so the
// menu never pulls the heavy bundle.

import { injectTheme } from './ui/theme';
import { injectPrimitivesStyles } from './ui/primitives';
import { injectMenuStyles, mountMenu, type MenuUser } from './ui/menu';
import { injectLobbyStyles, mountLobby, buildLobbyViewModel } from './ui/lobby';
import { buildCoachingStepsPayload } from './lobby-coaching';
import { createAppShell, type ViewState } from './app-shell';
import { currentUser } from './state';

function getMenuRoot(): HTMLElement | null {
  return document.getElementById('brett-menu');
}

function getLobbyRoot(): HTMLElement | null {
  return document.getElementById('brett-lobby');
}

async function fetchUser(): Promise<MenuUser> {
  try {
    const me = await (await fetch('/auth/me')).json();
    return {
      userId: me.userId ?? 'anon',
      name: me.name ?? 'Teilnehmer',
      isAdmin: !!me.isAdmin,
    };
  } catch {
    return { userId: 'anon', name: 'Teilnehmer', isAdmin: false };
  }
}

function renderView(v: ViewState): void {
  const menuRoot = getMenuRoot();
  const lobbyRoot = getLobbyRoot();
  const showMenu = v === 'menu';
  const showLobby = v === 'lobby';
  if (menuRoot) menuRoot.hidden = !showMenu;
  if (lobbyRoot) lobbyRoot.hidden = !showLobby;
  // Board DOM (topbar, status-pill, drawers) lives in index.html; hide it while
  // a non-board overlay (menu/lobby) is up so the empty board chrome doesn't show.
  document.body.classList.toggle('brett-menu-active', showMenu || showLobby);
}

// Re-render the lobby screen from the live lobby store (driven by ws-client).
function renderLobby(user: MenuUser): void {
  const lobbyRoot = getLobbyRoot();
  if (!lobbyRoot) return;
  // Lazily import the ws-client lobby store to avoid pulling the board bundle.
  import('./ws-client').then((ws) => {
    const state = ws.getLobbyState();
    const isLeader = state.roster[user.userId]?.role === 'leiter'
      || state.adminTokenHolder === user.userId;
    const vm = buildLobbyViewModel(state, { isLeader });
    mountLobby(lobbyRoot, vm, {
      onStart: () => ws.sendClient({ type: 'admin_round_start' }),
      onToggleReady: (ready) => ws.sendClient({ type: 'lobby_set_ready', ready }),
      onCopyCode: (code) => { try { navigator.clipboard?.writeText(code); } catch { /* noop */ } },
      onCoachingSteps: isLeader
        ? (raw) => {
            const payload = buildCoachingStepsPayload(raw);
            if (payload) ws.sendClient({ type: 'admin_coaching_steps_set', steps: payload.steps, index: payload.index });
          }
        : undefined,
      onSetTemplate: isLeader
        ? (id) => ws.sendClient({ type: 'admin_set_template', templateId: id })
        : undefined,
      onSetOptik: isLeader
        ? (s) => ws.sendClient({ type: 'admin_set_optik', settings: s })
        : undefined,
    });
  });
}

async function main(): Promise<void> {
  injectTheme();
  injectPrimitivesStyles();
  injectMenuStyles();
  injectLobbyStyles();

  const user = await fetchUser();

  // Seed the shared currentUser BEFORE any connectWS so the canonical identity is
  // threaded into the /sync handshake (?playerId=) on the very first connection —
  // including the lobby-bootstrap connect, which can run before board-boot's own
  // /auth/me fetch. Keeps the late-join reconnect guard accurate. board-boot may
  // re-fetch and refine name/userId later (idempotent).
  if (user.userId && user.userId !== 'anon') {
    currentUser.userId = user.userId;
    currentUser.name = user.name;
  }

  const appShell = createAppShell({
    mountBoard: () => import('./board-boot').then((m) => m.bootBoard()),
    renderView: (v: ViewState) => {
      renderView(v);
      if (v === 'lobby') renderLobby(user);
    },
  });

  // Server-driven phase changes (from the live socket) route the view-machine:
  // menu → lobby → board (active/paused) → summary (ended). Late-join into an
  // already-active room jumps straight to the board.
  const wsMod = await import('./ws-client');
  wsMod.setPhaseChangeHandler((phase) => appShell.setPhase(phase));
  wsMod.setLobbyChangeHandler(() => {
    if (appShell.getView() === 'lobby') renderLobby(user);
  });

  const hasRoom = new URLSearchParams(location.search).has('room');
  if (hasRoom) {
    // Deep-link / legacy coaching path: straight to the board, no menu.
    // REG-2: open the socket here too (bootBoard also calls connectWS, but
    // connectWS is idempotent) so the snapshot's phase can route the view machine
    // into the lobby screen if the deep-linked session is in `lobby`.
    wsMod.connectWS();
    appShell.goTo('board');
    return;
  }

  const menuRoot = getMenuRoot();
  if (menuRoot) {
    mountMenu(menuRoot, {
      user,
      // FE-1/REG-4: actually create a session. Open the socket (idempotent), then
      // send admin_session_create on WS-OPEN (never synchronously — that would race
      // the handshake). The resulting session_created + session_phase_change('lobby')
      // drive the view machine into the lobby screen via the phase-change handler.
      onNewSession: () => startNewSession(wsMod),
      onJoin: (code) => { window.location.href = `/api/join?code=${encodeURIComponent(code)}`; },
      onSavedList: () => appShell.goTo('board'),
      onSettings: () => { /* disabled menu item — see FE-4; settings screen lands later */ },
    });
  }
  // Stay in 'menu' (default view) — render the menu chrome.
  renderView('menu');
}

// FE-1/REG-4: open the WS (REG-2: idempotent) and register a ONE-SHOT WS-open
// hook that emits admin_session_create after the handshake. The server seeds the
// `lobby` phase + a session code and broadcasts session_phase_change('lobby'),
// which the phase-change handler routes into the lobby view.
function startNewSession(wsMod: typeof import('./ws-client')): void {
  // If the socket is already OPEN (connectWS would early-return and never re-fire
  // the open event), send immediately; otherwise arm a one-shot open hook.
  if (wsMod.isWsOpen()) {
    wsMod.sendClient({ type: 'admin_session_create' });
    return;
  }
  wsMod.setWsOpenHandler(() => {
    wsMod.setWsOpenHandler(null); // one-shot
    wsMod.sendClient({ type: 'admin_session_create' });
  });
  wsMod.connectWS();
}

main();
