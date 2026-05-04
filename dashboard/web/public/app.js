'use strict';

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
    } else {
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

const state = {
  tab: 'tickets',
  context: 'mentolder',
  ticketId: null,
  filter: { status: '', category: '', q: '' },
  pollTimer: null,
};

// ── API ────────────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 200)}`);
  const ct = r.headers.get('content-type') || '';
  return ct.includes('json') ? r.json() : r.text();
}

// ── Tabs / context ─────────────────────────────────────────────────────────
$$('#tabs button').forEach(btn => btn.addEventListener('click', () => {
  state.tab = btn.dataset.tab;
  state.ticketId = null;
  $$('#tabs button').forEach(b => b.classList.toggle('active', b === btn));
  render();
}));
$('#context').addEventListener('change', e => { state.context = e.target.value; render(); });
document.addEventListener('visibilitychange', setPolling);

// ── Tickets list ───────────────────────────────────────────────────────────
async function renderTickets() {
  if (state.ticketId) return renderTicketDetail();

  const qs = new URLSearchParams();
  if (state.filter.status)   qs.set('status',   state.filter.status);
  if (state.filter.category) qs.set('category', state.filter.category);
  if (state.filter.q)        qs.set('q',        state.filter.q);
  let rows = [];
  try { rows = await api(`/api/tickets?${qs}`); } catch (_) { /* fall through */ }

  const statusSelect = el('select', {},
    ['', 'open', 'resolved', 'archived'].map(v =>
      el('option', { value: v, ...(v === state.filter.status ? { selected: '' } : {}) }, v || 'all'))
  );
  const qInput = el('input', { type: 'text', placeholder: 'search…', value: state.filter.q });
  const applyBtn = el('button', {
    class: 'btn',
    on: { click: () => {
      state.filter.status = statusSelect.value;
      state.filter.q = qInput.value;
      render();
    } },
  }, 'filter');

  const tbody = el('tbody');
  for (const t of rows) {
    const tr = el('tr', {
      data: { id: t.ticket_id },
      on: { click: () => { state.ticketId = t.ticket_id; render(); } },
    }, [
      el('td', {}, t.ticket_id),
      el('td', {}, t.status),
      el('td', {}, t.category),
      el('td', {}, new Date(t.created_at).toLocaleString('de-DE')),
      el('td', {}, (t.description || '').slice(0, 120)),
    ]);
    tbody.appendChild(tr);
  }

  const node = el('div', {}, [
    el('div', { class: 'row' }, [statusSelect, qInput, applyBtn]),
    el('table', {}, [
      el('thead', {}, el('tr', {}, ['id', 'status', 'category', 'created', 'description'].map(h => el('th', {}, h)))),
      tbody,
    ]),
  ]);
  setMain(node);
}

