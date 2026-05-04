'use strict';

const express = require('express');
const path = require('path');
const { buildAdminGuard } = require('./lib/auth');
const {
  buildPool,
  initBugTicketCommentsTable,
  listTickets,
  getTicketWithComments,
  appendComment,
  resolveTicket,
  reopenTicket,
  archiveTicket,
} = require('./lib/db');
const { runReadonly } = require('./lib/kubectl');

const BRAND = process.env.BRAND || 'mentolder';
const PORT  = process.env.PORT || 3000;

const app  = express();
const pool = buildPool();

app.use(express.json({ limit: '32kb' }));

app.get('/healthz', (_req, res) => res.json({ ok: true }));

const adminGuard = buildAdminGuard(process.env.PORTAL_ADMIN_USERNAME);
app.use(adminGuard);

// ── Tickets ────────────────────────────────────────────────────────────────
app.get('/api/tickets', async (req, res) => {
  try {
    const rows = await listTickets(pool, {
      brand: BRAND,
      status:   req.query.status   || undefined,
      category: req.query.category || undefined,
      q:        req.query.q        || undefined,
    });
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tickets/:id', async (req, res) => {
  try {
    const out = await getTicketWithComments(pool, req.params.id);
    if (!out) return res.status(404).json({ error: 'not found' });
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tickets/:id/comments', async (req, res) => {
  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'body required' });
  if (body.length > 8000) return res.status(400).json({ error: 'body too long' });
  try {
    const row = await appendComment(pool, { ticketId: req.params.id, author: req.adminUser, body });
    res.status(201).json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tickets/:id/resolve', async (req, res) => {
  const note = String(req.body?.note || '').trim().slice(0, 4000);
  try {
    res.json(await resolveTicket(pool, { ticketId: req.params.id, author: req.adminUser, note }));
  } catch (e) { res.status(409).json({ error: e.message }); }
});

app.post('/api/tickets/:id/reopen', async (req, res) => {
  const reason = String(req.body?.reason || '').trim().slice(0, 4000);
  try {
    res.json(await reopenTicket(pool, { ticketId: req.params.id, author: req.adminUser, reason }));
  } catch (e) { res.status(409).json({ error: e.message }); }
});

app.post('/api/tickets/:id/archive', async (req, res) => {
  try {
    res.json(await archiveTicket(pool, { ticketId: req.params.id, author: req.adminUser }));
  } catch (e) { res.status(409).json({ error: e.message }); }
});

// ── K8s readonly ───────────────────────────────────────────────────────────
function k8sHandler(verb, resource, namespace) {
  return async (req, res) => {
    const context = String(req.query.context || 'mentolder');
    const name    = req.query.pod ? String(req.query.pod) : undefined;
    try {
      const out = await runReadonly({ context, verb, resource, namespace, name });
      const isLogs = verb === 'logs';
      res.type(isLogs ? 'text/plain' : 'application/json').send(out);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  };
}

app.get('/api/k8s/pods',          k8sHandler('get',  'pods',          'workspace'));
app.get('/api/k8s/services',      k8sHandler('get',  'services',      'workspace'));
app.get('/api/k8s/ingress',       k8sHandler('get',  'ingressroutes', 'workspace'));
app.get('/api/k8s/jobs',          k8sHandler('get',  'jobs',          'workspace'));
app.get('/api/k8s/argocd-apps',   k8sHandler('get',  'applications',  'argocd'));
app.get('/api/k8s/logs',          k8sHandler('logs', 'pods',          'workspace'));

// ── Static UI ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Boot ───────────────────────────────────────────────────────────────────
(async () => {
  try { await initBugTicketCommentsTable(pool); }
  catch (e) { console.error('migration failed (continuing):', e.message); }
  app.listen(PORT, '0.0.0.0', () => console.log(`dashboard-web listening on :${PORT}`));
})();
