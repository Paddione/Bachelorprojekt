#!/usr/bin/env node
// Fake mcp-postgres (stdio) für die devflow-mcp-Tests [T900985].
// Tool `query` antwortet mit FAKE_PG_ROWS (JSON-Array), unabhängig vom SQL — geprüft wird, dass
// devflow-mcp die Zeilen als Plan-/Bug-/PR-Treffer einsortiert und rerankt.
// FAKE_PG_SQL_LOG: Datei, an die das empfangene SQL angehängt wird.
import readline from 'node:readline';
import fs from 'node:fs';

const rows = process.env.FAKE_PG_ROWS || '[]';
const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  let m; try { m = JSON.parse(line); } catch { return; }
  if (m.id === undefined) return;
  if (m.method === 'initialize') return reply(m.id, { protocolVersion: m.params?.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fake-pg', version: '0' } });
  if (m.method === 'tools/list') return reply(m.id, { tools: [{ name: 'query', inputSchema: { type: 'object' } }] });
  if (m.method === 'tools/call' && m.params?.name === 'query') {
    if (process.env.FAKE_PG_SQL_LOG) fs.appendFileSync(process.env.FAKE_PG_SQL_LOG, m.params.arguments.sql + '\n');
    return reply(m.id, { content: [{ type: 'text', text: rows }] });
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'unknown' } }) + '\n');
});
