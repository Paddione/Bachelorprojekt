#!/usr/bin/env node
// Fake codebase-memory-mcp (stdio) für die devflow-mcp-Tests [T900985].
// Symbole aus FAKE_CBM_SYMBOLS (JSON-Array {qn, file, s, e, sig, doc, label}), Kanten aus
// FAKE_CBM_CALLS (JSON-Array [callerQn, calleeQn]). query_graph antwortet im JSON-Format von
// codebase-memory 0.11 ({columns, rows, has_more, next_cursor}) und paginiert in 2er-Seiten,
// damit der Cursor-Pfad des Indexers getestet wird.
import readline from 'node:readline';

const symbols = JSON.parse(process.env.FAKE_CBM_SYMBOLS || '[]');
const calls = JSON.parse(process.env.FAKE_CBM_CALLS || '[]');
const PAGE = 2;
const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
const text = (obj) => ({ content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] });

function page(columns, rows, a) {
  const start = a.cursor ? Number(a.cursor) : 0;
  const slice = rows.slice(start, start + PAGE);
  const more = start + PAGE < rows.length;
  return { columns, rows: slice, returned: slice.length, total: rows.length, has_more: more, ...(more ? { next_cursor: String(start + PAGE) } : {}) };
}

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  let m; try { m = JSON.parse(line); } catch { return; }
  if (m.id === undefined) return;
  if (m.method === 'initialize') return reply(m.id, { protocolVersion: m.params?.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'codebase-memory-mcp', version: '0.11.0-fake' } });
  if (m.method === 'tools/list') return reply(m.id, { tools: ['index_repository', 'list_projects', 'query_graph'].map(name => ({ name, inputSchema: { type: 'object' } })) });
  const { name, arguments: a = {} } = m.params ?? {};
  if (name === 'index_repository') return reply(m.id, text({ project: 'fixture-proj' }));
  if (name === 'list_projects') return reply(m.id, text({ projects: [{ name: 'fixture-proj', root_path: a.repo_path ?? '' }] }));
  if (name === 'query_graph') {
    const q = a.query || '';
    if (q.includes('CALLS')) return reply(m.id, text(page(['a', 'b'], calls, a)));
    const label = (q.match(/\((\w+):(Function|Method|Class)\)/) || [])[2];
    const rows = symbols.filter(s => (s.label || 'Function') === label).map(s => [s.qn, s.file, String(s.s), String(s.e), s.sig ?? '', s.doc ?? '']);
    return reply(m.id, text(page(['qn', 'file', 's', 'e', 'sig', 'doc'], rows, a)));
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'unknown' } }) + '\n');
});
