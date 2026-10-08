#!/usr/bin/env node
// Ruft ein Tool des devflow-mcp-Servers über stdio auf und gibt das Ergebnis als JSON aus.
//   node call.mjs <repo-root> list
//   node call.mjs <repo-root> <tool> '<json-args>'
// Ausgabe: bei `list` die Toolnamen (eine Zeile), sonst das geparste JSON aus content[0].text,
// bei isError zusätzlich {"isError": true}.
import path from 'node:path';

const [repo, tool, argsJson = '{}'] = process.argv.slice(2);
const { connectStdio, listTools } = await import(path.join(repo, 'scripts/toolset/lib/mcp-client.mjs'));
const central = process.env.MCP_SERVERS_HOME || '/home/patrick/mcp-servers';
const conn = await connectStdio({ command: 'node', args: [path.join(central, 'devflow/server.mjs')], cwd: process.env.DEVFLOW_REPO_ROOT || repo, timeoutMs: 60000 });
try {
  if (tool === 'list') {
    console.log((await listTools(conn)).map(t => t.name).sort().join(' '));
  } else {
    const r = await conn.request('tools/call', { name: tool, arguments: JSON.parse(argsJson) });
    const body = JSON.parse(r.content?.[0]?.text ?? '{}');
    console.log(JSON.stringify(r.isError ? { isError: true, ...body } : body));
  }
} finally {
  await conn.close();
}
process.exit(0);
