# Dashboard UX Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add language toggle (EN/DE), tab visibility/ordering via a gear panel, resizable log panel, and copy-to-clipboard to the vanilla JS dashboard at `dashboard/web/`.

**Architecture:** Pure client-side changes — three files only (`index.html`, `app.js`, `style.css`). `state.tabs` drives nav rendering dynamically; a `TRANSLATIONS` dict + `t()` helper replaces all hardcoded UI strings; the log panel gains a drag handle div with pointer capture for resize.

**Tech Stack:** Vanilla JS (ES2020), CSS, Express static serving. Node built-in test runner for server-side tests (unchanged). No frontend test framework exists — UI verified manually.

---

## File Map

| File | What changes |
|---|---|
| `dashboard/web/public/index.html` | Remove hardcoded nav buttons; add `<nav id="tabs"></nav>`, `EN`/`DE` buttons, `⚙` button |
| `dashboard/web/public/app.js` | Full rewrite: `TRANSLATIONS`, `t()`, extended state, `renderNav()`, `renderSettings()`, translated render functions, resizable log, copy button |
| `dashboard/web/public/style.css` | Add `.lang-toggle`, `.settings-panel`, `.tab-row`, `.log-container`, `.log-handle` rules; update `pre.logs` |

Server files (`server.js`, `lib/`) are **not touched**.

---

## Task 1: Create feature branch

**Files:**
- (git only)

- [ ] **Step 1: Create and switch to feature branch**

```bash
git checkout main && git pull && git checkout -b feature/dashboard-ux-enhancements
```

Expected: `Switched to a new branch 'feature/dashboard-ux-enhancements'`

---

## Task 2: CSS additions

**Files:**
- Modify: `dashboard/web/public/style.css`

- [ ] **Step 1: Append new rules to style.css**

Open `dashboard/web/public/style.css` and append the following after the last existing line:

```css
/* ── Language toggle ────────────────────────────────────────────────────── */
.lang-toggle { display: flex; gap: .25rem; margin-left: .5rem; }
.lang-toggle .btn { padding: .25rem .5rem; }
.lang-toggle .btn.active { background: #3a4252; border-color: #4a5262; }

/* ── Settings panel ─────────────────────────────────────────────────────── */
.settings-panel {
  position: fixed; top: 2.75rem; right: 1rem; z-index: 100;
  background: #161b22; border: 1px solid #3a4252; border-radius: 6px;
  padding: .75rem 1rem; min-width: 220px; box-shadow: 0 4px 12px rgba(0,0,0,.5);
}
.settings-panel h3 {
  margin: 0 0 .5rem; font-size: .85rem; opacity: .7;
  text-transform: uppercase; letter-spacing: .05em;
}
.tab-row { display: flex; align-items: center; gap: .4rem; margin: .25rem 0; }
.tab-row label { flex: 1; cursor: pointer; }
.tab-row button { padding: .1rem .4rem; font-size: .8rem; }

/* ── Log resize ─────────────────────────────────────────────────────────── */
.log-container { display: flex; flex-direction: column; }
.log-handle {
  height: 6px; background: #2a313c; cursor: ns-resize;
  border-radius: 3px 3px 0 0; margin-top: .5rem;
}
.log-handle:hover { background: #3a4252; }
pre.logs { height: 40vh; max-height: none; }
```

- [ ] **Step 2: Run server tests to confirm no regression**

```bash
cd dashboard/web && node --test test/*.test.js
```

Expected: all tests pass (CSS changes cannot break server tests).

- [ ] **Step 3: Commit**

```bash
git add dashboard/web/public/style.css
git commit -m "style(dashboard): add lang-toggle, settings-panel, log-handle CSS"
```

---

## Task 3: Update index.html

**Files:**
- Modify: `dashboard/web/public/index.html`

- [ ] **Step 1: Replace the full content of index.html**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Workspace dashboard</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header class="topbar">
    <h1>Workspace</h1>
    <nav id="tabs"></nav>
    <label class="ctx" id="cluster-label">
      cluster:
      <select id="context">
        <option value="mentolder" selected>mentolder</option>
        <option value="korczewski">korczewski</option>
      </select>
    </label>
    <div class="lang-toggle">
      <button id="lang-en" class="btn active">EN</button>
      <button id="lang-de" class="btn">DE</button>
    </div>
    <button id="settings-btn" class="btn" title="Settings">⚙</button>
  </header>
  <main id="main"></main>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Run server tests**

