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
    tab_art:        'Art Library',
    art_kind_all:   'all',
    art_kind_character: 'characters',
    art_kind_prop:  'props',
    art_kind_terrain: 'terrain',
    art_kind_logo:  'logos',
    art_search_ph:  'search assets…',
    art_palette:    'Palette',
    art_download:   'Download',
    art_no_assets:  'No art library configured for this environment.',
    art_copied:     'Copied ✓',
    art_tags:       'Tags',
    art_id:         'ID',
    art_kind:       'Kind',
    art_no_palette: '(no palette)',
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
    tab_art:        'Bibliothek',
    art_kind_all:   'alle',
    art_kind_character: 'Figuren',
    art_kind_prop:  'Requisiten',
    art_kind_terrain: 'Untergründe',
    art_kind_logo:  'Logos',
    art_search_ph:  'Assets suchen…',
    art_palette:    'Palette',
    art_download:   'Herunterladen',
    art_no_assets:  'Keine Kunstbibliothek für diese Umgebung konfiguriert.',
    art_copied:     'Kopiert ✓',
    art_tags:       'Tags',
    art_id:         'ID',
    art_kind:       'Art',
    art_no_palette: '(keine Palette)',
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
    { id: 'art',     labelKey: 'tab_art',     visible: true },
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
  const pre = el('pre', { class: 'logs', data: { placeholder: 'true' } }, t('no_logs'));

  const fetchBtn = el('button', {
    class: 'btn',
    on: { click: async () => {
      const pod = podInput.value.trim();
      if (!pod) return;
      pre.textContent = t('fetching');
      pre.dataset.placeholder = 'true';
      try {
        pre.textContent = await api(`/api/k8s/logs?context=${state.context}&pod=${encodeURIComponent(pod)}`);
        pre.dataset.placeholder = 'false';
      } catch (e) {
        pre.textContent = e.message;
        pre.dataset.placeholder = 'false';
      }
    } },
  }, t('btn_fetch'));

  const copyBtn = el('button', { class: 'btn' }, t('btn_copy'));
  copyBtn.addEventListener('click', () => {
    if (pre.dataset.placeholder === 'true') return;
    const txt = pre.textContent;
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
  else if (state.tab === 'art')   await renderArt();
  setPolling();
}

// ── Art Library ──────────────────────────────────────────────────────────
const ART_STATE = { manifest: null, filterKind: 'all', filterTags: new Set(), q: '', selectedId: null };

function injectSvg(target, svgText) {
  while (target.firstChild) target.removeChild(target.firstChild);
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const node = doc.documentElement;
  if (node && node.nodeName.toLowerCase() === 'svg') {
    target.appendChild(document.importNode(node, true));
  }
}

async function renderArt() {
  if (!ART_STATE.manifest && ART_STATE.manifest !== 'missing') {
    try {
      const r = await fetch('/art-library/manifest.json');
      if (!r.ok) throw new Error(String(r.status));
      ART_STATE.manifest = await r.json();
    } catch (_) {
      ART_STATE.manifest = 'missing';
    }
  }

  if (ART_STATE.manifest === 'missing') {
    setMain(el('div', { class: 'art-pane art-empty' }, [
      el('h2', {}, t('tab_art')),
      el('p', { class: 'mute' }, t('art_no_assets')),
    ]));
    return;
  }

  const manifest = ART_STATE.manifest;
  const kinds = ['all', 'character', 'prop', 'terrain', 'logo'];
  const allTags = [...new Set(manifest.assets.flatMap(a => a.tags))].sort();

  const filtered = manifest.assets.filter(a => {
    if (ART_STATE.filterKind !== 'all' && a.kind !== ART_STATE.filterKind) return false;
    if (ART_STATE.filterTags.size > 0 && !a.tags.some(tag => ART_STATE.filterTags.has(tag))) return false;
    if (ART_STATE.q) {
      const q = ART_STATE.q.toLowerCase();
      if (!a.id.toLowerCase().includes(q) &&
          !(a.name_de || '').toLowerCase().includes(q) &&
          !(a.name_en || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const byKind = { character: [], prop: [], terrain: [], logo: [] };
  for (const a of filtered) byKind[a.kind].push(a);

  const kindChips = el('div', { class: 'art-kinds' },
    kinds.map(k => el('button', {
      class: 'art-chip' + (ART_STATE.filterKind === k ? ' active' : ''),
      on: { click: () => { ART_STATE.filterKind = k; renderArt(); } },
    }, t('art_kind_' + k))));

  const tagChips = el('div', { class: 'art-tags' }, allTags.map(tag =>
    el('button', {
      class: 'art-tag' + (ART_STATE.filterTags.has(tag) ? ' active' : ''),
      on: { click: () => {
        if (ART_STATE.filterTags.has(tag)) ART_STATE.filterTags.delete(tag);
        else ART_STATE.filterTags.add(tag);
        renderArt();
      } },
    }, tag)));

  const search = el('input', { class: 'art-search', type: 'text', placeholder: t('art_search_ph'), value: ART_STATE.q });
  search.addEventListener('input', () => { ART_STATE.q = search.value; renderArt(); });

  const sections = [];
  for (const kind of ['character', 'prop', 'terrain', 'logo']) {
    if (byKind[kind].length === 0) continue;
    sections.push(
      el('h3', { class: 'art-section' }, `${t('art_kind_' + kind)} (${byKind[kind].length})`),
      el('div', { class: 'art-grid' }, byKind[kind].map((a, i) => buildArtCard(a, i + 1))),
    );
  }

  if (sections.length === 0) {
    sections.push(el('p', { class: 'mute' }, '(no matches)'));
  }

  const selected = ART_STATE.selectedId
    ? manifest.assets.find(a => a.id === ART_STATE.selectedId)
    : null;
  const panel = selected ? buildArtPanel(selected) : null;

  setMain(el('div', { class: 'art-pane' + (selected ? ' art-pane--with-panel' : '') }, [
    el('div', { class: 'art-main' }, [
      el('div', { class: 'art-toolbar' }, [search, kindChips]),
      el('div', { class: 'art-tag-row' }, tagChips),
      ...sections,
    ]),
    panel,
  ].filter(Boolean)));
}

function primarySlot(asset) {
  return asset.kind === 'character' ? asset.files.portrait
       : asset.kind === 'prop'      ? asset.files.icon
       : asset.kind === 'terrain'   ? asset.files.swatch
       :                              asset.files.svg;
}

function buildArtCard(asset, index) {
  const card = el('button', {
    class: 'art-card' + (ART_STATE.selectedId === asset.id ? ' active' : ''),
    on: { click: () => { ART_STATE.selectedId = asset.id; renderArt(); } },
  }, [
    el('span', { class: 'art-card-idx' }, String(index).padStart(2, '0')),
    el('div', { class: 'art-card-art' }),
  ]);
  fetch('/art-library/' + primarySlot(asset))
    .then(r => r.text())
    .then(svg => {
      const target = card.querySelector('.art-card-art');
      if (target) injectSvg(target, svg);
    })
    .catch(() => {});
  return card;
}

function buildArtPanel(asset) {
  const close = el('button', { class: 'art-panel-close',
    on: { click: () => { ART_STATE.selectedId = null; renderArt(); } } }, '×');

  const primary = el('div', { class: 'art-panel-art' });
  fetch('/art-library/' + primarySlot(asset))
    .then(r => r.text())
    .then(svg => injectSvg(primary, svg))
    .catch(() => {});

  const tagRow = el('div', { class: 'art-panel-tags' },
    asset.tags.map(tg => el('span', { class: 'art-tag' }, tg)));

  const palette = asset.palette
    ? el('div', { class: 'art-panel-palette' }, Object.entries(asset.palette).map(([key, hex]) =>
        el('button', {
          class: 'art-palette-row',
          on: { click: async (e) => {
            await navigator.clipboard.writeText(hex);
            const btn = e.currentTarget;
            const hexSpan = btn.querySelector('.art-palette-hex');
            const prev = hexSpan.textContent;
            hexSpan.textContent = t('art_copied');
            setTimeout(() => { hexSpan.textContent = prev; }, 1200);
          } },
        }, [
          el('span', { class: 'art-palette-swatch', style: `background:${hex}` }),
          el('span', { class: 'art-palette-key' }, key),
          el('span', { class: 'art-palette-hex' }, hex),
        ])))
    : el('p', { class: 'mute' }, t('art_no_palette'));

  const downloads = el('div', { class: 'art-panel-downloads' },
    Object.entries(asset.files).map(([slot, rel]) =>
      el('a', { class: 'btn', href: '/art-library/' + rel, download: rel.split('/').pop() },
        `${t('art_download')} ${slot}.svg`)));

  const displayName = state.lang === 'de'
    ? (asset.name_de || asset.id)
    : (asset.name_en || asset.name_de || asset.id);

  return el('aside', { class: 'art-panel' }, [
    close,
    primary,
    el('h3', {}, displayName),
    el('dl', { class: 'art-panel-meta' }, [
      el('dt', {}, t('art_id')),   el('dd', {}, asset.id),
      el('dt', {}, t('art_kind')), el('dd', {}, t('art_kind_' + asset.kind)),
      el('dt', {}, t('art_tags')), el('dd', {}, tagRow),
    ]),
    el('h4', {}, t('art_palette')),
    palette,
    downloads,
  ]);
}

// ── Init ──────────────────────────────────────────────────────────────────

// Preselect cluster from the hostname the user came from. mentolder.de domain
// → mentolder cluster; korczewski.de domain → korczewski cluster. Falls back
// to whatever the <select> already has on localhost or unrelated hosts.
function preselectClusterFromDomain() {
  const host = (window.location.hostname || '').toLowerCase();
  let preferred = null;
  if (host.includes('korczewski')) preferred = 'korczewski';
  else if (host.includes('mentolder')) preferred = 'mentolder';
  if (!preferred) return;
  const sel = $('#context');
  if (sel && [...sel.options].some(o => o.value === preferred)) {
    sel.value = preferred;
    state.context = preferred;
  }
}
preselectClusterFromDomain();

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
  if (!state.settingsOpen) {
    closeSettings();
  } else {
    renderSettings();
  }
});

renderNav();
render();
