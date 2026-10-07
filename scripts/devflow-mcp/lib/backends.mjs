// scripts/devflow-mcp/lib/backends.mjs — bge, Postgres (lesend) und codebase-memory als MCP-Clients (T900985).
//
// Design D1: Default-Endpunkte sind die des WSL-Hosts (bge-mcp :13005, mcp-postgres :13001,
// codebase-memory als lokales Binary). Jede Quelle lässt sich per DEVFLOW_{BGE,PG,CBM}_STDIO auf
// einen stdio-Server umlenken — so laufen die Tests gegen Fixture-Server ohne Cluster.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connectHttp, connectStdio } from '../../toolset/lib/mcp-client.mjs';

// Bearer-Tokens: Umgebung zuerst, dann die server.env-Dateien, aus denen auch die systemd-Units
// lesen — dieselbe Reihenfolge wie scripts/mcp-sync.sh. Ein Harness, der den Server ohne
// Login-Shell startet (opencode, llama.cpp), hat die Tokens sonst nicht (gemessen: HTTP 401).
const TOKEN_FILES = [['bge-mcp', 'server.env'], ['mcp-postgres', 'server.env']];
export function withTokens(env = process.env, homeDir = os.homedir()) {
  const merged = { ...env };
  for (const parts of TOKEN_FILES) {
    let text;
    try { text = fs.readFileSync(path.join(homeDir, '.config', ...parts), 'utf8'); } catch { continue; }
    for (const line of text.split('\n')) {
      const eq = line.indexOf('=');
      if (eq < 1 || line.trimStart().startsWith('#')) continue;
      const key = line.slice(0, eq).trim();
      if (!/^[A-Z_][A-Z0-9_]*TOKEN$/.test(key) || merged[key]) continue;
      let val = line.slice(eq + 1).trim();
      if (val.length > 1 && val[0] === val[val.length - 1] && (val[0] === '"' || val[0] === "'")) val = val.slice(1, -1);
      merged[key] = val;
    }
  }
  return merged;
}

const splitSpec = (spec) => {
  const [command, ...args] = spec.trim().split(/\s+/);
  return { command, args };
};

// Text-Ergebnis eines tools/call; isError wird zur Exception.
export async function callTool(conn, name, args) {
  const r = await conn.request('tools/call', { name, arguments: args });
  const text = (r?.content ?? []).map(c => c.text ?? '').join('');
  if (r?.isError) throw new Error(`${name}: ${text.slice(0, 300)}`);
  return text;
}

// Verbindung erst beim ersten Bedarf öffnen; close() schließt nur, was geöffnet wurde.
function lazy(open) {
  let p = null;
  const get = async () => {
    if (!p) p = open().catch((e) => { p = null; throw e; });
    return p;
  };
  get.close = async () => { if (p) { try { (await p).close(); } catch { /* Öffnen schlug fehl */ } p = null; } };
  return get;
}

export function makeBge(env = process.env) {
  const get = lazy(() => env.DEVFLOW_BGE_STDIO
    ? connectStdio({ ...splitSpec(env.DEVFLOW_BGE_STDIO), env, timeoutMs: 120000 })
    : connectHttp({ url: env.DEVFLOW_BGE_URL || 'http://localhost:13005/mcp', headers: { Authorization: 'Bearer ${BGE_MCP_TOKEN}' }, env: withTokens(env), timeoutMs: 120000 }));
  return {
    async embed(texts, batch = 32) {
      const conn = await get();
      const out = [];
      for (let i = 0; i < texts.length; i += batch) {
        const j = JSON.parse(await callTool(conn, 'bge_embed', { texts: texts.slice(i, i + batch) }));
        out.push(...j.embeddings);
      }
      return out;
    },
    // Rückgabe: Indizes der Dokumente in Rerank-Reihenfolge mit Score. bge_rerank antwortet mit
    // den Dokumenttexten; doppelte Texte werden der Reihe nach ihren Indizes zugeordnet.
    async rerank(query, documents, topK) {
      const conn = await get();
      const j = JSON.parse(await callTool(conn, 'bge_rerank', { query, documents, ...(topK ? { top_k: topK } : {}) }));
      const slots = new Map();
      documents.forEach((d, i) => { if (!slots.has(d)) slots.set(d, []); slots.get(d).push(i); });
      return (j.results ?? []).map(r => ({ index: slots.get(r.document)?.shift(), score: r.score })).filter(r => r.index !== undefined);
    },
    close: () => get.close(),
  };
}

export function makePg(env = process.env) {
  const get = lazy(() => env.DEVFLOW_PG_STDIO
    ? connectStdio({ ...splitSpec(env.DEVFLOW_PG_STDIO), env, timeoutMs: 60000 })
    : connectHttp({ url: env.DEVFLOW_PG_URL || 'http://localhost:13001/mcp', headers: { Authorization: 'Bearer ${MCP_POSTGRES_TOKEN}' }, env: withTokens(env), timeoutMs: 60000 }));
  return {
    async query(sql) { return JSON.parse(await callTool(await get(), 'query', { sql })); },
    close: () => get.close(),
  };
}

// codebase-memory-Binary: DEVFLOW_CBM_BIN, sonst PATH, sonst ~/.npm-global/bin (dort installiert
// npm -g auf dem WSL-Host; das Verzeichnis fehlt im Login-PATH, gemessen 2026-10-03).
export function resolveCbmBinary(env = process.env) {
  if (env.DEVFLOW_CBM_BIN) return env.DEVFLOW_CBM_BIN;
  for (const dir of (env.PATH || '').split(path.delimiter)) {
    const p = path.join(dir, 'codebase-memory-mcp');
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch { /* weiter */ }
  }
  return path.join(os.homedir(), '.npm-global', 'bin', 'codebase-memory-mcp');
}

export async function openCbm(repoRoot, env = process.env) {
  const spec = env.DEVFLOW_CBM_STDIO ? splitSpec(env.DEVFLOW_CBM_STDIO) : { command: resolveCbmBinary(env), args: [] };
  return connectStdio({ ...spec, cwd: repoRoot, env, timeoutMs: 900000 });
}
