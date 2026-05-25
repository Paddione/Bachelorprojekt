'use strict';
/* global window, document, fetch, sessionStorage, crypto */

window.RoomBrowser = (() => {
  const CSS = `
    #rb-overlay{position:fixed;inset:0;background:rgba(10,13,18,0.7);backdrop-filter:blur(4px);
      display:flex;align-items:center;justify-content:center;z-index:9000;font-family:ui-sans-serif,system-ui,sans-serif;}
    #rb-panel{background:#111827;border:1px solid #374151;border-radius:10px;width:440px;max-height:80vh;
      overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.6);}
    #rb-header{padding:16px 20px 12px;border-bottom:1px solid #374151;display:flex;justify-content:space-between;align-items:center;}
    #rb-title{color:#f59e0b;font-weight:700;font-size:14px;letter-spacing:0.5px;}
    #rb-user{color:#6b7280;font-size:11px;margin-top:2px;}
    #rb-new-btn{background:#1f2937;color:#9ca3af;border:1px solid #374151;border-radius:5px;
      padding:4px 10px;font-size:11px;cursor:pointer;}
    #rb-new-btn:hover{background:#374151;color:#e5e7eb;}
    #rb-list{padding:10px 12px;overflow-y:auto;max-height:calc(80vh - 80px);}
    .rb-room{background:#0d1117;border:1px solid #374151;border-radius:7px;padding:10px 12px;
      margin-bottom:8px;display:flex;align-items:center;gap:10px;}
    .rb-room-info{flex:1;}
    .rb-room-name{color:#e5e7eb;font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;margin-bottom:3px;}
    .rb-badge-mayhem{background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.3);
      border-radius:4px;padding:1px 6px;font-size:9px;font-weight:700;}
    .rb-badge-mode{background:rgba(124,58,237,0.15);color:#a78bfa;border:1px solid rgba(124,58,237,0.3);
      border-radius:4px;padding:1px 6px;font-size:9px;}
    .rb-room-meta{color:#6b7280;font-size:10px;}
    .rb-players{color:#10b981;font-size:11px;margin-right:4px;}
    .rb-join-btn{background:#7c3aed;color:#fff;border:none;border-radius:5px;padding:5px 12px;
      font-size:11px;font-weight:600;cursor:pointer;}
    .rb-join-btn:hover{background:#6d28d9;}
    #rb-join-dialog{position:fixed;inset:0;background:rgba(10,13,18,0.8);display:flex;
      align-items:center;justify-content:center;z-index:9100;}
    #rb-join-panel{background:#111827;border:1px solid #374151;border-radius:10px;width:320px;overflow:hidden;}
    #rb-join-header{padding:14px 18px;border-bottom:1px solid #1f2937;}
    #rb-join-title{color:#e5e7eb;font-weight:700;font-size:13px;}
    #rb-join-meta{color:#6b7280;font-size:11px;margin-top:2px;}
    #rb-join-body{padding:14px 18px;display:flex;flex-direction:column;gap:10px;}
    .rb-mode-opt{background:#111827;border:1px solid #374151;border-radius:7px;padding:12px 14px;cursor:pointer;}
    .rb-mode-opt.selected{border-color:#f59e0b;background:#1f2937;}
    .rb-mode-opt:hover{background:#1f2937;}
    .rb-mode-title{display:flex;align-items:center;gap:8px;margin-bottom:3px;color:#e5e7eb;font-size:12px;font-weight:600;}
    .rb-mode-desc{color:#6b7280;font-size:10px;padding-left:24px;}
    .rb-default-badge{background:rgba(245,158,11,0.15);color:#f59e0b;border-radius:4px;padding:1px 6px;font-size:9px;margin-left:auto;}
    #rb-confirm-btn{background:#7c3aed;color:#fff;border:none;border-radius:6px;padding:8px;
      font-size:12px;font-weight:600;cursor:pointer;width:100%;}
    #rb-confirm-btn:hover{background:#6d28d9;}
  `;

  let _overlay = null;
  let _refreshTimer = null;
  let _selectedMode = 'spectator';
  let _pendingRoom = null;

  function injectStyles() {
    if (document.getElementById('rb-styles')) return;
    const s = document.createElement('style');
    s.id = 'rb-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function playerDots(count, max) {
    return Array.from({ length: max }, (_, i) => i < count ? '●' : '○').join('');
  }

  function modeLabel(mode) {
    return { warmup: 'Warmup', deathmatch: 'Deathmatch', lms: 'LMS' }[mode] || mode;
  }

  function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function escAttr(s) { return String(s).replace(/"/g,'&quot;'); }

  function renderRooms(rooms) {
    const list = document.getElementById('rb-list');
    if (!list) return;
    list.innerHTML = '';
    // Solo AI rooms are private — never show them in the browser
    const visible = rooms.filter(r => !r.token?.startsWith('solo-'));
    if (visible.length === 0) {
      list.innerHTML = '<p style="color:#6b7280;font-size:12px;text-align:center;padding:20px">Keine aktiven Räume</p>';
      return;
    }
    for (const r of visible) {
      const div = document.createElement('div');
      div.className = 'rb-room';
      div.innerHTML = `
        <div class="rb-room-info">
          <div class="rb-room-name">
            ${escHtml(r.name)}
            ${r.mayhem ? '<span class="rb-badge-mayhem">⚔ MAYHEM</span>' : ''}
            ${r.mayhem ? `<span class="rb-badge-mode">${modeLabel(r.gameMode)}</span>` : ''}
          </div>
          <div class="rb-room-meta">
            <span class="rb-players">${playerDots(r.playerCount, r.maxPlayers)}</span>
            ${r.playerCount} Spieler
          </div>
        </div>
        <button class="rb-join-btn" data-token="${escAttr(r.token)}" data-name="${escAttr(r.name)}"
          data-mayhem="${r.mayhem}" data-mode="${escAttr(r.gameMode)}" data-players="${r.playerCount}" data-max="${r.maxPlayers}">
          Beitreten →
        </button>
      `;
      div.querySelector('.rb-join-btn').addEventListener('click', onJoinClick);
      list.appendChild(div);
    }
  }

  function onJoinClick(e) {
    const btn = e.currentTarget;
    _pendingRoom = {
      token: btn.dataset.token,
      name: btn.dataset.name,
      mayhem: btn.dataset.mayhem === 'true',
      gameMode: btn.dataset.mode,
      playerCount: parseInt(btn.dataset.players, 10),
      maxPlayers: parseInt(btn.dataset.max, 10),
    };
    showJoinDialog(_pendingRoom);
  }

  function showJoinDialog(room) {
    const existing = document.getElementById('rb-join-dialog');
    if (existing) existing.remove();
    const freeSlots = room.maxPlayers - room.playerCount;
    const d = document.createElement('div');
    d.id = 'rb-join-dialog';
    d.innerHTML = `
      <div id="rb-join-panel">
        <div id="rb-join-header">
          <div id="rb-join-title">${escHtml(room.name)}</div>
          <div id="rb-join-meta">${room.playerCount} Spieler${room.mayhem ? ' · ⚔ Mayhem · ' + modeLabel(room.gameMode) : ''}</div>
        </div>
        <div id="rb-join-body">
          <div class="rb-mode-opt selected" data-mode="spectator">
            <div class="rb-mode-title">👁 Zuschauen <span class="rb-default-badge">Standard</span></div>
            <div class="rb-mode-desc">Freie Kamera, kein Avatar. Spieler sehen dich nicht.</div>
          </div>
          <div class="rb-mode-opt" data-mode="player" ${freeSlots <= 0 ? 'style="opacity:0.4;pointer-events:none"' : ''}>
            <div class="rb-mode-title">⚔ Mitspielen ${freeSlots > 0 ? `<span style="color:#6b7280;font-size:9px;margin-left:auto">${freeSlots} freie Slots</span>` : '<span style="color:#ef4444;font-size:9px;margin-left:auto">Voll</span>'}</div>
            <div class="rb-mode-desc">Spawn als Spieler. Admin-Panel bleibt verfügbar.</div>
          </div>
          <button id="rb-confirm-btn">Beitreten →</button>
        </div>
      </div>
    `;
    _selectedMode = 'spectator';
    d.querySelectorAll('.rb-mode-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        d.querySelectorAll('.rb-mode-opt').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        _selectedMode = opt.dataset.mode;
      });
    });
    d.querySelector('#rb-confirm-btn').addEventListener('click', () => {
      sessionStorage.setItem('brett_admin_join_mode', _selectedMode);
      window.location.href = `/?room=${encodeURIComponent(_pendingRoom.token)}`;
    });
    document.body.appendChild(d);
  }

  async function loadRooms() {
    try {
      const res = await fetch('/api/admin/rooms');
      if (!res.ok) return;
      renderRooms(await res.json());
    } catch {}
  }

  function show(userName) {
    injectStyles();
    if (_overlay) return;
    _overlay = document.createElement('div');
    _overlay.id = 'rb-overlay';
    _overlay.innerHTML = `
      <div id="rb-panel">
        <div id="rb-header">
          <div>
            <div id="rb-title">⚔ MAYHEM ADMIN</div>
            <div id="rb-user">Eingeloggt als ${escHtml(userName)}</div>
          </div>
          <button id="rb-new-btn">+ Neuer Raum</button>
        </div>
        <div id="rb-list"><p style="color:#6b7280;font-size:12px;text-align:center;padding:20px">Lade Räume…</p></div>
      </div>
    `;
    _overlay.querySelector('#rb-new-btn').addEventListener('click', () => {
      const uuid = (typeof crypto.randomUUID === 'function') ? crypto.randomUUID() : ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
      const token = uuid.replace(/-/g, '').slice(0, 12);
      sessionStorage.setItem('brett_admin_join_mode', 'spectator');
      window.location.href = `/?room=${token}`;
    });
    document.body.appendChild(_overlay);
    loadRooms();
    _refreshTimer = setInterval(loadRooms, 10_000);
  }

  function hide() {
    clearInterval(_refreshTimer);
    _overlay?.remove();
    _overlay = null;
  }

  return { show, hide };
})();