```bash
cd dashboard/web && node --test test/*.test.js
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add dashboard/web/public/index.html
git commit -m "feat(dashboard): remove static nav buttons, add lang + settings controls to topbar"
```

---

## Task 4: Rewrite app.js

**Files:**
- Modify: `dashboard/web/public/app.js`

This is the main task. Replace the entire file content.

- [ ] **Step 1: Replace the full content of app.js**

```js
'use strict';

// ── Translations ────────────────────────────────────────────────────────────
const TRANSLATIONS = {
  en: {
    tab_tickets: 'Tickets',      tab_pods: 'Pods & services',
    tab_logs: 'Logs',            tab_argocd: 'ArgoCD',
    btn_refresh: 'refresh',      btn_fetch: 'fetch',
    btn_copy: 'Copy',            btn_copied: 'Copied ✓',
    btn_filter: 'filter',        btn_comment: 'comment',
    btn_resolve: 'resolve',      btn_reopen: 'reopen',
    btn_archive: 'archive',      btn_back: '← back',
    label_cluster: 'cluster:',
    col_name: 'name',      col_phase: 'phase',
    col_restarts: 'restarts', col_node: 'node',
    col_app: 'app',        col_sync: 'sync',
    col_health: 'health',  col_cluster: 'cluster',
    col_id: 'id',          col_status: 'status',
    col_category: 'category', col_created: 'created',
    col_desc: 'description',
    ph_pod: 'pod name (exact)', ph_search: 'search…',
    ph_comment: 'leave a comment…',
    status_all: 'all',
    loading: 'loading…', no_logs: '(no logs yet)', fetching: 'fetching…',
    settings_title: 'Settings', settings_tabs: 'Tabs',
    ticket_not_found: 'ticket not found',
    resolution_note: 'Resolution note:',
    reopen_reason: 'Reopen reason:',
    archive_confirm: 'Archive this ticket?',
  },
  de: {
    tab_tickets: 'Tickets',      tab_pods: 'Pods & Dienste',
    tab_logs: 'Logs',            tab_argocd: 'ArgoCD',
    btn_refresh: 'Aktualisieren', btn_fetch: 'Abrufen',
    btn_copy: 'Kopieren',        btn_copied: 'Kopiert ✓',
    btn_filter: 'Filtern',       btn_comment: 'Kommentar',
    btn_resolve: 'Schließen',    btn_reopen: 'Wieder öffnen',
    btn_archive: 'Archivieren',  btn_back: '← Zurück',
    label_cluster: 'Cluster:',
    col_name: 'Name',        col_phase: 'Phase',
    col_restarts: 'Neustarts', col_node: 'Node',
    col_app: 'App',          col_sync: 'Sync',
    col_health: 'Gesundheit', col_cluster: 'Cluster',
    col_id: 'ID',            col_status: 'Status',
    col_category: 'Kategorie', col_created: 'Erstellt',
    col_desc: 'Beschreibung',
    ph_pod: 'Pod-Name (exakt)', ph_search: 'Suchen…',
    ph_comment: 'Kommentar schreiben…',
    status_all: 'alle',
    loading: 'Wird geladen…', no_logs: '(noch keine Logs)', fetching: 'Wird abgerufen…',
    settings_title: 'Einstellungen', settings_tabs: 'Tabs',
    ticket_not_found: 'Ticket nicht gefunden',
    resolution_note: 'Lösungshinweis:',
    reopen_reason: 'Grund für Wiedereröffnung:',
    archive_confirm: 'Dieses Ticket archivieren?',
  },
};

// ── DOM helper (no innerHTML, XSS-safe by construction) ────────────────────
function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'on') {
      for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
    } else if (k === 'class') {
      e.className = v;
    } else if (k === 'data') {
      for (const [dk, dv] of Object.entries(v)) e.dataset[dk] = dv;
    } else if (k === 'text') {
      e.textContent = v;
    } else if (k === 'value') {
      e.value = v;
    } else if (v !== null) {
      e.setAttribute(k, v);
    }
  }
  const list = Array.isArray(children) ? children : [children];
  for (const c of list) {
    if (c == null || c === false) continue;
    e.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
}
function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
function setMain(node) { const m = document.getElementById('main'); clear(m); m.appendChild(node); }

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  tab: 'tickets',
  context: 'mentolder',
  ticketId: null,
  filter: { status: '', category: '', q: '' },
  pollTimer: null,
  lang: 'en',
  settingsOpen: false,
  tabs: [
    { id: 'tickets', labelKey: 'tab_tickets', visible: true },
    { id: 'pods',    labelKey: 'tab_pods',    visible: true },
    { id: 'logs',    labelKey: 'tab_logs',    visible: true },
    { id: 'argocd',  labelKey: 'tab_argocd',  visible: true },
  ],
};

function t(key) { return TRANSLATIONS[state.lang][key] ?? key; }

// ── API ────────────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 200)}`);
  const ct = r.headers.get('content-type') || '';
  return ct.includes('json') ? r.json() : r.text();
}

