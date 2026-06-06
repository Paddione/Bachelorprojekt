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
import { createAppShell, type ViewState, type AppShell } from './app-shell';

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
function renderLobby(appShell: AppShell, user: MenuUser): void {
  const lobbyRoot = getLobbyRoot();
  if (!lobbyRoot) return;
  // Lazily import the ws-client lobby store to avoid pulling the board bundle.
  import('./ws-client').then((ws) => {
    const state = ws.getLobbyState();
    const isLeader = state.roster[user.userId]?.role === 'leiter';
    const vm = buildLobbyViewModel(state, { isLeader });
    mountLobby(lobbyRoot, vm, {
      onStart: () => ws.sendClient({ type: 'admin_round_start' }),
      onToggleReady: (ready) => ws.sendClient({ type: 'lobby_set_ready', ready }),
      onCopyCode: (code) => { try { navigator.clipboard?.writeText(code); } catch { /* noop */ } },
    });
  });
}

async function main(): Promise<void> {
  injectTheme();
  injectPrimitivesStyles();
  injectMenuStyles();
  injectLobbyStyles();

  const user = await fetchUser();

  const appShell = createAppShell({
    mountBoard: () => import('./board-boot').then((m) => m.bootBoard()),
    renderView: (v: ViewState) => {
      renderView(v);
      if (v === 'lobby') renderLobby(appShell, user);
    },
  });

  // Server-driven phase changes (from the live socket) route the view-machine:
  // menu → lobby → board (active/paused) → summary (ended). Late-join into an
  // already-active room jumps straight to the board.
  void import('./ws-client').then((ws) => {
    ws.setPhaseChangeHandler((phase) => appShell.setPhase(phase));
    ws.setLobbyChangeHandler(() => {
      if (appShell.getView() === 'lobby') renderLobby(appShell, user);
    });
  });

  const hasRoom = new URLSearchParams(location.search).has('room');
  if (hasRoom) {
    // Deep-link / legacy coaching path: straight to the board, no menu.
    appShell.goTo('board');
    return;
  }

  const menuRoot = getMenuRoot();
  if (menuRoot) {
    mountMenu(menuRoot, {
      user,
      onNewSession: () => appShell.goTo('board'),
      onJoin: (code) => { window.location.href = `/api/join?code=${encodeURIComponent(code)}`; },
      onSavedList: () => appShell.goTo('board'),
      onSettings: () => { /* Phase A: placeholder — settings screen lands later */ },
    });
  }
  // Stay in 'menu' (default view) — render the menu chrome.
  renderView('menu');
}

main();
