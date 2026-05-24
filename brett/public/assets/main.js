// brett/public/assets/main.js
import { connect } from './ws.mjs';
import { createModeState } from './mode-state.mjs';
import { showModeSelect } from './mode-select.mjs';

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

const cfg = await fetch('/api/config')
  .then(r => r.json())
  .catch(() => ({ defaultMode: 'coaching', availableModes: ['coaching'] }));

// Remove Mayhem toolbar button when Mayhem is not available on this cluster
if (!cfg.availableModes.includes('mayhem')) {
  document.getElementById('mayhem-btn')?.remove();
}

const chosen = await showModeSelect(modeState, cfg);
if (chosen === 'mayhem') {
  // Mayhem boot is idempotent — main.js owns enabling it post-select
  window.Mayhem?.setEnabled(true);
}
