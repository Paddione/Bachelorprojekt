#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createServer } from 'node:http'
import { execFileSync, execFile } from 'child_process'
import { randomUUID } from 'crypto'
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

const server = new McpServer({ name: 'factory', version: '1.0.0' })

server.tool('factory_status', 'Show factory queue depth and whether a tick is running', async () => {
  const lockHeld = execFileSync('bash', ['-c', `test -f /tmp/factory-tick.lock && flock -n 9 2>/dev/null && echo false || echo true`], { encoding: 'utf8', timeout: 3000 }).trim()
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

const app = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, server: 'factory-mcp' }))
    return
  }
  if (req.method === 'POST' && req.url === '/mcp') {
    let body = ''
    for await (const chunk of req) body += chunk
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() })
    await server.connect(transport)
    req.body = JSON.parse(body)
    await transport.handleRequest(req, res, req.body)
    return
  }
  res.writeHead(404).end()
})
app.listen(PORT, '127.0.0.1', () => console.log(`factory-mcp listening on 127.0.0.1:${PORT}`))
