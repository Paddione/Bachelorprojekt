// brett/public/assets/main.js — ESM entry, Phase 1.
// scene.js still runs as classic <script> (IIFE) and owns the canvas; this
// module layers on cross-cutting concerns (WS reconnect-banner) that will
// expand in later phases.
import { connect } from './ws.mjs';

const ws = connect();

const banner = document.getElementById('reconnect-banner');
ws.on('reconnect-pending', ({ delay }) => {
  if (!banner) return;
  banner.hidden = false;
  banner.textContent = `Verbindung verloren · reconnect in ${Math.ceil(delay / 1000)}s …`;
});
ws.on('open', () => { if (banner) banner.hidden = true; });

window.__brettWs = ws;

// Debug toggle: ?combat=1 activates FFA combat without mode-select
if (new URLSearchParams(location.search).get('combat') === '1') {
  const overlayRoot = document.getElementById('overlay-root');
  import('./combat/controller.mjs').then(C => {
    C.startCombat({
      scene: window.scene,
      camera: window.camera,
      players: window.figures || [],
      self: window.localPlayer || { id: 'local', hp: 100 },
      ws,
      hudRoot: overlayRoot,
    });
  });
}
