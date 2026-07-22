// scripts/llm-proxy/server.mjs
import http from 'node:http';
import { Readable } from 'node:stream';
import { startRegistryPoll, getBackends, resolveApiKey } from './backends.mjs';
import { startDiscovery, resolveModel, aggregateModels, getState } from './discovery.mjs';
import { applyFixups } from './fixups.mjs';

const PORT = Number(process.env.LLM_PROXY_PORT || 18235);
const POLL_MS = 30_000;

startRegistryPoll(POLL_MS);
const discovery = startDiscovery(getBackends, POLL_MS);

function sendJson(res, status, obj) {
  const buf = Buffer.from(JSON.stringify(obj));
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': buf.length });
  res.end(buf);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

async function proxyV1(req, res, subpath) {
  const body = await readBody(req);
  const routed = resolveModel(body.model, getBackends);
  if (!routed) return sendJson(res, 503, { error: { code: 'no_backend', message: 'no healthy backend' } });

  const { backend, servedModel, substituted } = routed;
  let upstreamBody = { ...body, model: servedModel };
  upstreamBody = applyFixups(backend.fixups, upstreamBody);

  const headers = { 'content-type': 'application/json' };
  const key = resolveApiKey(backend);
  if (key) headers.authorization = `Bearer ${key}`;

  const upstream = await fetch(`${backend.baseUrl}${subpath}`, {
    method: 'POST', headers, body: JSON.stringify(upstreamBody),
  });

  const passHeaders = { 'x-llm-proxy-backend': backend.name, 'x-llm-proxy-served-model': servedModel };
  for (const h of ['content-type', 'cache-control']) {
    const v = upstream.headers.get(h); if (v) passHeaders[h] = v;
  }
  if (substituted) console.log(`[route] ${body.model} → ${backend.name}:${servedModel}`);
  res.writeHead(upstream.status, passHeaders);
  if (upstream.body) Readable.fromWeb(upstream.body).pipe(res);  // SSE-Byte-Pipe
  else res.end();
}

const server = http.createServer((req, res) => {
  const { method, url } = req;
  const path = url.split('?')[0];
  (async () => {
    if (path === '/health') return sendJson(res, 200, { status: 'ok' });
    if (path === '/v1/models' && method === 'GET') return sendJson(res, 200, aggregateModels());
    if (path === '/admin/state' && method === 'GET') return sendJson(res, 200, getState(getBackends));
    if (path === '/admin/reload' && method === 'POST') { await discovery.probeNow(); return sendJson(res, 200, { reloaded: true }); }
    if (path.startsWith('/v1/') && method === 'POST') return proxyV1(req, res, path.slice(3));
    return sendJson(res, 404, { error: { code: 'not_found', message: path } });
  })().catch((err) => sendJson(res, 502, { error: { code: 'proxy_error', message: err.message } }));
});

await discovery.probeNow();
server.listen(PORT, '127.0.0.1', () => console.log(`[llm-proxy] listening on 127.0.0.1:${PORT}`));
