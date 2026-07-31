// server.ts — SDLC Cockpit Daemon (K2)
// Start: npx tsx .lavish/kit/daemon/server.ts
// Stop:  kill $(cat /tmp/cockpit-daemon.pid)

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { generateToken, writeTokenFile } from './lib/token';
import { auditMiddleware } from './lib/token';
import { portfolioHandler, featureHandler } from './routes/cockpit';
import { podsListHandler, warningsHandler } from './routes/cluster';
import { factoryStatusHandler } from './routes/factory';
import { agentsHandler, ciHandler, modelsHandler } from './routes/custom';
import { agentStreamHandler, factoryStreamHandler } from './routes/stream';

const PORT = parseInt(process.env.COCKPIT_DAEMON_PORT || '49152', 10);
const token = generateToken();

// Write token file with tight permissions BEFORE starting server
writeTokenFile('/tmp/cockpit-daemon.token', token);

// Write PID file
const fs = require('fs');
fs.writeFileSync('/tmp/cockpit-daemon.pid', String(process.pid));

const app = new Hono();

// CORS: allow the file:// origin of lavish pages and localhost
app.use('*', cors({
  origin: ['null', 'http://localhost:*', 'http://127.0.0.1:*'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowHeaders: ['Authorization', 'Content-Type'],
}));

// Audit middleware for write endpoints
app.use('/api/cockpit/ticket-action', auditMiddleware(token));
app.use('/api/cockpit/agent-action', auditMiddleware(token));

// ----- Routes -----

// Admin Cockpit (mirrors website/src/pages/api/admin/cockpit/)
app.get('/api/admin/cockpit/portfolio', portfolioHandler);
app.get('/api/admin/cockpit/feature', featureHandler);

// Admin Cluster (mirrors website/src/pages/api/admin/cluster/)
app.get('/api/admin/cluster/pods-list', podsListHandler);
app.get('/api/admin/cluster/warnings', warningsHandler);

// Admin Factory
app.get('/api/admin/factory-control', factoryStatusHandler);

// Custom Cockpit Endpoints (new)
app.get('/api/cockpit/agents', agentsHandler);
app.get('/api/cockpit/ci', ciHandler);
app.get('/api/cockpit/models', modelsHandler);

// Token endpoint (E17 — read-only token for browser write stubs)
app.get('/api/cockpit/token', (c) => c.json({ token }));

// SSE Streams
app.get('/api/cockpit/stream/agents', agentStreamHandler);
app.get('/api/cockpit/stream/factory', factoryStreamHandler);

// Write stubs (token-protected, real implementation in K4)
app.post('/api/cockpit/ticket-action', (c) => c.json({ ok: true, message: 'Write actions in K4' }));
app.post('/api/cockpit/agent-action', (c) => c.json({ ok: true, message: 'Write actions in K4' }));

// Health
app.get('/health', (c) => c.json({ status: 'ok', uptime: process.uptime() }));

console.log(`[cockpit-daemon] listening on http://127.0.0.1:${PORT}`);
console.log(`[cockpit-daemon] token at /tmp/cockpit-daemon.token (0600)`);
console.log(`[cockpit-daemon] pid ${process.pid}`);

serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' });
