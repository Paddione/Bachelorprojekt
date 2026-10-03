#!/usr/bin/env node
// scripts/devflow-mcp/graph-index.mjs — Graph-Korpus aus einem frischen codebase-memory-Index (T900985).
//
//   node scripts/devflow-mcp/graph-index.mjs [--repo <pfad>] [--full] [--sync-db] [--max-minutes <n>]
//
// Durchsatz (Messung 2026-10-03): bge-mcp bettet seriell ein, ~2,2 ms je Zeichen. Ein Erstlauf über
// ~13 000 Symbole dauert deshalb Stunden — der Indexer sichert alle 25 Batches einen Checkpoint,
// hält ein Zeitbudget ein und setzt beim nächsten Lauf fort (meta.partial / meta.pending).
//
// Ablauf (design.md D2/D3): codebase-memory index_repository → Function/Method/Class + CALLS
// exportieren → ein Chunk je Symbol → nur geänderte Chunks einbetten (text_hash) → lokaler Cache.
// --sync-db schreibt den Cache danach per PGURL nach knowledge.* (SSOT, sync-db.mjs).
//
// Exit 0 auch ohne erreichbare Backends: der Indexer läuft aus Git-Hooks und dem Nightly, und
// ein Hook darf Git nie blockieren. Der Grund steht in der Ausgabe; der alte Cache bleibt stehen.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeBge, openCbm, callTool } from './lib/backends.mjs';
import { exportGraph, buildChunks, embedTextOf } from './lib/symbols.mjs';
import { cacheRoot, cacheDir, readCache, writeCache, vectorAt } from './lib/graph-cache.mjs';

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const full = argv.includes('--full');
const syncDb = argv.includes('--sync-db');
const repo = path.resolve(opt('--repo') || process.env.DEVFLOW_REPO_ROOT || process.cwd());

const say = (msg) => console.log(`graph-index: ${msg}`);
const stop = (msg) => { say(msg); process.exit(0); };

// Single-Flight: ein zweiter Lauf (Hook während des Nightly) endet sofort.
fs.mkdirSync(cacheRoot(), { recursive: true });
const lockPath = path.join(cacheRoot(), 'index.lock');
try {
  const pid = Number(fs.readFileSync(lockPath, 'utf8'));
  if (pid && pid !== process.pid) { try { process.kill(pid, 0); stop(`läuft bereits (pid ${pid})`); } catch { /* verwaist */ } }
} catch { /* kein Lock */ }
fs.writeFileSync(lockPath, String(process.pid));
process.on('exit', () => { try { fs.unlinkSync(lockPath); } catch { /* schon weg */ } });

let commit = null;
try { commit = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* kein Git-Repo */ }

let cbm;
try {
  cbm = await openCbm(repo);
} catch (e) {
  stop(`codebase-memory nicht erreichbar (${e.message}) — Index nicht geschrieben`);
}

let project;
let graph;
const t0 = Date.now();
try {
  const res = JSON.parse(await callTool(cbm, 'index_repository', { repo_path: repo, mode: 'moderate' }));
  project = res.project;
  graph = await exportGraph(cbm, project);
} catch (e) {
  await cbm.close();
  stop(`codebase-memory-Export fehlgeschlagen (${e.message}) — Index nicht geschrieben`);
}
const cbmVersion = cbm.serverInfo?.version ?? null;
await cbm.close();

const chunks = buildChunks(graph, repo);
const dir = cacheDir(project);
let old = null;
if (!full) {
  try { old = readCache(dir); } catch (e) { say(`alter Cache unlesbar, Vollauf: ${e.message}`); }
}
const reuse = new Map();
if (old) old.records.forEach((r, i) => reuse.set(r.text_hash, i));

const vectors = new Array(chunks.length);
const todo = [];
chunks.forEach((c, i) => {
  const j = reuse.get(c.text_hash);
  if (j !== undefined) vectors[i] = vectorAt(old, j);
  else todo.push(i);
});
const reused = chunks.length - todo.length;
// Produktivcode vor Tests: bricht ein langer Erstlauf ab, ist das Wichtigste schon eingebettet.
const isTest = (f) => /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[cm]?[jt]s$|\.bats$/.test(f);
todo.sort((a, b) => Number(isTest(chunks[a].file)) - Number(isTest(chunks[b].file)));

// Cache mit allen Symbolen, die einen Vektor haben. pending > 0 heißt: der nächste Lauf setzt fort.
const meta = () => ({ project, repo, commit, built_at: new Date().toISOString(), cbm_version: cbmVersion });
function checkpoint() {
  const have = chunks.map((_, i) => i).filter(i => vectors[i]);
  if (have.length === 0) return false;
  const pending = chunks.length - have.length;
  writeCache(dir, { ...meta(), partial: pending > 0, pending }, have.map(i => chunks[i]), have.map(i => vectors[i]));
  return true;
}

const batch = Number(process.env.DEVFLOW_EMBED_BATCH || 4);
const maxMs = Number(opt('--max-minutes') || 0) * 60000;
const CHECKPOINT_EVERY = 25; // Batches
let embedded = 0;
let stopReason = null;
if (todo.length > 0) {
  const bge = makeBge();
  for (let b = 0; b < todo.length; b += batch) {
    if (maxMs && Date.now() - t0 > maxMs) { stopReason = `Zeitbudget ${opt('--max-minutes')} min erreicht`; break; }
    const ids = todo.slice(b, b + batch);
    let got = null;
    // Ein Timeout bei überlastetem Upstream: einmal mit halber Batchgröße wiederholen.
    for (const size of [...new Set([ids.length, Math.max(1, Math.ceil(ids.length / 2))])]) {
      try {
        got = [];
        for (let k = 0; k < ids.length; k += size) got.push(...await bge.embed(ids.slice(k, k + size).map(i => embedTextOf(chunks[i])), size));
        break;
      } catch (e) {
        got = null;
        stopReason = `bge nicht erreichbar (${e.message.slice(0, 200)})`;
      }
    }
    if (!got) break;
    stopReason = null;
    ids.forEach((ci, k) => { vectors[ci] = got[k]; });
    embedded += ids.length;
    if ((b / batch) % CHECKPOINT_EVERY === CHECKPOINT_EVERY - 1) checkpoint();
  }
  await bge.close();
}

if (!checkpoint()) stop(`${stopReason ?? 'keine Symbole'} — Index nicht geschrieben`);
const pending = todo.length - embedded;
say(`${chunks.length} symbols, reused ${reused}, embedded ${embedded}${pending ? `, partial: ${pending} pending (${stopReason})` : ''} in ${Date.now() - t0} ms → ${dir}`);

if (syncDb) {
  const { syncCacheToDb } = await import('./sync-db.mjs');
  try {
    say(await syncCacheToDb(dir));
  } catch (e) {
    say(`knowledge-Sync fehlgeschlagen (${e.message}) — lokaler Cache ist aktuell`);
  }
}
process.exit(0);