// ── Nav ────────────────────────────────────────────────────────────────────
function renderNav() {
  const nav = $('#tabs');
  clear(nav);
  const visible = state.tabs.filter(tb => tb.visible);
  if (!visible.find(tb => tb.id === state.tab)) {
    state.tab = visible[0]?.id ?? 'tickets';
  }
  visible.forEach(tb => {
    nav.appendChild(el('button', {
      class: state.tab === tb.id ? 'active' : '',
      on: { click: () => { state.tab = tb.id; state.ticketId = null; renderNav(); render(); } },
    }, t(tb.labelKey)));
  });
  // Sync cluster label text
  const lbl = $('#cluster-label');
  if (lbl) lbl.firstChild.textContent = t('label_cluster') + ' ';
}

// ── Settings ───────────────────────────────────────────────────────────────
function outsideSettingsClose(e) {
  const panel = $('#settings-panel');
  const btn = $('#settings-btn');
  if (panel && !panel.contains(e.target) && e.target !== btn) closeSettings();
}

function closeSettings() {
  state.settingsOpen = false;
  const panel = $('#settings-panel');
  if (panel) panel.remove();
  document.removeEventListener('pointerdown', outsideSettingsClose);
}

function renderSettings() {
  const existing = $('#settings-panel');
  if (existing) existing.remove();
  if (!state.settingsOpen) return;

  const panel = el('div', { id: 'settings-panel', class: 'settings-panel' });
  panel.appendChild(el('h3', {}, t('settings_title')));
  panel.appendChild(el('div', { style: 'font-size:.8rem;opacity:.6;margin-bottom:.4rem;' }, t('settings_tabs')));

  state.tabs.forEach((tb, i) => {
    const cb = el('input', { type: 'checkbox', id: `tab-cb-${tb.id}` });
    cb.checked = tb.visible;
    cb.addEventListener('change', () => { tb.visible = cb.checked; renderNav(); render(); });

    const upBtn = el('button', { class: 'btn' }, '↑');
    const downBtn = el('button', { class: 'btn' }, '↓');
    if (i === 0) upBtn.disabled = true;
    if (i === state.tabs.length - 1) downBtn.disabled = true;

    upBtn.addEventListener('click', () => {
      if (i === 0) return;
      [state.tabs[i - 1], state.tabs[i]] = [state.tabs[i], state.tabs[i - 1]];
      renderNav(); renderSettings();
    });
    downBtn.addEventListener('click', () => {
      if (i === state.tabs.length - 1) return;
      [state.tabs[i], state.tabs[i + 1]] = [state.tabs[i + 1], state.tabs[i]];
      renderNav(); renderSettings();
    });

    panel.appendChild(el('div', { class: 'tab-row' }, [
      cb,
      el('label', { for: `tab-cb-${tb.id}` }, t(tb.labelKey)),
      upBtn, downBtn,
    ]));
  });

  document.body.appendChild(panel);
  setTimeout(() => document.addEventListener('pointerdown', outsideSettingsClose), 0);
}

