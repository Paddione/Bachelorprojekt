'use strict';
/* global window, document, fetch, sessionStorage */

window.AdminPanel = (() => {
  const CSS = `
    #ap-tab{position:fixed;top:50%;right:0;transform:translateY(-50%);background:rgba(10,13,18,0.92);
      border:1px solid #374151;border-right:none;border-radius:6px 0 0 6px;padding:10px 6px;
      cursor:pointer;writing-mode:vertical-rl;text-orientation:mixed;color:#f59e0b;
      font-size:10px;font-weight:700;letter-spacing:1px;user-select:none;z-index:8000;
      transition:background 0.15s;}
    #ap-tab:hover{background:rgba(31,41,55,0.95);}
    #ap-panel{position:fixed;top:0;right:0;bottom:0;width:190px;background:rgba(10,13,18,0.97);
      border-left:1px solid #374151;padding:10px 12px;display:flex;flex-direction:column;gap:8px;
      overflow-y:auto;z-index:8000;font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px;
      transform:translateX(100%);transition:transform 0.2s ease;}
    #ap-panel.open{transform:translateX(0);}
    .ap-sep{border:none;border-top:1px solid #1f2937;margin:2px 0;}
    .ap-label{color:#9ca3af;font-size:9px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;}
    .ap-room-name{color:#f59e0b;font-size:10px;font-weight:700;}
    .ap-room-meta{color:#6b7280;font-size:9px;margin-top:2px;}
    .ap-toggle{display:flex;gap:4px;}
    .ap-toggle button{flex:1;border:none;border-radius:4px;padding:4px 0;font-size:10px;font-weight:600;cursor:pointer;}
    .ap-btn-on{background:#059669;color:#fff;}
    .ap-btn-on.inactive{background:#1f2937;color:#6b7280;border:1px solid #374151;}
    .ap-btn-off{background:#1f2937;color:#6b7280;border:1px solid #374151;}
    .ap-btn-off.active{background:#dc2626;color:#fff;border:none;}
    .ap-modes{display:flex;flex-direction:column;gap:3px;}
    .ap-modes button{background:#1f2937;color:#6b7280;border:1px solid #374151;border-radius:4px;
      padding:3px 6px;font-size:10px;text-align:left;cursor:pointer;}
    .ap-modes button.active{background:rgba(124,58,237,0.2);color:#a78bfa;border-color:rgba(124,58,237,0.5);}
    .ap-modes button:hover:not(.active){background:#374151;color:#e5e7eb;}
    .ap-bots{display:flex;gap:4px;align-items:center;}
    .ap-bots button{background:#1f2937;color:#e5e7eb;border:1px solid #374151;border-radius:4px;
      padding:2px 8px;font-size:12px;cursor:pointer;}
    .ap-bots button:hover{background:#374151;}
    .ap-bots span{color:#e5e7eb;font-size:10px;flex:1;text-align:center;}
    .ap-player-row{display:flex;justify-content:space-between;align-items:center;padding:2px 0;}
    .ap-player-name{color:#e5e7eb;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:110px;}
    .ap-kick{background:transparent;color:#ef4444;border:none;font-size:9px;cursor:pointer;padding:0;flex-shrink:0;}
    .ap-kick:hover{color:#fca5a5;}
    .ap-action{background:#1f2937;color:#e5e7eb;border:1px solid #374151;border-radius:4px;
      padding:4px;font-size:10px;cursor:pointer;text-align:left;width:100%;}
    .ap-action:hover{background:#374151;}
    .ap-action.blue{color:#60a5fa;}
    #ap-switch-mode{background:#374151;color:#9ca3af;border:none;border-radius:4px;
      padding:2px 6px;font-size:9px;cursor:pointer;align-self:flex-start;}
    #ap-switch-mode:hover{background:#4b5563;color:#e5e7eb;}
    .ap-skins-overlay {
      position: fixed; inset: 0; background: rgba(10,13,18,0.95); z-index: 9000;
      display: flex; flex-direction: column; padding: 32px; overflow-y: auto;
      font-family: ui-sans-serif, system-ui, sans-serif; color: #e5e7eb;
    }
    .ap-skins-overlay h2 { color: #f59e0b; margin: 0 0 16px 0; }
    .ap-skins-close {
      align-self: flex-end; background: #1f2937; color: #e5e7eb;
      border: 1px solid #374151; border-radius: 4px; padding: 6px 12px;
      font-size: 11px; cursor: pointer; margin-bottom: 16px;
    }
    .ap-skins-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
    .ap-skin-card {
      background: #1f2937; border: 1px solid #374151; border-radius: 6px; padding: 12px;
      display: flex; flex-direction: column; gap: 6px;
    }
    .ap-skin-card img { width: 100%; height: 120px; object-fit: cover; border-radius: 4px; background: #0e1014; }
    .ap-skin-anim { color: #9ca3af; font-size: 10px; }
    .ap-skin-delete { background: #dc2626; color: white; border: none; border-radius: 4px; padding: 6px; cursor: pointer; font-size: 11px; }
    .ap-skin-delete:disabled { background: #4b5563; cursor: not-allowed; }
    .ap-skin-upload {
      margin-top: 24px; padding: 16px; background: #1f2937; border-radius: 6px;
      display: flex; flex-direction: column; gap: 8px; max-width: 480px;
    }
    .ap-skin-upload input, .ap-skin-upload button {
      padding: 6px 10px; background: #0e1014; color: #e5e7eb; border: 1px solid #374151; border-radius: 4px;
    }
    .ap-skin-upload button { cursor: pointer; }
    .ap-skin-status { color: #10b981; font-size: 11px; }
    .ap-skin-status.err { color: #f87171; }
  `;

  let _open = false;
  let _send = null;
  let _room = null;
  let _state = {
    roomName: '',
    playerCount: 0,
    players: [],
    mayhem: false,
    gameMode: 'warmup',
    botCount: 0,
    joinMode: 'spectator',
  };

  function injectStyles() {
    if (document.getElementById('ap-styles')) return;
    const s = document.createElement('style');
    s.id = 'ap-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function send(msg) { _send?.(msg); }

  function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function escAttr(s) { return String(s).replace(/"/g,'&quot;'); }

  function renderPanel() {
    const panel = document.getElementById('ap-panel');
    if (!panel) return;
    const { roomName, playerCount, players, mayhem, gameMode, botCount, joinMode } = _state;
    const dots = Array.from({ length: 4 }, (_, i) => i < playerCount ? '●' : '○').join('');
    panel.innerHTML = `
      <div>
        <div class="ap-room-name">⚔ ADMIN · ${escHtml(roomName || _room)}</div>
        <div class="ap-room-meta">${dots} ${playerCount}/4 Spieler</div>
        ${joinMode === 'spectator' ? '<button id="ap-switch-mode">Als Spieler beitreten</button>' : ''}
      </div>
      <hr class="ap-sep">
      <div>
        <div class="ap-label">Mayhem</div>
        <div class="ap-toggle">
          <button class="ap-btn-on ${mayhem ? '' : 'inactive'}" data-action="mayhem-on">AN</button>
          <button class="ap-btn-off ${mayhem ? '' : 'active'}" data-action="mayhem-off">AUS</button>
        </div>
      </div>
      <div>
        <div class="ap-label">Modus</div>
        <div class="ap-modes">
          <button class="${gameMode === 'warmup' ? 'active' : ''}" data-action="mode-warmup">Warmup</button>
          <button class="${gameMode === 'deathmatch' ? 'active' : ''}" data-action="mode-deathmatch">Deathmatch</button>
          <button class="${gameMode === 'lms' ? 'active' : ''}" data-action="mode-lms">LMS</button>
        </div>
      </div>
      <div>
        <div class="ap-label">Bots</div>
        <div class="ap-bots">
          <button data-action="bot-minus" ${botCount <= 0 ? 'disabled style="opacity:0.4"' : ''}>−</button>
          <span>${botCount} Bot${botCount !== 1 ? 's' : ''}</span>
          <button data-action="bot-plus" ${playerCount >= 4 ? 'disabled style="opacity:0.4"' : ''}>+</button>
        </div>
      </div>
      <div>
        <div class="ap-label">Spieler</div>
        ${players.map(p => `
          <div class="ap-player-row">
            <span class="ap-player-name">${p.isBot ? '🤖 ' : ''}${escHtml(p.name)}</span>
            <button class="ap-kick" data-action="kick" data-player-id="${escAttr(p.id)}">${p.isBot ? 'Entf.' : 'Kick'}</button>
          </div>`).join('')}
        ${players.length === 0 ? '<span style="color:#374151;font-size:9px">Keine Spieler</span>' : ''}
      </div>
      <hr class="ap-sep" style="margin-top:auto">
      <button class="ap-action" data-action="reset">↩ Runde neu starten</button>
      <button class="ap-action blue" data-action="broadcast">🔗 Link senden</button>
      <button class="ap-action" data-action="skins">👤 Charakter-Skins</button>
    `;
    panel.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', onAction);
    });
    panel.querySelector('#ap-switch-mode')?.addEventListener('click', () => {
      _state.joinMode = 'player';
      sessionStorage.setItem('brett_admin_join_mode', 'player');
      send({ type: 'player_join', playerId: window._mayhemPlayerId || ('admin-' + Date.now()) });
      renderPanel();
    });
  }

  function onAction(e) {
    const action = e.currentTarget.dataset.action;
    switch (action) {
      case 'mayhem-on':  send({ type: 'admin_mayhem_toggle', enabled: true });  _state.mayhem = true;  break;
      case 'mayhem-off': send({ type: 'admin_mayhem_toggle', enabled: false }); _state.mayhem = false; break;
      case 'mode-warmup':     send({ type: 'admin_mode_set', mode: 'warmup' });     _state.gameMode = 'warmup';     break;
      case 'mode-deathmatch': send({ type: 'admin_mode_set', mode: 'deathmatch' }); _state.gameMode = 'deathmatch'; break;
      case 'mode-lms':        send({ type: 'admin_mode_set', mode: 'lms' });        _state.gameMode = 'lms';        break;
      case 'bot-plus':  send({ type: 'admin_bot_spawn' }); _state.botCount++; _state.playerCount++; break;
      case 'bot-minus': {
        const bot = _state.players.find(p => p.isBot);
        if (bot) { send({ type: 'admin_bot_despawn', botId: bot.id }); _state.botCount--; _state.playerCount--; }
        break;
      }
      case 'kick': {
        const pid = e.currentTarget.dataset.playerId;
        send({ type: 'admin_kick', playerId: pid });
        _state.players = _state.players.filter(p => p.id !== pid);
        _state.playerCount = Math.max(0, _state.playerCount - 1);
        break;
      }
      case 'reset':     send({ type: 'admin_round_reset' }); break;
      case 'broadcast': send({ type: 'admin_broadcast' }); break;
      case 'skins':     openSkinsOverlay(); break;
    }
    renderPanel();
  }

  function mount(opts) {
    _send   = opts.sendFn;
    _room   = opts.room;
    _state.roomName = opts.roomName || opts.room;
    _state.joinMode = opts.joinMode || sessionStorage.getItem('brett_admin_join_mode') || 'spectator';
    injectStyles();
    const tab = document.createElement('div');
    tab.id = 'ap-tab';
    tab.textContent = '⚔ ADMIN';
    tab.addEventListener('click', toggle);
    document.body.appendChild(tab);
    const panel = document.createElement('div');
    panel.id = 'ap-panel';
    document.body.appendChild(panel);
    renderPanel();
  }

  function toggle() {
    _open = !_open;
    document.getElementById('ap-panel')?.classList.toggle('open', _open);
  }

  function onMessage(msg) {
    if (msg.type === 'player_join' && msg.playerId) {
      if (!_state.players.find(p => p.id === msg.playerId)) {
        const isBot = String(msg.playerId).startsWith('bot-');
        _state.players.push({ id: msg.playerId, name: msg.name || msg.playerId, isBot });
        if (isBot) _state.botCount++;
        _state.playerCount++;
        renderPanel();
      }
    } else if (msg.type === 'player_leave' && msg.playerId) {
      const p = _state.players.find(pl => pl.id === msg.playerId);
      if (p) {
        if (p.isBot) _state.botCount--;
        _state.players = _state.players.filter(pl => pl.id !== msg.playerId);
        _state.playerCount = Math.max(0, _state.playerCount - 1);
        renderPanel();
      }
    } else if (msg.type === 'mayhem_mode') {
      _state.mayhem = !!msg.enabled;
      renderPanel();
    } else if (msg.type === 'game_mode_change') {
      _state.gameMode = msg.mode;
      renderPanel();
    } else if (msg.type === 'info') {
      _state.playerCount = msg.count || 0;
      renderPanel();
    }
  }

  async function openSkinsOverlay() {
    let overlay = document.getElementById('ap-skins-overlay');
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = 'ap-skins-overlay';
    overlay.className = 'ap-skins-overlay';
    overlay.innerHTML = `
      <button class="ap-skins-close" data-action="skins-close">Schließen</button>
      <h2>Charakter-Skins</h2>
      <div class="ap-skins-list" id="ap-skins-list">Lade…</div>
      <form class="ap-skin-upload" id="ap-skin-upload-form">
        <h3 style="margin:0;color:#f59e0b;">Neuen Skin hochladen</h3>
        <input type="text" name="name" placeholder="Anzeigename (z.B. Patrick)" maxlength="100" required>
        <label>GLB (max 20 MB):
          <input type="file" name="glb" accept=".glb,model/gltf-binary" required>
        </label>
        <label>Thumbnail (optional, PNG, max 512 KB):
          <input type="file" name="thumb" accept="image/png">
        </label>
        <button type="submit">Hochladen</button>
        <div class="ap-skin-status" id="ap-skin-status"></div>
      </form>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('[data-action="skins-close"]').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#ap-skin-upload-form').addEventListener('submit', onUploadSubmit);
    await refreshSkinList(overlay);
  }

  async function refreshSkinList(overlay) {
    const list = overlay.querySelector('#ap-skins-list');
    list.textContent = 'Lade…';
    const r = await fetch('/api/skins', { credentials: 'same-origin' });
    const skins = r.ok ? await r.json() : [];
    if (!skins.length) { list.textContent = 'Keine Skins.'; return; }
    list.innerHTML = skins.map(s => `
      <div class="ap-skin-card">
        ${s.thumb ? `<img src="${escAttr(s.thumb)}" alt="${escHtml(s.name)}">` : '<div style="height:120px;background:#0e1014;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:36px;">👤</div>'}
        <strong>${escHtml(s.name)}</strong>
        <span class="ap-skin-anim">Animationen: ${(s.animations && s.animations.length) ? s.animations.join(', ') : '—'}</span>
        <button class="ap-skin-delete" data-skin-id="${escAttr(s.id)}" ${s.id === 'default' ? 'disabled' : ''}>Löschen</button>
      </div>
    `).join('');
    list.querySelectorAll('.ap-skin-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        if (!confirm(`Skin "${btn.dataset.skinId}" wirklich löschen?`)) return;
        const r = await fetch(`/api/skins/${encodeURIComponent(btn.dataset.skinId)}`, {
          method: 'DELETE', credentials: 'same-origin',
        });
        if (r.ok) refreshSkinList(overlay);
        else alert('Löschen fehlgeschlagen: ' + r.status);
      });
    });
  }

  async function onUploadSubmit(evt) {
    evt.preventDefault();
    const form   = evt.currentTarget;
    const status = form.querySelector('#ap-skin-status');
    status.classList.remove('err'); status.textContent = 'Lade hoch…';
    const fd = new FormData(form);
    try {
      const r = await fetch('/api/skins/upload', {
        method: 'POST', body: fd, credentials: 'same-origin',
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        status.classList.add('err');
        status.textContent = 'Fehler: ' + (out.error || r.status);
        return;
      }
      status.textContent = `✓ "${out.name}" hochgeladen (${(out.animations || []).length} Animationen)`;
      form.reset();
      await refreshSkinList(document.getElementById('ap-skins-overlay'));
    } catch (err) {
      status.classList.add('err');
      status.textContent = 'Netzwerkfehler: ' + err.message;
    }
  }

  return { mount, onMessage, toggle };
})();
