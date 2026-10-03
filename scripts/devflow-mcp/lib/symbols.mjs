// scripts/devflow-mcp/lib/symbols.mjs — Graph-Export → ein Chunk je Symbol (T900985, design.md D2).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { callTool } from './backends.mjs';

const LABELS = ['Function', 'Method', 'Class'];
const BODY_LINES = 25;
const BODY_CHARS = 1200;
const DOC_CHARS = 400;
const MAX_EDGES = 8;

// Alle Zeilen einer Cypher-Abfrage über Cursor-Seiten (codebase-memory 0.11, format json).
async function queryAll(cbm, project, query) {
  const rows = [];
  let cursor;
  do {
    const args = { project, query, format: 'json', max_rows: 5000, max_output_tokens: 400000 };
    if (cursor) args.cursor = cursor;
    const page = JSON.parse(await callTool(cbm, 'query_graph', args));
    rows.push(...(page.rows ?? []));
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return rows;
}

export async function exportGraph(cbm, project) {
  const symbols = [];
  for (const label of LABELS) {
    const rows = await queryAll(cbm, project,
      `MATCH (f:${label}) RETURN f.qualified_name AS qn, f.file_path AS file, f.start_line AS s, f.end_line AS e, f.signature AS sig, f.docstring AS doc`);
    for (const [qn, file, s, e, sig, doc] of rows) {
      if (!qn || !file) continue;
      symbols.push({ qn, kind: label, file, line: Number(s) || 1, end: Number(e) || Number(s) || 1, signature: sig || '', doc: doc || '' });
    }
  }
  const edges = await queryAll(cbm, project, 'MATCH (a)-[:CALLS]->(b) RETURN a.qualified_name AS a, b.qualified_name AS b');
  return { symbols, edges };
}

const shortName = (qn) => qn.split('.').pop();

export function buildChunks({ symbols, edges }, repoRoot, embedChars = Number(process.env.DEVFLOW_EMBED_CHARS || 500)) {
  const calls = new Map();
  const calledBy = new Map();
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(v); };
  for (const [a, b] of edges) {
    if (!a || !b || a === b) continue;
    push(calls, a, shortName(b));
    push(calledBy, b, shortName(a));
  }
  const fileCache = new Map();
  const lines = (file) => {
    if (!fileCache.has(file)) {
      try { fileCache.set(file, fs.readFileSync(path.join(repoRoot, file), 'utf8').split('\n')); } catch { fileCache.set(file, null); }
    }
    return fileCache.get(file);
  };
  return symbols.map((s) => {
    const src = lines(s.file);
    const body = src ? src.slice(s.line - 1, Math.min(s.end, s.line - 1 + BODY_LINES)).join('\n').slice(0, BODY_CHARS) : '';
    const head = [
      `${s.kind} ${shortName(s.qn)}`,
      `file: ${s.file}:${s.line}`,
      s.signature ? `signature: ${s.signature}` : null,
      s.doc ? `doc: ${s.doc.slice(0, DOC_CHARS)}` : null,
      calls.has(s.qn) ? `calls: ${[...calls.get(s.qn)].slice(0, MAX_EDGES).join(', ')}` : null,
      calledBy.has(s.qn) ? `called by: ${[...calledBy.get(s.qn)].slice(0, MAX_EDGES).join(', ')}` : null,
    ].filter(Boolean).join('\n');
    const text = body ? `${head}\n---\n${body}` : head;
    // Eingebettet wird nur der Anfang (Kopf + Rumpfbeginn): die bge-Latenz wächst linear mit der
    // Textlänge (~2,2 ms/Zeichen seriell, Messung 2026-10-03). text_hash hängt am eingebetteten
    // Teil — nur dessen Änderung braucht einen neuen Vektor.
    const embedText = text.slice(0, embedChars);
    return {
      qn: s.qn, name: shortName(s.qn), kind: s.kind, file: s.file, line: s.line, end: s.end,
      signature: s.signature, text, embed_chars: embedText.length,
      text_hash: createHash('sha256').update(embedText).digest('hex').slice(0, 16),
    };
  });
}

export const embedTextOf = (chunk) => chunk.text.slice(0, chunk.embed_chars);