// ── Tickets list ───────────────────────────────────────────────────────────
async function renderTickets() {
  if (state.ticketId) return renderTicketDetail();

  const qs = new URLSearchParams();
  if (state.filter.status)   qs.set('status',   state.filter.status);
  if (state.filter.category) qs.set('category', state.filter.category);
  if (state.filter.q)        qs.set('q',        state.filter.q);
  let rows = [];
  try { rows = await api(`/api/tickets?${qs}`); } catch (_) {}

  const statusSelect = el('select', {},
    ['', 'open', 'resolved', 'archived'].map(v =>
      el('option', { value: v, ...(v === state.filter.status ? { selected: '' } : {}) },
        v || t('status_all')))
  );
  const qInput = el('input', { type: 'text', placeholder: t('ph_search'), value: state.filter.q });
  const applyBtn = el('button', {
    class: 'btn',
    on: { click: () => { state.filter.status = statusSelect.value; state.filter.q = qInput.value; render(); } },
  }, t('btn_filter'));

  const tbody = el('tbody');
  for (const row of rows) {
    tbody.appendChild(el('tr', {
      data: { id: row.ticket_id },
      on: { click: () => { state.ticketId = row.ticket_id; render(); } },
    }, [
      el('td', {}, row.ticket_id),
      el('td', {}, row.status),
      el('td', {}, row.category),
      el('td', {}, new Date(row.created_at).toLocaleString('de-DE')),
      el('td', {}, (row.description || '').slice(0, 120)),
    ]));
  }

  setMain(el('div', {}, [
    el('div', { class: 'row' }, [statusSelect, qInput, applyBtn]),
    el('table', {}, [
      el('thead', {}, el('tr', {}, [t('col_id'), t('col_status'), t('col_category'), t('col_created'), t('col_desc')].map(h => el('th', {}, h)))),
      tbody,
    ]),
  ]));
}

async function renderTicketDetail() {
  let out = null;
  try { out = await api(`/api/tickets/${encodeURIComponent(state.ticketId)}`); } catch (_) {}

  if (!out) {
    setMain(el('div', {}, [
      el('button', { class: 'btn', on: { click: () => { state.ticketId = null; render(); } } }, t('btn_back')),
      el('p', { class: 'danger' }, t('ticket_not_found')),
    ]));
    return;
  }
  const tick = out.ticket;

  const thread = el('div', { class: 'thread' });
  for (const c of out.comments) {
    thread.appendChild(el('div', { class: `comment ${c.kind}` }, [
      el('div', { class: 'meta' }, `${c.author} — ${new Date(c.created_at).toLocaleString('de-DE')} — ${c.kind}`),
      el('div', {}, c.body),
    ]));
  }

  const composer = el('textarea', { placeholder: t('ph_comment') });
  const sendBtn = el('button', {
    class: 'btn',
    on: { click: async () => {
      const body = composer.value.trim();
      if (!body) return;
      await api(`/api/tickets/${encodeURIComponent(state.ticketId)}/comments`, {
        method: 'POST', body: JSON.stringify({ body }),
      });
      render();
    } },
  }, t('btn_comment'));

  const buttons = [sendBtn];
  if (tick.status === 'open') {
    buttons.push(el('button', {
      class: 'btn',
      on: { click: async () => {
        const note = prompt(t('resolution_note')) || '';
        await api(`/api/tickets/${encodeURIComponent(state.ticketId)}/resolve`, { method: 'POST', body: JSON.stringify({ note }) });
        render();
      } },
    }, t('btn_resolve')));
  } else {
    buttons.push(el('button', {
      class: 'btn',
      on: { click: async () => {
        const reason = prompt(t('reopen_reason')) || '';
        await api(`/api/tickets/${encodeURIComponent(state.ticketId)}/reopen`, { method: 'POST', body: JSON.stringify({ reason }) });
        render();
      } },
    }, t('btn_reopen')));
  }
  if (tick.status !== 'archived') {
    buttons.push(el('button', {
      class: 'btn',
      on: { click: async () => {
        if (!confirm(t('archive_confirm'))) return;
        await api(`/api/tickets/${encodeURIComponent(state.ticketId)}/archive`, { method: 'POST' });
        render();
      } },
    }, t('btn_archive')));
  }

  const header = el('div', {}, [
    el('h2', {}, `${tick.ticket_id} (${tick.status})`),
    el('p', {}, `${tick.category} — ${tick.reporter_email} — ${new Date(tick.created_at).toLocaleString('de-DE')}`),
  ]);
  if (tick.url) header.appendChild(el('p', {}, el('a', { href: tick.url, target: '_blank', rel: 'noopener' }, tick.url)));
  header.appendChild(el('p', {}, tick.description || ''));

  setMain(el('div', {}, [
    el('button', { class: 'btn', on: { click: () => { state.ticketId = null; render(); } } }, t('btn_back')),
    header, thread, composer,
    el('div', { class: 'row' }, buttons),
  ]));
}

