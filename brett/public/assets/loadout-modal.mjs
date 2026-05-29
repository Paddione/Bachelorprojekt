// brett/public/assets/loadout-modal.mjs
const MELEE = ['club', 'katana'];
const RANGED = ['handgun'];
const SKIN_STORAGE_KEY = 'brett.skinId';

export function readSkinId() {
  try { return window.localStorage.getItem(SKIN_STORAGE_KEY) || 'default'; }
  catch { return 'default'; }
}
export function writeSkinId(id) {
  try { window.localStorage.setItem(SKIN_STORAGE_KEY, id); }
  catch { /* private mode etc. */ }
}

export async function fetchSkins() {
  try {
    const r = await fetch('/api/skins', { credentials: 'same-origin' });
    if (!r.ok) return [{ id: 'default', name: 'Mannequin', thumb: null }];
    return await r.json();
  } catch {
    return [{ id: 'default', name: 'Mannequin', thumb: null }];
  }
}

export function renderSkinPicker(skins, currentId, onPick) {
  const overlay = document.createElement('div');
  overlay.className = 'mode-select-overlay skin-picker-overlay';
  overlay.innerHTML = `
    <div class="mode-select-card skin-picker-card">
      <h2>Charakter-Skin wählen</h2>
      <div class="skin-grid">
        ${skins.map(s => `
          <button class="skin-tile ${s.id === currentId ? 'active' : ''}" data-skin-id="${s.id}">
            <div class="skin-thumb">${s.thumb ? `<img src="${s.thumb}" alt="${s.name}">` : '<span>👤</span>'}</div>
            <span class="skin-name">${s.name}</span>
          </button>
        `).join('')}
      </div>
      <button class="confirm skin-cancel">Schließen</button>
    </div>
  `;
  overlay.addEventListener('click', e => {
    const tile = e.target.closest('.skin-tile');
    if (tile) {
      const id = tile.dataset.skinId;
      window.MayhemAudio?.onUiConfirm?.();
      onPick(id, skins.find(s => s.id === id));
      overlay.remove();
      return;
    }
    if (e.target.classList.contains('skin-cancel')) {
      window.MayhemAudio?.onMenuClose?.();
      overlay.remove();
    }
  });
  document.body.appendChild(overlay);
  window.MayhemAudio?.onMenuOpen?.();
}

// Standalone entry: open just the skin picker overlay, persist the choice in
// localStorage, and live-swap the local avatar's skin if Mayhem is running.
export async function openSkinPickerStandalone() {
  const skins = await fetchSkins();
  const currentId = readSkinId();
  window.MayhemAudio?.onMenuOpen?.();
  return new Promise(resolve => {
    renderSkinPicker(skins, currentId, (id) => {
      writeSkinId(id);
      // Live swap if a local avatar exists
      const swap = window.MayhemSwapLocalSkin;
      if (typeof swap === 'function') {
        try { swap(id); } catch (err) { console.warn('[brett] live skin swap failed:', err); }
      }
      resolve(id);
    });
  });
}

export function showLoadoutModal(modeState) {
  document.body.setAttribute('data-overlay', '');
  const current = modeState.loadout();
  let currentSkinId = readSkinId();
  let currentSkinName = 'Mannequin';

  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'mode-select-overlay';

    function renderSkinRow() {
      return `
        <div class="loadout-skin-row">
          <span class="loadout-skin-label">Charakter-Skin</span>
          <button class="loadout-skin-current" data-action="open-skin-picker">
            <span class="skin-thumb-small">👤</span>
            <span class="skin-name-small">${currentSkinName}</span>
            <span class="skin-change">Ändern</span>
          </button>
        </div>
      `;
    }

    el.innerHTML = `
      <div class="mode-select-card">
        <h2>Wähle deine Startausrüstung</h2>
        <div class="loadout-cols">
          <div>
            <h3>Nahkampf</h3>
            ${MELEE.map(w => `<button class="weapon-pick ${current.melee===w?'active':''}" data-slot="melee" data-w="${w}">
              <img src="assets/hud/icon-${w}.png" alt="${w}">
              <span>${w}</span>
            </button>`).join('')}
          </div>
          <div>
            <h3>Fernkampf</h3>
            ${RANGED.map(w => `<button class="weapon-pick ${current.ranged===w?'active':''}" data-slot="ranged" data-w="${w}">
              <img src="assets/hud/icon-${w}.png" alt="${w}">
              <span>${w}</span>
            </button>`).join('')}
          </div>
        </div>
        ${renderSkinRow()}
        <button class="confirm">Spielen</button>
      </div>
    `;
    document.body.appendChild(el);

    // Fire the catalog fetch in the background so the row updates when it lands.
    fetchSkins().then(skins => {
      const match = skins.find(s => s.id === currentSkinId);
      currentSkinName = match ? match.name : 'Mannequin';
      const row = el.querySelector('.loadout-skin-row');
      if (row) row.outerHTML = renderSkinRow();
      // Re-bind the action delegated below.
    });

    const sel = { ...current };
    el.addEventListener('click', async e => {
      const w = e.target.closest('.weapon-pick');
      if (w) {
        sel[w.dataset.slot] = w.dataset.w;
        el.querySelectorAll(`[data-slot="${w.dataset.slot}"]`).forEach(b => b.classList.toggle('active', b === w));
        window.MayhemAudio?.onUiClick?.();
        return;
      }
      const skinBtn = e.target.closest('[data-action="open-skin-picker"]');
      if (skinBtn) {
        window.MayhemAudio?.onUiClick?.();
        const skins = await fetchSkins();
        renderSkinPicker(skins, currentSkinId, (id, def) => {
          currentSkinId = id;
          currentSkinName = def ? def.name : 'Mannequin';
          writeSkinId(id);
          const row = el.querySelector('.loadout-skin-row');
          if (row) row.outerHTML = renderSkinRow();
        });
        return;
      }
      if (e.target.classList.contains('confirm')) {
        window.MayhemAudio?.onMatchStart?.();
        modeState.setLoadout(sel);
        document.body.removeAttribute('data-overlay');
        el.remove();
        if (window.Mayhem && typeof window.Mayhem.requestPointerLock === 'function') {
          window.Mayhem.requestPointerLock();
        }
        resolve({ ...sel, skinId: currentSkinId });
      }
    });
  });
}
