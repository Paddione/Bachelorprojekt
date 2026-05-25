// brett/public/assets/main.js
import { connect } from './ws.mjs';
import { createModeState } from './mode-state.mjs';
import { showModeSelect } from './mode-select.mjs';

const ws = connect({ url: `${location.origin.replace(/^http/, 'ws')}/sync` });

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

const chosen = await showModeSelect(modeState, cfg);
if (chosen === 'mayhem') {
  // Add Mayhem toolbar buttons dynamically (not in static HTML to avoid coaching-mode bleed)
  const presets = document.getElementById('presets');
  if (presets && !document.getElementById('mayhem-btn')) {
    const mayhemBtn = document.createElement('button');
    mayhemBtn.id = 'mayhem-btn';
    mayhemBtn.type = 'button';
    mayhemBtn.style.cssText = 'margin-left:8px;border:1px solid rgba(231,234,208,0.18);border-radius:4px;padding:4px 10px;background:transparent;color:inherit;font:inherit;cursor:pointer;';
    mayhemBtn.textContent = '🤸 Mayhem';
    mayhemBtn.addEventListener('click', () => window.Mayhem?.toggle());
    presets.appendChild(mayhemBtn);

    const ctrlBtn = document.createElement('button');
    ctrlBtn.id = 'brett-controls-btn';
    ctrlBtn.type = 'button';
    ctrlBtn.style.marginLeft = '4px';
    ctrlBtn.title = 'Steuerung anpassen';
    ctrlBtn.textContent = '⚙';
    ctrlBtn.addEventListener('click', () => window.MayhemControlsPanel?.openControlsPanel());
    presets.appendChild(ctrlBtn);

    // Reflect Mayhem on/off state visually on the toggle button
    const setMayhemBtnActive = (on) => {
      mayhemBtn.style.borderColor = on ? '#c8f76a' : 'rgba(231,234,208,0.18)';
      mayhemBtn.style.color = on ? '#c8f76a' : 'inherit';
      mayhemBtn.title = on ? 'Mayhem beenden (M)' : 'Mayhem starten (M)';
    };
    window.addEventListener('brett:mayhem-enabled',  () => setMayhemBtnActive(true));
    window.addEventListener('brett:mayhem-disabled', () => setMayhemBtnActive(false));
  }

  // Init Mayhem via deferred bridge (WS is open by the time mode select resolves)
  window.__brettInitMayhem?.();
  window.Mayhem?.setEnabled(true);
}