// ── Pods / services ────────────────────────────────────────────────────────
async function renderPods() {
  const out = el('div', {}, [el('p', {}, t('loading'))]);
  setMain(el('div', {}, [el('button', { class: 'btn', on: { click: renderPods } }, t('btn_refresh')), out]));
  try {
    const data = await api(`/api/k8s/pods?context=${state.context}`);
    const items = JSON.parse(data).items || [];
    clear(out);
    const tbody = el('tbody');
    for (const p of items) {
      tbody.appendChild(el('tr', {}, [
        el('td', {}, p.metadata?.name || ''),
        el('td', {}, p.status?.phase || ''),
        el('td', {}, String((p.status?.containerStatuses || []).reduce((n, c) => n + c.restartCount, 0))),
        el('td', {}, p.spec?.nodeName || ''),
      ]));
    }
    out.appendChild(el('table', {}, [
      el('thead', {}, el('tr', {}, [t('col_name'), t('col_phase'), t('col_restarts'), t('col_node')].map(h => el('th', {}, h)))),
      tbody,
    ]));
  } catch (e) { clear(out); out.appendChild(el('p', { class: 'danger' }, e.message)); }
}

// ── Logs ───────────────────────────────────────────────────────────────────
async function renderLogs() {
  const podInput = el('input', { type: 'text', placeholder: t('ph_pod'), style: 'min-width:24rem;' });
  const pre = el('pre', { class: 'logs' }, t('no_logs'));

  const fetchBtn = el('button', {
    class: 'btn',
    on: { click: async () => {
      const pod = podInput.value.trim();
      if (!pod) return;
      pre.textContent = t('fetching');
      try {
        pre.textContent = await api(`/api/k8s/logs?context=${state.context}&pod=${encodeURIComponent(pod)}`);
      } catch (e) { pre.textContent = e.message; }
    } },
  }, t('btn_fetch'));

  const copyBtn = el('button', { class: 'btn' }, t('btn_copy'));
  copyBtn.addEventListener('click', () => {
    const txt = pre.textContent;
    if (txt === t('no_logs') || txt === t('fetching')) return;
    navigator.clipboard.writeText(txt).then(() => {
      copyBtn.textContent = t('btn_copied');
      setTimeout(() => { copyBtn.textContent = t('btn_copy'); }, 1500);
    });
  });

  const handle = el('div', { class: 'log-handle' });
  let startY = 0, startH = 0;
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    startY = e.clientY;
    startH = pre.getBoundingClientRect().height;
  });
  handle.addEventListener('pointermove', (e) => {
    if (!handle.hasPointerCapture(e.pointerId)) return;
    pre.style.height = Math.max(120, startH - (e.clientY - startY)) + 'px';
  });
  handle.addEventListener('pointerup', (e) => { handle.releasePointerCapture(e.pointerId); });

  setMain(el('div', {}, [
    el('div', { class: 'row' }, [podInput, fetchBtn, copyBtn]),
    el('div', { class: 'log-container' }, [handle, pre]),
  ]));
}

// ── ArgoCD ─────────────────────────────────────────────────────────────────
async function renderArgoCD() {
  const out = el('div', {}, [el('p', {}, t('loading'))]);
  setMain(el('div', {}, [el('button', { class: 'btn', on: { click: renderArgoCD } }, t('btn_refresh')), out]));
  try {
    const data = await api('/api/k8s/argocd-apps');
    const items = JSON.parse(data).items || [];
    clear(out);
    const tbody = el('tbody');
    for (const a of items) {
      tbody.appendChild(el('tr', {}, [
        el('td', {}, a.metadata?.name || ''),
        el('td', {}, a.status?.sync?.status || ''),
        el('td', {}, a.status?.health?.status || ''),
        el('td', {}, a.spec?.destination?.name || a.spec?.destination?.server || ''),
      ]));
    }
    out.appendChild(el('table', {}, [
      el('thead', {}, el('tr', {}, [t('col_app'), t('col_sync'), t('col_health'), t('col_cluster')].map(h => el('th', {}, h)))),
      tbody,
    ]));
  } catch (e) { clear(out); out.appendChild(el('p', { class: 'danger' }, e.message)); }
}

// ── Polling ───────────────────────────────────────────────────────────────
function setPolling() {
  if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
  if (state.tab === 'tickets' && state.ticketId && document.visibilityState === 'visible') {
    state.pollTimer = setInterval(render, 15000);
  }
}

// ── Render dispatch ───────────────────────────────────────────────────────
async function render() {
  if (state.tab === 'tickets')    await renderTickets();
  else if (state.tab === 'pods')  await renderPods();
  else if (state.tab === 'logs')  await renderLogs();
  else if (state.tab === 'argocd') await renderArgoCD();
  setPolling();
}

