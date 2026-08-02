// scripts/llm-proxy/loadouts.mjs
// Der einzige Ort, der scripts/llm/loadouts.json schreiben SOLL — nicht der
// einzige, der es faktisch tut: die Datei wurde wiederholt mit fremden
// JSON-Werkzeugen umgeschrieben (#3640, #3617, #3613, #3569). Weil ein
// Kommentar das nicht verhindert, prueft `task llm:loadouts:check` die
// kanonische Form (serializeLoadouts) fail-closed in CI [T002553].
// Bewusst fail-closed bei der Validierung: eine kaputte Datei darf nicht als
// halbgueltiges Dokument durchrutschen und spaeter beim argv-Bau explodieren.
import { readFileSync, writeFileSync, statSync } from 'node:fs';

export const DEFAULT_PATH = 'scripts/llm/loadouts.json';

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const LOADOUT_KEYS = new Set([
  'slug', 'label', 'model', 'port', 'fit', 'args', 'speculative', 'mcp', 'extraArgs', 'notes', 'exclusiveGroup',
  // T002538: Umgebungsvariablen fuer die systemd-Unit. Gebraucht fuer
  // CUDA_VISIBLE_DEVICES='' bei den CPU-gebundenen bge-Servern — '-ngl 0'
  // verhindert nur das Auslagern der Layer, NICHT die Allokation eines
  // CUDA-Kontexts (gemessen rund 600 MB je Prozess).
  'env',
  // T002544: Vorschalten einer versionierten ui-config-file fuer llama.cpp WebUI
  'uiConfigFile',
  // T002550: eingebaute llama-Tools (--tools), Werte siehe TOOL_NAMES
  'tools',
]);
// T002550 — Namen aus `llama-server --help` (b10223). llama.cpp akzeptiert
// zusaetzlich das Sammelwort 'all'; hier ist es bewusst NICHT gueltig.
//
// llama.cpp kennt weder Sandbox noch Wurzelverzeichnis-Beschraenkung: mit
// exec_shell_command laeuft eine Shell mit den Rechten der Unit ueber das
// gesamte Benutzerverzeichnis — ~/.ssh, ~/.config und die git-crypt-
// entschluesselten Secrets im Repo eingeschlossen. Genau diese Faehigkeit darf
// sich nicht hinter einem Wort verstecken, das nach Bequemlichkeit aussieht;
// sie gehoert namentlich dorthin, wo sie erteilt wird. Ein spaeter
// hinzugefuegtes llama-Tool erweitert 'all' still — die Allowlist nicht.
const TOOL_NAMES = new Set([
  'read_file', 'file_glob_search', 'grep_search',
  'exec_shell_command', 'write_file', 'edit_file', 'get_datetime',
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

  // T002550: Kommaliste aus TOOL_NAMES. 'all' wird eigens abgefangen, weil es
  // fuer llama.cpp gueltig ist — die Fehlermeldung muss deshalb erklaeren,
  // warum wir es trotzdem ablehnen, sonst liest sie sich wie ein Tippfehler.
  if (l.tools != null) {
    if (typeof l.tools !== 'string' || l.tools === '') {
      fail(`${l.slug}: tools muss ein nicht-leerer String sein`);
    }
    if (l.tools === 'all') {
      fail(`${l.slug}: tools='all' ist hier nicht erlaubt — die Tools namentlich auflisten (${[...TOOL_NAMES].join(',')})`);
    }
    for (const t of l.tools.split(',')) {
      if (!TOOL_NAMES.has(t.trim())) fail(`${l.slug}: unbekanntes tool '${t.trim()}'`);
    }
  }

  // env: flaches Objekt String -> String. Der Wert DARF leer sein — genau das
  // ist der Anwendungsfall (CUDA_VISIBLE_DEVICES=''). Der Name muss dem
  // POSIX-Muster folgen; ein '=' darin wuerde die systemd-Property zerlegen.
  if (l.env != null) {
    if (typeof l.env !== 'object' || Array.isArray(l.env)) {
      fail(`${l.slug}: env muss ein Objekt sein`);
    }
    for (const [k, v] of Object.entries(l.env)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) fail(`${l.slug}: env-Name '${k}' ist kein gueltiger Variablenname`);
      if (typeof v !== 'string') fail(`${l.slug}: env['${k}'] muss ein String sein`);
      if (v.includes('\n')) fail(`${l.slug}: env['${k}'] darf keinen Zeilenumbruch enthalten`);
    }
  }
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

/**
 * T002553 — Die EINE kanonische Serialisierung von loadouts.json.
 *
 * Sowohl writeLoadouts() als auch der Format-Guard (scripts/llm/loadouts-format.mjs)
 * gehen durch diese Funktion. Zwei getrennte Definitionen — eine im Schreiber, eine
 * im Pruefer — koennten auseinanderlaufen und der Guard wuerde eine Form verlangen,
 * die das Werkzeug gar nicht erzeugt.
 *
 * Verbindlich sind drei Eigenschaften, an denen fremde JSON-Werkzeuge scheitern:
 *   - zwei Leerzeichen Einrueckung
 *   - Nicht-ASCII UNESCAPED ('·', nicht '·'). Pythons json.dumps hat
 *     ensure_ascii=True als Default und escaped stillschweigend.
 *   - abschliessender Zeilenumbruch (json.dump schreibt keinen)
 *
 * Jede dieser Abweichungen normalisiert beim naechsten regulaeren Schreibvorgang
 * die GANZE Datei zurueck und erzeugt einen Vollzeilen-Diff — in PR #3640 waren es
 * ~360 statt ~15 Zeilen, die inhaltliche Aenderung war darin nicht mehr erkennbar.
 */
export function serializeLoadouts(doc) {
  return `${JSON.stringify(doc, null, 2)}\n`;
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
  writeFileSync(path, serializeLoadouts(doc), 'utf8');
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
