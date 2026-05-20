// brett/public/assets/mayhem/controls-panel.js
(function (root) {
  const TABS = [
    {
      id: 'move', label: 'Bewegung',
      actions: [
        { action: 'forward',  label: 'Vorwärts' },
        { action: 'backward', label: 'Rückwärts' },
        { action: 'left',     label: 'Links' },
        { action: 'right',    label: 'Rechts' },
        { action: 'sprint',   label: 'Sprint' },
        { action: 'jump',     label: 'Springen' },
      ],
    },
    {
      id: 'combat', label: 'Kampf',
      actions: [
        { action: null,         label: 'Schießen', fixed: 'LMB' },
        { action: 'flail',      label: 'Flegel' },
        { action: 'prevWeapon', label: 'Vorige Waffe' },
        { action: 'nextWeapon', label: 'Nächste Waffe' },
        { action: 'reload',     label: 'Respawn' },
      ],
    },
    {
      id: 'utility', label: 'Sonstiges',
      actions: [
        { action: 'vehicle',      label: 'Fahrzeug spawnen' },
        { action: 'cycleMode',    label: 'Modus wechseln' },
        { action: 'toggleMayhem', label: 'Mayhem ein/aus' },
      ],
    },
  ];

  function codeLabel(code) {
    const map = {
      'Space': 'Leertaste', 'ShiftLeft': 'Shift L', 'ShiftRight': 'Shift R',
      'ArrowUp': '↑', 'ArrowDown': '↓', 'ArrowLeft': '←', 'ArrowRight': '→',
    };
    if (map[code]) return map[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    return code;
  }

  // ── Entry toast ──────────────────────────────────────────────────────────────
  function showEntryToast() {
    const kb = root.MayhemKeybindings ? root.MayhemKeybindings.load() : {};
    const existing = document.getElementById('brett-mayhem-toast');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.id = 'brett-mayhem-toast';
    el.style.cssText = [
      'position:fixed', 'top:12px', 'left:50%', 'transform:translateX(-50%)',
      'background:rgba(0,0,0,.82)', 'border:1px solid #3d2a6e', 'border-radius:6px',
      'padding:6px 14px', 'font:13px/1.4 monospace', 'color:#a89abb',
      'z-index:9999', 'cursor:pointer', 'user-select:none',
      'animation:brett-toast-in .25s ease',
    ].join(';');
    el.innerHTML =
      `<kbd style="color:#c8f76a">${codeLabel(kb.forward||'KeyW')}${codeLabel(kb.backward||'KeyS')}${codeLabel(kb.left||'KeyA')}${codeLabel(kb.right||'KeyD')}</kbd> bewegen · ` +
      `<kbd style="color:#c8f76a">${codeLabel(kb.jump||'Space')}</kbd> springen · ` +
      `<kbd style="color:#c8f76a">LMB</kbd> schießen · ` +
      `<kbd style="color:#c8f76a">⚙</kbd> Controls`;
    document.body.appendChild(el);

    const timer = setTimeout(() => el.remove(), 4000);
    el.addEventListener('click', () => { clearTimeout(timer); el.remove(); });

    // Inject CSS once
    if (!document.getElementById('brett-toast-css')) {
      const s = document.createElement('style');
      s.id = 'brett-toast-css';
      s.textContent = '@keyframes brett-toast-in{from{opacity:0;transform:translateX(-50%) translateY(-8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
      document.head.appendChild(s);
    }
  }

  // ── Discovery banner (once per session) ─────────────────────────────────────
  function showDiscoveryBanner() {
    if (sessionStorage.getItem('brett:mayhem-hint-shown')) return;
    sessionStorage.setItem('brett:mayhem-hint-shown', '1');

    const el = document.createElement('div');
    el.id = 'brett-mayhem-discovery';
    el.style.cssText = [
      'position:fixed', 'bottom:16px', 'left:50%', 'transform:translateX(-50%)',
      'background:rgba(14,8,28,.92)', 'border:1px solid #5a3a9e', 'border-radius:8px',
      'padding:10px 20px', 'font:13px/1.5 monospace', 'color:#c0b8d0',
      'z-index:9998', 'cursor:pointer', 'text-align:center',
    ].join(';');
    el.innerHTML =
      '🤸 <strong style="color:#c8f76a">Mayhem-Modus verfügbar</strong><br>' +
      'Drücke <kbd style="background:#2a1e4e;padding:1px 5px;border-radius:3px;color:#c8f76a">M</kbd> ' +
      'oder klicke auf den 🤸 Button, um zu kämpfen.<br>' +
      '<small style="color:#4a3870">Klicken zum Schließen</small>';
    document.body.appendChild(el);
    el.addEventListener('click', () => el.remove());
    setTimeout(() => el && el.parentNode && el.remove(), 8000);
  }

  // ── ⚙ Controls modal ────────────────────────────────────────────────────────
  let _rebinding = null; // { action, chipEl }

  function openControlsPanel() {
    if (document.getElementById('brett-controls-modal')) return;

    const bindings = root.MayhemKeybindings ? root.MayhemKeybindings.load() : {};

    const overlay = document.createElement('div');
    overlay.id = 'brett-controls-modal';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'background:rgba(0,0,0,.78)',
      'display:flex', 'align-items:center', 'justify-content:center',
      'z-index:10000', 'font-family:monospace',
    ].join(';');

    overlay.innerHTML = `
      <div style="background:#120d1c;border:1px solid #3d2a6e;border-radius:10px;
                  min-width:340px;max-width:420px;width:90%;padding:20px 24px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <span style="color:#c8f76a;letter-spacing:.12em;font-size:13px">STEUERUNG</span>
          <button id="brett-ctrl-close" style="background:none;border:none;color:#6a5a8a;font-size:18px;cursor:pointer;line-height:1">✕</button>
        </div>
        <div id="brett-ctrl-tabs" style="display:flex;gap:6px;margin-bottom:14px">
          ${TABS.map((t, i) => `
            <button data-tab="${t.id}"
              style="background:${i===0?'#2a1e4e':'#1a1030'};border:1px solid ${i===0?'#c8f76a':'#2e1f55'};
                     color:${i===0?'#c8f76a':'#6a5a8a'};border-radius:4px;
                     padding:4px 12px;font:11px monospace;cursor:pointer;letter-spacing:.08em"
            >${t.label}</button>
          `).join('')}
        </div>
        <div id="brett-ctrl-content" style="min-height:160px"></div>
        <div style="margin-top:14px;display:flex;justify-content:space-between;align-items:center">
          <button id="brett-ctrl-reset"
            style="background:none;border:none;color:#4a3870;font:11px monospace;cursor:pointer">
            Zurücksetzen
          </button>
          <span id="brett-ctrl-hint" style="font-size:10px;color:#3a2a5e">
            Klicke eine Taste zum Ändern
          </span>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    let activeTab = TABS[0].id;
    renderTabContent(activeTab, bindings);

    // Tab switching
    overlay.querySelector('#brett-ctrl-tabs').addEventListener('click', e => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      activeTab = btn.dataset.tab;
      overlay.querySelectorAll('[data-tab]').forEach(b => {
        const active = b.dataset.tab === activeTab;
        b.style.background = active ? '#2a1e4e' : '#1a1030';
        b.style.borderColor = active ? '#c8f76a' : '#2e1f55';
        b.style.color = active ? '#c8f76a' : '#6a5a8a';
      });
      renderTabContent(activeTab, bindings);
    });

    // Reset
    overlay.querySelector('#brett-ctrl-reset').addEventListener('click', () => {
      if (!root.MayhemKeybindings) return;
      const def = { ...root.MayhemKeybindings.DEFAULT_BINDINGS };
      root.MayhemKeybindings.save(def);
      Object.assign(bindings, def);
      renderTabContent(activeTab, bindings);
      root.dispatchEvent(new CustomEvent('brett:keybindings-changed'));
    });

    // Close
    overlay.querySelector('#brett-ctrl-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    // Keydown listener for rebinding
    const onKeyDown = e => {
      if (!_rebinding) return;
      e.preventDefault();
      if (e.code === 'Escape') {
        cancelRebind();
        return;
      }
      const { action } = _rebinding;
      // Conflict check
      const existing = root.MayhemKeybindings ? root.MayhemKeybindings.getAction(e.code, bindings) : null;
      if (existing && existing !== action) {
        // Swap
        bindings[existing] = bindings[action];
        if (root.MayhemKeybindings) root.MayhemKeybindings.save(bindings);
      }
      bindings[action] = e.code;
      if (root.MayhemKeybindings) root.MayhemKeybindings.save(bindings);
      root.dispatchEvent(new CustomEvent('brett:keybindings-changed'));
      _rebinding = null;
      renderTabContent(activeTab, bindings);
      overlay.querySelector('#brett-ctrl-hint').textContent = 'Klicke eine Taste zum Ändern';
    };
    window.addEventListener('keydown', onKeyDown);

    // Use MutationObserver to clean up keydown listener when modal removed
    const observer = new MutationObserver(() => {
      if (!document.getElementById('brett-controls-modal')) {
        window.removeEventListener('keydown', onKeyDown);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true });
  }

  function renderTabContent(tabId, bindings) {
    const tab = TABS.find(t => t.id === tabId);
    const content = document.getElementById('brett-ctrl-content');
    if (!content || !tab) return;
    content.innerHTML = tab.actions.map(row => {
      if (row.fixed) {
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #1e1640">
          <span style="color:#c0b8d0;font-size:12px">${row.label}</span>
          <span style="background:#1e1640;border:1px solid #2e1f55;border-radius:3px;
                       color:#6a5a8a;padding:2px 10px;font-size:11px">${row.fixed}</span>
        </div>`;
      }
      const code = bindings[row.action] || '—';
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #1e1640">
        <span style="color:#c0b8d0;font-size:12px">${row.label}</span>
        <button data-rebind="${row.action}"
          style="background:#1e1640;border:1px solid #3d2a6e;border-radius:3px;
                 color:#c8f76a;padding:2px 10px;font:11px monospace;cursor:pointer;min-width:52px">
          ${codeLabel(code)}
        </button>
      </div>`;
    }).join('');

    content.addEventListener('click', e => {
      const btn = e.target.closest('[data-rebind]');
      if (!btn) return;
      cancelRebind();
      _rebinding = { action: btn.dataset.rebind, chipEl: btn };
      btn.style.background = '#4a0a0a';
      btn.style.borderColor = '#ff4444';
      btn.style.color = '#fff';
      btn.textContent = 'Taste drücken…';
      document.getElementById('brett-ctrl-hint').textContent = 'ESC zum Abbrechen';
    });
  }

  function cancelRebind() {
    if (!_rebinding) return;
    _rebinding = null;
    const activeTab = document.querySelector('[data-tab]')?.dataset.tab || TABS[0].id;
    renderTabContent(activeTab, root.MayhemKeybindings ? root.MayhemKeybindings.load() : {});
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  root.MayhemControlsPanel = { showEntryToast, showDiscoveryBanner, openControlsPanel };
})(typeof globalThis !== 'undefined' ? globalThis : this);
