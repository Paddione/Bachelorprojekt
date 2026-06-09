/* brainstorm-collab v1 — appended by scripts/superpowers-collab-patch.sh (idempotent marker) */
(function () {
  if (window.__brainstormCollab) return;            // guard against double-injection
  window.__brainstormCollab = true;

  const WS = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
  let who = localStorage.getItem('brainstorm_who');
  if (!who) {
    const urlWho = new URLSearchParams(location.search).get('who');
    if (urlWho) {
      who = urlWho.slice(0, 24);
    } else {
      who = (prompt('Dein Name für diese Session:') || 'Gast').slice(0, 24);
    }
    localStorage.setItem('brainstorm_who', who);
  }

  // ---- panel ----
  // Build panel via DOM to avoid any innerHTML-injection risk from `who` or message text.
  const panel = document.createElement('div');
  panel.id = 'bs-collab';
  panel.style.cssText = 'position:fixed;right:12px;bottom:12px;width:260px;max-height:50vh;display:flex;flex-direction:column;background:#0f1623;color:#e8e8e8;border:1px solid #2a3550;border-radius:10px;font:13px system-ui;z-index:99998;box-shadow:0 6px 24px rgba(0,0,0,.5)';

  const header = document.createElement('div');
  header.style.cssText = 'padding:6px 10px;border-bottom:1px solid #2a3550;font-weight:600';
  header.textContent = '\u{1F465} ';
  const presenceEl = document.createElement('span');
  presenceEl.id = 'bs-presence';
  presenceEl.textContent = who;
  header.appendChild(presenceEl);

  const log = document.createElement('div');
  log.id = 'bs-log';
  log.style.cssText = 'flex:1;overflow:auto;padding:8px 10px;display:flex;flex-direction:column;gap:4px';

  const form = document.createElement('form');
  form.id = 'bs-form';
  form.style.cssText = 'display:flex;border-top:1px solid #2a3550';
  const input = document.createElement('input');
  input.id = 'bs-in'; input.autocomplete = 'off'; input.placeholder = 'Mitschreiben…';
  input.style.cssText = 'flex:1;background:transparent;border:0;color:inherit;padding:8px 10px;outline:none';
  const btn = document.createElement('button');
  btn.style.cssText = 'background:#e8c870;color:#0f1623;border:0;padding:0 12px;cursor:pointer;font-weight:600';
  btn.textContent = '↵';
  form.appendChild(input); form.appendChild(btn);

  panel.appendChild(header); panel.appendChild(log); panel.appendChild(form);
  document.body.appendChild(panel);
  const seen = new Map();                            // who -> last-seen ts

  function addLine(w, text, kind) {
    // Use textContent throughout — no innerHTML, no manual escaping needed.
    const row = document.createElement('div');
    const label = document.createElement('strong');
    label.style.color = kind === 'note' ? '#8fd3ff' : '#e8c870';
    label.textContent = w + ':';
    const msg = document.createTextNode(' ' + text);
    row.appendChild(label); row.appendChild(msg);
    log.appendChild(row); log.scrollTop = log.scrollHeight;
  }
  function renderPresence() {
    const now = Date.now();
    const live = [...seen.entries()].filter(([, t]) => now - t < 20000).map(([w]) => w);
    presenceEl.textContent = live.length ? live.join(', ') : who;
  }

  let cws;
  function connect() {
    cws = new WebSocket(WS);
    cws.onopen = () => { send({ type: 'presence', who }); };
    cws.onmessage = (m) => {
      let d; try { d = JSON.parse(m.data); } catch { return; }
      if (d.type === 'presence' && d.who) { seen.set(d.who, Date.now()); renderPresence(); }
      else if (d.type === 'chat' && d.who) { addLine(d.who, d.text, 'chat'); }
      else if (d.type === 'note' && d.who) { addLine(d.who, d.text, 'note'); }
    };
    cws.onclose = () => setTimeout(connect, 1000);
  }
  function send(o) { o.who = who; o.ts = Date.now(); try { cws && cws.readyState === 1 && cws.send(JSON.stringify(o)); } catch (e) {} }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = input.value.trim(); if (!t) return;
    // `note` is the durable, agent-read kind; also echo locally immediately.
    send({ type: 'note', text: t }); addLine(who, t, 'note'); input.value = '';
  });

  setInterval(() => { send({ type: 'presence', who }); renderPresence(); }, 8000);
  connect();
})();
