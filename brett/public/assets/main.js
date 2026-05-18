// brett/public/assets/main.js — ESM entry, Phase 4: full mode-select→loadout→combat flow.
import { connect } from './ws.mjs';
import { createModeState } from './mode-state.mjs';
import { showModeSelect } from './mode-select.mjs';
import { showLoadoutModal } from './loadout-modal.mjs';

const ws = connect();

const banner = document.getElementById('reconnect-banner');
ws.on('reconnect-pending', ({ delay }) => {
  if (!banner) return;
  banner.hidden = false;
  banner.textContent = `Verbindung verloren · reconnect in ${Math.ceil(delay / 1000)}s …`;
});
ws.on('open', () => { if (banner) banner.hidden = true; });

window.__brettWs = ws;

const modeState = createModeState();
let combatCtl = null;
const overlayRoot = document.getElementById('overlay-root');

modeState.on('change', async mode => {
  if (mode === 'ffa') {
    await startFFA();
  } else if (mode === 'coaching') {
    stopCombat();
  }
});

async function startFFA() {
  await showLoadoutModal(modeState);
  const loadout = modeState.loadout();

  const { startCombat } = await import('./combat/controller.mjs');
  combatCtl = startCombat({
    scene: window.scene,
    camera: window.camera,
    players: window.figures || [],
    self: window.localPlayer || { id: 'local', hp: 100 },
    ws,
    hudRoot: overlayRoot,
    loadout,
  });

  const isTouch = matchMedia('(pointer: coarse)').matches;
  if (isTouch) {
    const { mountJoystick } = await import('./touch/joystick.mjs');
    const { mountTouchHud } = await import('./touch/touch-hud.mjs');
    mountJoystick({
      side: 'left',
      onMove: ({ x, y }) => window.localPlayer?.setMoveInput?.(x, y),
    });
    mountJoystick({
      side: 'right',
      onMove: ({ x, y }) => window.localPlayer?.setAimDelta?.(x, y),
    });
    mountTouchHud({
      onFireStart: () => combatCtl?.startFire?.(),
      onFireEnd: () => combatCtl?.stopFire?.(),
      onReload: () => combatCtl?.reload?.(),
    });
  }
}

function stopCombat() {
  if (!overlayRoot) return;
  const hud = overlayRoot.querySelector('#combat-hud');
  if (hud) hud.hidden = true;
}

// Show mode selector on load
showModeSelect(modeState);