// ── Init ──────────────────────────────────────────────────────────────────
$('#context').addEventListener('change', e => { state.context = e.target.value; render(); });
document.addEventListener('visibilitychange', setPolling);

$('#lang-en').addEventListener('click', () => {
  state.lang = 'en';
  $('#lang-en').classList.add('active');
  $('#lang-de').classList.remove('active');
  renderNav();
  if (state.settingsOpen) renderSettings();
  render();
});
$('#lang-de').addEventListener('click', () => {
  state.lang = 'de';
  $('#lang-de').classList.add('active');
  $('#lang-en').classList.remove('active');
  renderNav();
  if (state.settingsOpen) renderSettings();
  render();
});

$('#settings-btn').addEventListener('click', () => {
  state.settingsOpen = !state.settingsOpen;
  renderSettings();
});

renderNav();
render();
```

- [ ] **Step 2: Run server tests**

```bash
cd dashboard/web && node --test test/*.test.js
```

Expected: all tests pass (app.js is browser-only, server tests are unaffected).

- [ ] **Step 3: Commit**

```bash
git add dashboard/web/public/app.js
git commit -m "feat(dashboard): translations, dynamic nav, settings panel, resizable log, copy button"
```

---

## Task 5: Manual browser verification

The dashboard server must be running. Start it:

```bash
cd dashboard/web && PORT=3000 PORTAL_ADMIN_USERNAME=admin node server.js
```

Then open `http://localhost:3000` in a browser (the auth guard checks the `X-Auth-Request-User` header — in dev this defaults to pass through if no reverse proxy is in front, or set the env var to match your username).

- [ ] **Verify language toggle**
  - Click `DE` — nav tabs, column headers, buttons all switch to German
  - Click `EN` — everything reverts to English

- [ ] **Verify settings panel**
  - Click `⚙` — panel appears with four tab rows, each with checkbox and ↑/↓
  - Uncheck `Logs` — Logs tab disappears from nav
  - Re-check `Logs` — Logs tab reappears
  - Click `↓` on Tickets row — Tickets moves below Pods & services
  - Click outside the panel — it closes
  - Click `⚙` again — panel reopens with current state

- [ ] **Verify log resize**
  - Navigate to Logs tab
  - Enter any pod name and click Fetch (or just use the handle on the placeholder text)
  - Hover over the thin bar above the log area — cursor becomes `ns-resize`
  - Drag upward — log panel grows taller; drag down — it shrinks to min 120px

- [ ] **Verify copy button**
  - On the Logs tab with no content, Copy button exists but does nothing (placeholder text guard)
  - After fetching logs, click Copy — button briefly shows `Copied ✓`, content is in clipboard

- [ ] **Verify polling still works**
  - Open a ticket detail view — background polling every 15s continues (no regression)

---

## Task 6: Push branch and open PR

- [ ] **Step 1: Push feature branch**

```bash
git push -u origin feature/dashboard-ux-enhancements
```

- [ ] **Step 2: Open PR**

```bash
gh pr create \
  --title "feat(dashboard): language toggle, tab config, resizable logs, copy button" \
  --body "$(cat <<'EOF'
## Summary
- EN/DE language toggle in topbar; all UI strings translated via \`TRANSLATIONS\` dict + \`t()\` helper
- Gear panel (⚙) to show/hide and reorder tabs; changes take effect immediately, no persistence
- Resizable log panel via drag handle at top edge (\`pointerdown/move/up\` with pointer capture)
- Copy-to-clipboard button next to Fetch in Logs tab

## Test plan
- [ ] Click DE / EN, verify all labels switch
- [ ] Open ⚙, hide a tab, move another, click outside to close
- [ ] Drag log handle up/down, verify resize and 120px minimum
- [ ] Fetch logs then click Copy, verify clipboard content and button feedback
- [ ] \`node --test test/*.test.js\` passes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes

- **Spec coverage:** All four features covered: language ✓, tab config ✓, log resize ✓, copy ✓
- **No persistence:** Correctly excluded (reset on reload) ✓
- **Type consistency:** `t(key)` used uniformly; `state.tabs[i].labelKey` referenced consistently
- **Disabled attribute:** The `el()` helper needed a `v !== null` guard for `disabled` — added in Task 4 Step 1 (`else if (v !== null) { e.setAttribute(k, v); }`)
- **`t()` defined after `state`:** `state` is const-initialized before `t()` is ever called; safe ✓
