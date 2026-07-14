#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createServer } from 'node:http'
import { execFileSync, execFile } from 'child_process'
import { z } from 'zod'

const REPO = process.env.FACTORY_REPO || '/home/patrick/Bachelorprojekt'
const PORT = Number(process.env.FACTORY_MCP_PORT || 13003)
const LIB = `${REPO}/scripts/factory/lib.sh`

function psqlJSON(sql) {
  try {
    return execFileSync('bash', ['-c', `source "${LIB}" && factory_resolve && cat <<'SQL' | factory_psql -tA\n${sql}\nSQL`],
      { encoding: 'utf8', timeout: 15000, cwd: REPO }).trim()
  } catch (e) { return JSON.stringify({ error: e.message }) }
}

// Build a fresh server instance per request (stateless MCP — see transport below).
// Tools are pure (shell/psql calls, no shared in-process state), so re-registering
// per request is cheap and avoids the "already connected" / single-session pitfalls
// of sharing one McpServer across multiple clients.
function buildServer() {
const server = new McpServer({ name: 'factory', version: '1.0.0' })

server.tool('factory_status', 'Show factory queue depth and whether a tick is running', async () => {
  const lockHeld = execFileSync('bash', ['-c', `test -f /tmp/factory-tick.lock || { echo 'false'; exit; }; (flock -n 9 2>/dev/null && echo 'false' || echo 'true') 9>/tmp/factory-tick.lock`], { encoding: 'utf8', timeout: 3000 }).trim()
  return { content: [{ type: 'text', text: JSON.stringify({ backlog: psqlJSON("SELECT count(*) FROM tickets.tickets WHERE status='backlog'"), plan_staged: psqlJSON("SELECT count(*) FROM tickets.tickets WHERE status='plan_staged'"), tick_running: lockHeld === 'true' }, null, 2) }] }
})

server.tool('factory_queue', 'List waiting tickets (backlog + plan_staged)', async () => {
  const sql = `SELECT COALESCE(json_agg(row_to_json(q)), '[]') FROM (SELECT external_id, title, priority, status FROM tickets.tickets WHERE status IN ('backlog','plan_staged') ORDER BY CASE priority WHEN 'hoch' THEN 1 WHEN 'mittel' THEN 2 ELSE 3 END, created_at) q;`
  return { content: [{ type: 'text', text: psqlJSON(sql) }] }
})

server.tool('factory_enqueue', 'Enqueue a ticket into the factory backlog', { ticket_id: z.string().describe('Ticket external_id (e.g. T000123)') }, async ({ ticket_id }) => {
  try {
    const out = execFileSync('bash', [`${REPO}/scripts/ticket.sh`, 'enqueue', '--id', ticket_id], { encoding: 'utf8', timeout: 15000, cwd: REPO })
    return { content: [{ type: 'text', text: out.trim() || `enqueued ${ticket_id}` }] }
  } catch (e) { return { content: [{ type: 'text', text: `error: ${e.message}` }], isError: true } }
})

server.tool('factory_trigger', 'Trigger an immediate factory tick (runs wakeup.sh in background)', async () => {
  return new Promise((resolve) => {
    execFile('bash', [`${REPO}/scripts/factory/wakeup.sh`], { timeout: 3000, cwd: REPO, stdio: 'ignore' })
      .on('exit', (code) => resolve({ content: [{ type: 'text', text: `wakeup.sh exited: ${code}` }] }))
      .on('error', (e) => resolve({ content: [{ type: 'text', text: `error: ${e.message}` }], isError: true }))
  })
})

server.tool('factory_recent', 'Show last N factory run comments from ticket_comments', { limit: z.number().optional().describe('Number of recent entries (default 10)') }, async ({ limit }) => {
  const n = Math.min(Number(limit) || 10, 50)
  const sql = `SELECT COALESCE(json_agg(row_to_json(q)), '[]') FROM (SELECT ticket_id, author, body, created_at FROM tickets.ticket_comments WHERE author='factory' ORDER BY created_at DESC LIMIT ${n}) q;`
  return { content: [{ type: 'text', text: psqlJSON(sql) }] }
})

server.tool('openspec_find_similar',
  'Findet semantisch ähnliche OpenSpec Changes zu einer Suchanfrage (wraps /api/openspec/search)',
  { query: z.string().describe('Suchanfrage'),
    limit: z.number().optional().describe('Default 5'),
    status: z.string().optional().describe('Filter: planning | plan_staged | archived') },
  async ({ query, limit, status }) => {
    const base = process.env.OPENSPEC_SEARCH_URL || 'http://website.website.svc.cluster.local:4321'
    const u = new URL(`${base}/api/openspec/search`)
    u.searchParams.set('q', query)
    if (limit) u.searchParams.set('limit', String(limit))
    if (status) u.searchParams.set('status', status)
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(8000) })
      const text = await r.text()
      return { content: [{ type: 'text', text }], isError: !r.ok }
    } catch (e) {
      return { content: [{ type: 'text', text: `error: ${e.message}` }], isError: true }
    }
  })

  return server
}

const app = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, server: 'factory-mcp' }))
    return
  }
  if (req.method === 'POST' && req.url === '/mcp') {
    let body = ''
    for await (const chunk of req) body += chunk
    // Stateless transport: a fresh server+transport per request, no session id.
    // Every initialize is accepted, so multiple/reconnecting clients (Claude Code,
    // the OpenCode bridge) never collide on a single shared session.
    const server = buildServer()
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    res.on('close', () => { transport.close(); server.close() })
    try {
      req.body = JSON.parse(body)
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
    } catch (e) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: String(e?.message || e) }, id: null }))
      }
    }
    return
  }
  res.writeHead(404).end()
})
app.listen(PORT, '127.0.0.1', () => console.log(`factory-mcp listening on 127.0.0.1:${PORT}`))
