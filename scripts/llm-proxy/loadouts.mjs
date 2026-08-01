// scripts/llm-proxy/loadouts.mjs
// Einziger Ort, der scripts/llm/loadouts.json liest und schreibt.
// Bewusst fail-closed bei der Validierung: eine kaputte Datei darf nicht als
// halbgueltiges Dokument durchrutschen und spaeter beim argv-Bau explodieren.
import { readFileSync, writeFileSync, statSync } from 'node:fs';

export const DEFAULT_PATH = 'scripts/llm/loadouts.json';

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const LOADOUT_KEYS = new Set([
  'slug', 'label', 'model', 'port', 'fit', 'args', 'speculative', 'mcp', 'extraArgs', 'notes', 'exclusiveGroup',
]);
const ARG_KEYS = new Set([
  'ctx', 'ngl', 'parallel', 'cacheTypeK', 'cacheTypeV', 'loadMode',
  'flashAttention', 'jinja', 'metrics', 'reasoning', 'reasoningBudget',
  // T002426: laesst llama-server selbst zum MCP-Server verbinden statt den
  // Browser aus der Web-UI heraus — ohne das Flag scheitert ein lokaler
  // MCP-Server ohne CORS-Header.
  'uiMcpProxy',
  'mmprojPath',
]);
const LOAD_MODES = new Set(['none', 'mmap', 'mlock', 'mmap+mlock', 'dio']);

function fail(msg) { throw new Error(`loadouts.json: ${msg}`); }

function validateLoadout(l, index, seen) {
  if (typeof l !== 'object' || l === null) fail(`loadouts[${index}] ist kein Objekt`);
  for (const k of Object.keys(l)) {
    if (!LOADOUT_KEYS.has(k)) fail(`loadouts[${index}]: unbekanntes Feld '${k}'`);
  }
  if (typeof l.slug !== 'string' || !SLUG_RE.test(l.slug)) {
    fail(`loadouts[${index}]: slug muss [a-z0-9-] sein, ist '${l.slug}'`);
  }
  if (seen.has(l.slug)) fail(`doppelter slug '${l.slug}'`);
  seen.add(l.slug);

  if (typeof l.model !== 'string' || !l.model) fail(`${l.slug}: model fehlt`);
  if (l.model.includes('..')) fail(`${l.slug}: model path darf kein '..' enthalten`);
  if (l.args && l.args.mmprojPath != null) {
    if (typeof l.args.mmprojPath !== 'string' || l.args.mmprojPath === '' || l.args.mmprojPath.includes('..')) {
      fail(`${l.slug}: mmprojPath muss ein nicht-leerer String sein ohne '..'`);
    }
  }
  if (!Number.isInteger(l.port) || l.port < 1024 || l.port > 65535) {
    fail(`${l.slug}: port muss ganzzahlig zwischen 1024 und 65535 sein`);
  }

  const fit = l.fit ?? {};
  if (typeof fit.enabled !== 'boolean') fail(`${l.slug}: fit.enabled fehlt`);

  const args = l.args ?? {};
  for (const k of Object.keys(args)) {
    if (!ARG_KEYS.has(k)) fail(`${l.slug}: unbekanntes args-Feld '${k}'`);
  }
  if (args.loadMode != null && !LOAD_MODES.has(args.loadMode)) {
    fail(`${l.slug}: loadMode '${args.loadMode}' unbekannt (${[...LOAD_MODES].join('|')})`);
  }

  // Ohne --fit bedeutet ein ungesetztes -c den llama.cpp-Default 0 ("aus dem
  // Modell laden"), was bei grossem deklariertem Kontext sofort ins OOM laeuft.
  // Wer --fit abschaltet, muss ctx UND ngl selbst setzen.
  if (fit.enabled === false && (args.ctx == null || args.ngl == null)) {
    fail(`${l.slug}: fit.enabled=false verlangt gesetzte args.ctx und args.ngl`);
  }

  if (l.extraArgs != null && !Array.isArray(l.extraArgs)) fail(`${l.slug}: extraArgs muss ein Array sein`);
  return l;
}

/** @returns {object} validiertes Dokument */
export function parseLoadouts(text) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (err) {
    fail(`ungueltiges JSON — ${err.message}`);
  }
  if (doc.version !== 1) fail(`version muss 1 sein, ist ${doc.version}`);
  if (!Array.isArray(doc.modelRoots)) fail('modelRoots muss ein Array sein');
  if (!Array.isArray(doc.loadouts)) fail('loadouts muss ein Array sein');
  const seen = new Set();
  doc.loadouts.forEach((l, i) => validateLoadout(l, i, seen));
  return doc;
}

export function readLoadouts(path = DEFAULT_PATH) {
  const text = readFileSync(path, 'utf8');
  return { doc: parseLoadouts(text), mtimeMs: statSync(path).mtimeMs };
}

/** Schreibt nur, wenn die Datei seit dem Lesen unveraendert ist (verhindert,
 *  dass das UI eine Handbearbeitung ueberschreibt). */
export function writeLoadouts(doc, path = DEFAULT_PATH, expectedMtimeMs = null) {
  parseLoadouts(JSON.stringify(doc)); // fail-closed vor dem Schreiben
  if (expectedMtimeMs !== null) {
    const current = statSync(path).mtimeMs;
    if (current !== expectedMtimeMs) {
      throw new Error(`loadouts.json: extern geaendert (conflict) — erneut laden und Aenderung wiederholen`);
    }
  }
  writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
}

export function findLoadout(doc, slug) {
  return doc.loadouts.find((l) => l.slug === slug);
}

/**
 * Pure decision: may `model` be auto-started? No file/network I/O, no side effects.
 * `doc` and `activeSlugs` are already loaded by the caller (server.mjs).
 * @param {{doc: object, model: string, activeSlugs: string[]}} args
 * @returns {{action:'start', slug:string}
 *         | {action:'conflict', slug:string, conflictSlug:string, group:string}
 *         | {action:'none'}}
 */
export function planAutoStart({ doc, model, activeSlugs }) {
  if (typeof model !== 'string' || !model) return { action: 'none' };
  const loadout = findLoadout(doc, model);
  if (!loadout) return { action: 'none' };
  if (activeSlugs.includes(loadout.slug)) return { action: 'none' };
  const group = loadout.exclusiveGroup;
  if (group) {
    const conflict = doc.loadouts.find((l) => l.slug !== loadout.slug
      && l.exclusiveGroup === group && activeSlugs.includes(l.slug));
    if (conflict) return { action: 'conflict', slug: loadout.slug, conflictSlug: conflict.slug, group };
  }
  return { action: 'start', slug: loadout.slug };
}
