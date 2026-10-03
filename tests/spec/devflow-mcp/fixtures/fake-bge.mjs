#!/usr/bin/env node
// Fake bge-mcp (stdio) für die devflow-mcp-Tests [T900985].
// bge_embed: deterministische Bag-of-Words-Vektoren (64 Dim., normiert) — ähnliche Texte liegen
// nah beieinander, ohne Modell. bge_rerank: Score = Anzahl gemeinsamer Wörter.
// FAKE_BGE_LOG: Datei, an die je Embed-Aufruf "embed <n>" angehängt wird (Inkrementalitätstest).
// FAKE_BGE_FAIL_RERANK=1: bge_rerank antwortet mit Fehler (degraded-Test).
import readline from 'node:readline';
import fs from 'node:fs';

const DIM = 64;
let embedCalls = 0;
const words = (s) => String(s).toLowerCase().match(/[a-z0-9_]+/g) ?? [];
function hash(w) { let h = 2166136261; for (const c of w) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return Math.abs(h) % DIM; }
function embed(text) {
  const v = new Array(DIM).fill(0);
  for (const w of words(text)) v[hash(w)] += 1;
  const n = Math.hypot(...v) || 1;
  return v.map(x => x / n);
}
const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
const fail = (id, message) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message } }) + '\n');
const text = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj) }] });

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  let m; try { m = JSON.parse(line); } catch { return; }
  if (m.id === undefined) return;
  if (m.method === 'initialize') return reply(m.id, { protocolVersion: m.params?.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fake-bge', version: '0' } });
  if (m.method === 'tools/list') return reply(m.id, { tools: [{ name: 'bge_embed', inputSchema: { type: 'object' } }, { name: 'bge_rerank', inputSchema: { type: 'object' } }] });
  if (m.method !== 'tools/call') return fail(m.id, 'method not found');
  const { name, arguments: a } = m.params;
  if (name === 'bge_embed') {
    // FAKE_BGE_FAIL_AFTER=n: nach n erfolgreichen Embed-Aufrufen scheitert jeder weitere (Checkpoint-Test).
    embedCalls++;
    if (process.env.FAKE_BGE_FAIL_AFTER && embedCalls > Number(process.env.FAKE_BGE_FAIL_AFTER)) return fail(m.id, 'upstream did not answer');
    if (process.env.FAKE_BGE_LOG) fs.appendFileSync(process.env.FAKE_BGE_LOG, `embed ${a.texts.length}\n`);
    return reply(m.id, text({ dimensions: DIM, embeddings: a.texts.map(embed) }));
  }
  if (name === 'bge_rerank') {
    if (process.env.FAKE_BGE_FAIL_RERANK === '1') return fail(m.id, 'reranker down');
    const q = new Set(words(a.query));
    const results = a.documents.map((d) => ({ document: d, score: words(d).filter(w => q.has(w)).length }));
    results.sort((x, y) => y.score - x.score);
    return reply(m.id, text({ results: a.top_k ? results.slice(0, a.top_k) : results }));
  }
  return fail(m.id, `unknown tool ${name}`);
});