async function renderTicketDetail() {
  let out = null;
  try { out = await api(`/api/tickets/${encodeURIComponent(state.ticketId)}`); } catch (_) {}

  if (!out) {
    setMain(el('div', {}, [
      el('button', { class: 'btn', on: { click: () => { state.ticketId = null; render(); } } }, '← back'),
      el('p', { class: 'danger' }, 'ticket not found'),
    ]));
    return;
  }
  const t = out.ticket;

  const thread = el('div', { class: 'thread' });
  for (const c of out.comments) {
    thread.appendChild(el('div', { class: `comment ${c.kind}` }, [
      el('div', { class: 'meta' }, `${c.author} — ${new Date(c.created_at).toLocaleString('de-DE')} — ${c.kind}`),
      el('div', {}, c.body),
    ]));
  }

  const composer = el('textarea', { placeholder: 'leave a comment…' });
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
  }, 'comment');

  const buttons = [sendBtn];
  if (t.status === 'open') {
    buttons.push(el('button', {
      class: 'btn',
      on: { click: async () => {
        const note = prompt('Resolution note:') || '';
        await api(`/api/tickets/${encodeURIComponent(state.ticketId)}/resolve`, { method: 'POST', body: JSON.stringify({ note }) });
        render();
      } },
    }, 'resolve'));
  } else {
    buttons.push(el('button', {
      class: 'btn',
      on: { click: async () => {
        const reason = prompt('Reopen reason:') || '';
        await api(`/api/tickets/${encodeURIComponent(state.ticketId)}/reopen`, { method: 'POST', body: JSON.stringify({ reason }) });
        render();
      } },
    }, 'reopen'));
  }
  if (t.status !== 'archived') {
    buttons.push(el('button', {
      class: 'btn',
      on: { click: async () => {
        if (!confirm('Archive this ticket?')) return;
        await api(`/api/tickets/${encodeURIComponent(state.ticketId)}/archive`, { method: 'POST' });
        render();
      } },
    }, 'archive'));
  }

  const header = el('div', {}, [
    el('h2', {}, `${t.ticket_id} (${t.status})`),
    el('p', {}, `${t.category} — ${t.reporter_email} — ${new Date(t.created_at).toLocaleString('de-DE')}`),
  ]);
  if (t.url) {
    header.appendChild(el('p', {}, el('a', { href: t.url, target: '_blank', rel: 'noopener' }, t.url)));
  }
  header.appendChild(el('p', {}, t.description || ''));

  setMain(el('div', {}, [
    el('button', { class: 'btn', on: { click: () => { state.ticketId = null; render(); } } }, '← back'),
    header,
    thread,
    composer,
    el('div', { class: 'row' }, buttons),
  ]));
}

// ── Pods / services ────────────────────────────────────────────────────────
async function renderPods() {
  const out = el('div', {}, [el('p', {}, 'loading…')]);
  const root = el('div', {}, [
    el('button', { class: 'btn', on: { click: renderPods } }, 'refresh'),
    out,
  ]);
  setMain(root);
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
      el('thead', {}, el('tr', {}, ['name', 'phase', 'restarts', 'node'].map(h => el('th', {}, h)))),
      tbody,
    ]));
  } catch (e) {
    clear(out);
    out.appendChild(el('p', { class: 'danger' }, e.message));
  }
}

// ── Logs ───────────────────────────────────────────────────────────────────
async function renderLogs() {
  const podInput = el('input', { type: 'text', placeholder: 'pod name (exact)', style: 'min-width:24rem;' });
  const pre = el('pre', { class: 'logs' }, '(no logs yet)');
  const fetchBtn = el('button', {
    class: 'btn',
    on: { click: async () => {
      const pod = podInput.value.trim();
      if (!pod) return;
      pre.textContent = 'fetching…';
      try {
        const text = await api(`/api/k8s/logs?context=${state.context}&pod=${encodeURIComponent(pod)}`);
        pre.textContent = text;
      } catch (e) {
        pre.textContent = e.message;
      }
    } },
  }, 'fetch');
  setMain(el('div', {}, [el('div', { class: 'row' }, [podInput, fetchBtn]), pre]));
}

// ── ArgoCD ─────────────────────────────────────────────────────────────────
async function renderArgoCD() {
  const out = el('div', {}, [el('p', {}, 'loading…')]);
  const root = el('div', {}, [
    el('button', { class: 'btn', on: { click: renderArgoCD } }, 'refresh'),
    out,
  ]);
  setMain(root);
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
      el('thead', {}, el('tr', {}, ['app', 'sync', 'health', 'cluster'].map(h => el('th', {}, h)))),
      tbody,
    ]));
  } catch (e) {
    clear(out);
    out.appendChild(el('p', { class: 'danger' }, e.message));
  }
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
  if (state.tab === 'tickets') await renderTickets();
  else if (state.tab === 'pods') await renderPods();
  else if (state.tab === 'logs') await renderLogs();
  else if (state.tab === 'argocd') await renderArgoCD();
  setPolling();
}

render();
