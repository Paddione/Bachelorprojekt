// scripts/devflow-mcp/lib/graph-cache.mjs — lokaler Graph-Korpus-Cache (T900985, design.md D3).
//
// Layout je codebase-memory-Projekt: meta.json · symbols.jsonl (eine Zeile je Symbol, gleiche
// Reihenfolge wie die Vektoren) · vectors.f32 (Float32, normiert, zeilenweise).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function cacheRoot(env = process.env) {
  return env.DEVFLOW_CACHE_DIR || path.join(os.homedir(), '.cache', 'devflow-mcp');
}

export const cacheDir = (project, env = process.env) => path.join(cacheRoot(env), project);

function normalize(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map(x => x / n);
}

export function writeCache(dir, meta, records, vectors) {
  fs.mkdirSync(dir, { recursive: true });
  const dims = vectors[0]?.length ?? 0;
  const buf = new Float32Array(records.length * dims);
  vectors.forEach((v, i) => buf.set(normalize(v), i * dims));
  const tmp = (f) => path.join(dir, `.${f}.tmp-${process.pid}`);
  fs.writeFileSync(tmp('symbols.jsonl'), records.map(r => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(tmp('vectors.f32'), Buffer.from(buf.buffer));
  fs.writeFileSync(tmp('meta.json'), JSON.stringify({ ...meta, dims, count: records.length }, null, 2) + '\n');
  // meta.json zuletzt: ein Leser sieht entweder den alten oder den vollständigen neuen Stand.
  fs.renameSync(tmp('symbols.jsonl'), path.join(dir, 'symbols.jsonl'));
  fs.renameSync(tmp('vectors.f32'), path.join(dir, 'vectors.f32'));
  fs.renameSync(tmp('meta.json'), path.join(dir, 'meta.json'));
}

export function readCache(dir) {
  const metaPath = path.join(dir, 'meta.json');
  if (!fs.existsSync(metaPath)) return null;
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const records = fs.readFileSync(path.join(dir, 'symbols.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  const raw = fs.readFileSync(path.join(dir, 'vectors.f32'));
  const matrix = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  if (records.length !== meta.count || matrix.length !== meta.count * meta.dims) {
    throw new Error(`graph cache inconsistent in ${dir}: ${records.length} records, ${matrix.length} floats, meta ${meta.count}×${meta.dims}`);
  }
  return { meta, records, matrix };
}

export const vectorAt = (cache, i) => Array.from(cache.matrix.subarray(i * cache.meta.dims, (i + 1) * cache.meta.dims));

// Kosinus-Top-k (Vektoren sind normiert → Skalarprodukt). filter(record) → boolean.
export function topK(cache, query, k, filter = null) {
  const q = normalize(query);
  const { dims } = cache.meta;
  const scored = [];
  for (let i = 0; i < cache.records.length; i++) {
    if (filter && !filter(cache.records[i])) continue;
    let dot = 0;
    const off = i * dims;
    for (let d = 0; d < dims; d++) dot += cache.matrix[off + d] * q[d];
    scored.push({ index: i, score: dot });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}
