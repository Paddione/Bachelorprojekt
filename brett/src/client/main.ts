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
import { createAppShell, type ViewState } from './app-shell';

function getMenuRoot(): HTMLElement | null {
  return document.getElementById('brett-menu');
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
  const showMenu = v === 'menu';
  if (menuRoot) menuRoot.hidden = !showMenu;
  // Board DOM (topbar, status-pill, drawers) lives in index.html; hide it while
  // the menu overlay is up so the empty board chrome doesn't show behind it.
  document.body.classList.toggle('brett-menu-active', showMenu);
}

async function main(): Promise<void> {
  injectTheme();
  injectPrimitivesStyles();
  injectMenuStyles();

  const appShell = createAppShell({
    mountBoard: () => import('./board-boot').then((m) => m.bootBoard()),
    renderView,
  });

  const hasRoom = new URLSearchParams(location.search).has('room');
  if (hasRoom) {
    // Deep-link / legacy coaching path: straight to the board, no menu.
    appShell.goTo('board');
    return;
  }

  const user = await fetchUser();
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
