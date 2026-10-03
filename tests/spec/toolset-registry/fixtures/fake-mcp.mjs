#!/usr/bin/env node
// Fake-MCP-Server (stdio) für tool-level.bats [T900983].
// Die Tool-Liste kommt aus FAKE_MCP_TOOLS (JSON-Array von { name, description, annotations }).
// Antwortet auf initialize und tools/list; alles andere bekommt einen JSON-RPC-Fehler.
import readline from 'node:readline';

const tools = JSON.parse(process.env.FAKE_MCP_TOOLS || '[]').map(t => ({
  inputSchema: { type: 'object', properties: {} },
  ...t,
}));

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.id === undefined) return; // Notification
  let result;
  if (msg.method === 'initialize') {
    result = { protocolVersion: msg.params?.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fake-mcp', version: '0.0.1' } };
  } else if (msg.method === 'tools/list') {
    result = { tools };
  } else {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'method not found' } }) + '\n');
    return;
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }) + '\n');
});
