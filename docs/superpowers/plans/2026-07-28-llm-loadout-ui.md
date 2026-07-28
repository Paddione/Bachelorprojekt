---
title: LLM-Loadout-UI Implementation Plan
ticket_id: T002394
domains: [ops, infra]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# LLM-Loadout-UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Web-UI im bestehenden `llm-proxy`, das lokale GGUF-Modelle scannt, Startkonfigurationen ("Loadouts") in `scripts/llm/loadouts.json` speichert und WSL-native `llama-server`-Prozesse als transiente systemd-User-Units startet, stoppt und erneut startet.

**Architecture:** Vier neue Module in `scripts/llm-proxy/` nach dem vorhandenen Muster (`backends.mjs`, `discovery.mjs`, `fixups.mjs`): `loadouts.mjs` (Datei-I/O + Validierung), `models.mjs` (GGUF-Scan), `runner.mjs` (argv-Bau + systemd), `ui/index.html` (eine statische Seite). `server.mjs` bekommt nur Routen und verdrahtet die Module.

**Tech Stack:** Node ESM (`.mjs`), keine neuen Abhängigkeiten, `node:test` + `node:assert/strict`, `systemd-run --user`, llama.cpp b10155.

**Spec:** `docs/superpowers/specs/2026-07-28-llm-loadout-ui-design.md` · **Ticket:** T002394

## Global Constraints

- **Keine neuen npm-Abhängigkeiten.** Alle vier Module nutzen ausschließlich Node-Builtins. Das Repo-Muster (`backends.mjs`, `discovery.mjs`, `fixups.mjs`) ist dependency-frei.
- **Dateiendung `.mjs`, ESM-Imports.** Tests heißen `<modul>.test.mjs` und werden von `task test:llm-proxy` (`node --test scripts/llm-proxy/*.test.mjs`) automatisch erfasst — kein Taskfile-Eintrag nötig.
- **Kommentare auf Deutsch, Bezeichner auf Englisch.** Entspricht dem Bestand in `scripts/llm-proxy/`.
- **`-c` und `-ngl` werden NIE gesetzt, außer der Nutzer pinnt sie explizit.** `--fit` steht in b10155 per Default auf `on` und passt nur *ungesetzte* Argumente an. Gemessen 2026-07-28: handgesetzt `-ngl 19 -c 65536` → 30,9 tok/s; ungesetzt mit `-fitt 2400` → 158–166 tok/s bei 105.472 statt 65.536 Kontext.
- **Fehler in `/admin/*` dürfen `/v1/*` nie beeinträchtigen.** Der Proxy liegt auf dem kritischen Pfad der Factory. `loadouts.mjs` wird lazy geladen, Fehler bleiben lokal.
- **`systemd-run` immer mit `--user` und `--collect`.** Ohne `--collect` bleiben fehlgeschlagene transiente Units im Zustand `failed` und blockieren den Unit-Namen.
- **Testframework:** `import { test } from 'node:test'` + `import assert from 'node:assert/strict'`. Keine Semikolons in Testdateien (Bestandsstil `server.test.mjs`), Semikolons im Produktivcode (Bestandsstil `server.mjs`).

## File Structure

| Datei | Verantwortung |
|---|---|
| `scripts/llm/loadouts.json` | Die Registry. Einzige Quelle für Loadout-Definitionen. |
| `scripts/llm-proxy/loadouts.mjs` | Datei lesen, validieren, schreiben. Einziger Ort, der `loadouts.json` anfasst. |
| `scripts/llm-proxy/loadouts.test.mjs` | Validierungs- und Round-Trip-Tests. |
| `scripts/llm-proxy/models.mjs` | GGUF-Header parsen, `modelRoots` scannen. Einziger Ort, der GGUF versteht. |
| `scripts/llm-proxy/models.test.mjs` | Parser-Tests gegen synthetische GGUF-Bytes. |
| `scripts/llm-proxy/runner.mjs` | argv bauen, systemd-Units starten/stoppen/abfragen. Einziger Ort, der Prozesse anfasst. |
| `scripts/llm-proxy/runner.test.mjs` | argv-Konstruktion (rein, ohne Prozessstart). |
| `scripts/llm-proxy/ui/index.html` | Eine Seite, kein Build-Schritt, kein Framework. |
| `scripts/llm-proxy/server.mjs` | **Modifizieren:** neue Routen, Verdrahtung. |
| `tests/spec/local-llm-proxy.bats` | **Modifizieren:** BATS-Guard für die ausgelieferte Registry. |

## Tasks

---

### Task 1: `loadouts.mjs` — Registry lesen, validieren, schreiben

**Files:**
- Create: `scripts/llm-proxy/loadouts.mjs`
- Test: `scripts/llm-proxy/loadouts.test.mjs`

**Interfaces:**
- Consumes: nichts (erste Task)
- Produces:
  - `parseLoadouts(text: string): Doc` — wirft `Error` mit Klartext bei ungültigem Inhalt
  - `readLoadouts(path?: string): { doc: Doc, mtimeMs: number }`
  - `writeLoadouts(doc: Doc, path: string, expectedMtimeMs: number|null): void` — wirft bei mtime-Konflikt
  - `findLoadout(doc: Doc, slug: string): Loadout|undefined`
  - `DEFAULT_PATH: string`
  - `Doc = { version: 1, modelRoots: string[], defaults: { host: string }, loadouts: Loadout[] }`
  - `Loadout = { slug, label, model, port, fit: { enabled, targetMarginMib, minCtx }, args: {...}, speculative: {...}, mcp: {...}, extraArgs: string[], notes?: string }`

- [ ] **Step 1: Write the failing test**

Create `scripts/llm-proxy/loadouts.test.mjs`:

```javascript
// scripts/llm-proxy/loadouts.test.mjs
// Reine Validierungs- und Round-Trip-Tests. Kein Dateisystem ausser tmpdir.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseLoadouts, readLoadouts, writeLoadouts, findLoadout } from './loadouts.mjs'

const valid = {
  version: 1,
  modelRoots: ['~/models/gguf'],
  defaults: { host: '0.0.0.0' },
  loadouts: [{
    slug: 'gptoss-context',
    label: 'gpt-oss-20b',
    model: 'gptoss20/gpt-oss-20b-Q8_0.gguf',
    port: 8098,
    fit: { enabled: true, targetMarginMib: 2400, minCtx: 32768 },
    args: { ctx: null, ngl: null, parallel: 1, cacheTypeK: 'q8_0', cacheTypeV: 'q8_0',
            loadMode: 'mmap', flashAttention: true, jinja: true, metrics: true,
            reasoning: 'auto', reasoningBudget: null },
    speculative: { draftHfRepo: null, draftNgl: null },
    mcp: { serversConfig: null },
    extraArgs: [],
  }],
}

test('parseLoadouts: gueltiges Dokument kommt unveraendert zurueck', () => {
  const doc = parseLoadouts(JSON.stringify(valid))
  assert.equal(doc.loadouts.length, 1)
  assert.equal(doc.loadouts[0].slug, 'gptoss-context')
})

test('parseLoadouts: ctx null bleibt null und wird NICHT zu 0', () => {
  const doc = parseLoadouts(JSON.stringify(valid))
  assert.equal(doc.loadouts[0].args.ctx, null)
  assert.notEqual(doc.loadouts[0].args.ctx, 0)
})

test('parseLoadouts: doppelter Slug wird abgelehnt', () => {
  const bad = structuredClone(valid)
  bad.loadouts.push(structuredClone(valid.loadouts[0]))
  assert.throws(() => parseLoadouts(JSON.stringify(bad)), /slug.*gptoss-context/i)
})

test('parseLoadouts: fit.enabled=false ohne ctx wird abgelehnt', () => {
  const bad = structuredClone(valid)
  bad.loadouts[0].fit.enabled = false
  assert.throws(() => parseLoadouts(JSON.stringify(bad)), /fit/i)
})

test('parseLoadouts: fit.enabled=false mit ctx und ngl ist gueltig', () => {
  const ok = structuredClone(valid)
  ok.loadouts[0].fit.enabled = false
  ok.loadouts[0].args.ctx = 32768
  ok.loadouts[0].args.ngl = 24
  const doc = parseLoadouts(JSON.stringify(ok))
  assert.equal(doc.loadouts[0].args.ctx, 32768)
})

test('parseLoadouts: unbekanntes Feld im Loadout wird abgelehnt', () => {
  const bad = structuredClone(valid)
  bad.loadouts[0].bogusField = 1
  assert.throws(() => parseLoadouts(JSON.stringify(bad)), /bogusField/)
})

test('parseLoadouts: ungueltiger Slug wird abgelehnt', () => {
  const bad = structuredClone(valid)
  bad.loadouts[0].slug = 'Bad Slug!'
  assert.throws(() => parseLoadouts(JSON.stringify(bad)), /slug/i)
})

test('parseLoadouts: kaputtes JSON meldet Klartext', () => {
  assert.throws(() => parseLoadouts('{ nope'), /JSON/i)
})

test('Round-Trip lesen -> schreiben -> lesen ist idempotent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'loadouts-'))
  const p = join(dir, 'loadouts.json')
  writeFileSync(p, JSON.stringify(valid, null, 2))
  const first = readLoadouts(p)
  writeLoadouts(first.doc, p, first.mtimeMs)
  const second = readLoadouts(p)
  assert.deepEqual(second.doc, first.doc)
})

test('writeLoadouts: mtime-Konflikt wird abgelehnt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'loadouts-'))
  const p = join(dir, 'loadouts.json')
  writeFileSync(p, JSON.stringify(valid, null, 2))
  const { doc } = readLoadouts(p)
  assert.throws(() => writeLoadouts(doc, p, 1), /geaendert|conflict/i)
})

test('findLoadout findet per Slug und liefert undefined sonst', () => {
  const doc = parseLoadouts(JSON.stringify(valid))
  assert.equal(findLoadout(doc, 'gptoss-context').port, 8098)
  assert.equal(findLoadout(doc, 'ghost'), undefined)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/llm-proxy/loadouts.test.mjs`
Expected: FAIL mit `Cannot find module './loadouts.mjs'`

- [ ] **Step 3: Write minimal implementation**

Create `scripts/llm-proxy/loadouts.mjs`:

```javascript
// scripts/llm-proxy/loadouts.mjs
// Einziger Ort, der scripts/llm/loadouts.json liest und schreibt.
// Bewusst fail-closed bei der Validierung: eine kaputte Datei darf nicht als
// halbgueltiges Dokument durchrutschen und spaeter beim argv-Bau explodieren.
import { readFileSync, writeFileSync, statSync } from 'node:fs';

export const DEFAULT_PATH = 'scripts/llm/loadouts.json';

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const LOADOUT_KEYS = new Set([
  'slug', 'label', 'model', 'port', 'fit', 'args', 'speculative', 'mcp', 'extraArgs', 'notes',
]);
const ARG_KEYS = new Set([
  'ctx', 'ngl', 'parallel', 'cacheTypeK', 'cacheTypeV', 'loadMode',
  'flashAttention', 'jinja', 'metrics', 'reasoning', 'reasoningBudget',
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/llm-proxy/loadouts.test.mjs`
Expected: PASS, 11 Tests

- [ ] **Step 5: Commit**

```bash
git add scripts/llm-proxy/loadouts.mjs scripts/llm-proxy/loadouts.test.mjs
git commit -m "feat(llm-proxy): Loadout-Registry lesen, validieren, schreiben [T002394]"
```

---

### Task 2: `models.mjs` — GGUF-Header lesen und Modelle scannen

**Files:**
- Create: `scripts/llm-proxy/models.mjs`
- Test: `scripts/llm-proxy/models.test.mjs`

**Interfaces:**
- Consumes: nichts
- Produces:
  - `readGgufMetadata(path: string): { architecture: string|null, blockCount: number|null }`
  - `expandRoot(root: string): string` — löst führendes `~` auf
  - `quantFromFilename(name: string): string|null`
  - `scanModels(roots: string[], readMeta?: fn): Array<{ root, relPath, absPath, sizeBytes, quant, architecture, blockCount }>`

- [ ] **Step 1: Write the failing test**

Create `scripts/llm-proxy/models.test.mjs`:

```javascript
// scripts/llm-proxy/models.test.mjs
// Der GGUF-Parser wird gegen synthetisch erzeugte Header-Bytes geprueft --
// kein 12-GB-Modell noetig, laeuft in CI.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readGgufMetadata, quantFromFilename, scanModels, expandRoot } from './models.mjs'

// Baut einen minimalen GGUF-Header mit zwei KV-Paaren.
function buildGguf({ arch = 'llama', blockCount = 24 } = {}) {
  const parts = []
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b }
  const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b }
  const str = (s) => Buffer.concat([u64(Buffer.byteLength(s)), Buffer.from(s, 'utf8')])
  parts.push(Buffer.from('GGUF', 'ascii'), u32(3), u64(0), u64(2))
  parts.push(str('general.architecture'), u32(8), str(arch))          // 8 = STRING
  parts.push(str(`${arch}.block_count`), u32(4), u32(blockCount))     // 4 = U32
  return Buffer.concat(parts)
}

test('readGgufMetadata liest architecture und block_count', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gguf-'))
  const p = join(dir, 'model-Q8_0.gguf')
  writeFileSync(p, buildGguf({ arch: 'gptoss', blockCount: 24 }))
  const meta = readGgufMetadata(p)
  assert.equal(meta.architecture, 'gptoss')
  assert.equal(meta.blockCount, 24)
})

test('readGgufMetadata: Nicht-GGUF-Datei liefert null-Felder statt zu werfen', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gguf-'))
  const p = join(dir, 'notamodel.gguf')
  writeFileSync(p, Buffer.from('HELLO WORLD', 'ascii'))
  const meta = readGgufMetadata(p)
  assert.equal(meta.architecture, null)
  assert.equal(meta.blockCount, null)
})

test('readGgufMetadata: abgeschnittene Datei liefert null-Felder statt zu werfen', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gguf-'))
  const p = join(dir, 'truncated.gguf')
  writeFileSync(p, buildGguf().subarray(0, 20))
  const meta = readGgufMetadata(p)
  assert.equal(meta.blockCount, null)
})

test('quantFromFilename erkennt K-Quants und I-Quants', () => {
  assert.equal(quantFromFilename('gpt-oss-20b-Q8_0.gguf'), 'Q8_0')
  assert.equal(quantFromFilename('Devstral-Small-2-24B-Instruct-2512-IQ4_XS.gguf'), 'IQ4_XS')
  assert.equal(quantFromFilename('Qwopus3.5-9B-Coder-MTP-Q6_K.gguf'), 'Q6_K')
  assert.equal(quantFromFilename('model-UD-Q4_K_XL.gguf'), 'UD-Q4_K_XL')
  assert.equal(quantFromFilename('mmproj-F32.gguf'), 'F32')
  assert.equal(quantFromFilename('random.gguf'), null)
})

test('expandRoot loest fuehrendes ~ auf', () => {
  assert.equal(expandRoot('~/models').startsWith('~'), false)
  assert.equal(expandRoot('/abs/path'), '/abs/path')
})

test('scanModels findet gguf rekursiv und ueberspringt .cache', () => {
  const dir = mkdtempSync(join(tmpdir(), 'roots-'))
  mkdirSync(join(dir, 'sub'), { recursive: true })
  mkdirSync(join(dir, '.cache', 'huggingface'), { recursive: true })
  writeFileSync(join(dir, 'sub', 'a-Q8_0.gguf'), buildGguf({ blockCount: 12 }))
  writeFileSync(join(dir, '.cache', 'huggingface', 'b-Q4_K_M.gguf'), buildGguf())
  writeFileSync(join(dir, 'notes.txt'), 'ignore me')

  const found = scanModels([dir])
  assert.equal(found.length, 1)
  assert.equal(found[0].relPath, 'sub/a-Q8_0.gguf')
  assert.equal(found[0].quant, 'Q8_0')
  assert.equal(found[0].blockCount, 12)
  assert.ok(found[0].sizeBytes > 0)
})

test('scanModels ignoriert nicht existierende Wurzeln, statt zu werfen', () => {
  assert.deepEqual(scanModels(['/definitely/not/here']), [])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/llm-proxy/models.test.mjs`
Expected: FAIL mit `Cannot find module './models.mjs'`

- [ ] **Step 3: Write minimal implementation**

Create `scripts/llm-proxy/models.mjs`:

```javascript
// scripts/llm-proxy/models.mjs
// Einziger Ort, der das GGUF-Format kennt. Liest nur den Header (die Metadaten
// stehen ganz vorne) -- funktioniert deshalb auch auf einer noch unvollstaendig
// heruntergeladenen Datei und laedt nie 12 GB in den Speicher.
import { openSync, readSync, closeSync, statSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { homedir } from 'node:os';

// GGUF-Werttypen laut Spezifikation.
const T_STRING = 8;
const T_ARRAY = 9;
const FIXED = {
  0: ['readUInt8', 1], 1: ['readInt8', 1], 2: ['readUInt16LE', 2], 3: ['readInt16LE', 2],
  4: ['readUInt32LE', 4], 5: ['readInt32LE', 4], 6: ['readFloatLE', 4], 7: ['readUInt8', 1],
  10: ['readBigUInt64LE', 8], 11: ['readBigInt64LE', 8], 12: ['readDoubleLE', 8],
};

class HeaderReader {
  constructor(fd) { this.fd = fd; this.pos = 0; }
  read(n) {
    const buf = Buffer.alloc(n);
    const got = readSync(this.fd, buf, 0, n, this.pos);
    if (got < n) throw new Error('EOF');
    this.pos += n;
    return buf;
  }
  u32() { return this.read(4).readUInt32LE(0); }
  u64() { return Number(this.read(8).readBigUInt64LE(0)); }
  str() { return this.read(this.u64()).toString('utf8'); }
  value(type) {
    if (type === T_STRING) return this.str();
    if (type === T_ARRAY) {
      const elemType = this.u32();
      const count = this.u64();
      const out = [];
      for (let i = 0; i < count; i++) out.push(this.value(elemType));
      return out;
    }
    const spec = FIXED[type];
    if (!spec) throw new Error(`unbekannter GGUF-Typ ${type}`);
    const [method, size] = spec;
    return Number(this.read(size)[method](0));
  }
}

/** Liest Architektur und Layer-Zahl. Wirft NICHT — unlesbare Dateien liefern
 *  null-Felder, damit ein einzelnes kaputtes File den Scan nicht abbricht. */
export function readGgufMetadata(path) {
  let fd;
  const out = { architecture: null, blockCount: null };
  try {
    fd = openSync(path, 'r');
    const r = new HeaderReader(fd);
    if (r.read(4).toString('ascii') !== 'GGUF') return out;
    r.u32();            // version
    r.u64();            // tensor_count
    const kvCount = r.u64();
    for (let i = 0; i < kvCount; i++) {
      const key = r.str();
      const val = r.value(r.u32());
      if (key === 'general.architecture') out.architecture = String(val);
      else if (key.endsWith('.block_count')) out.blockCount = Number(val);
      if (out.architecture !== null && out.blockCount !== null) break;
    }
  } catch {
    // absichtlich still: abgeschnitten, kein GGUF, keine Rechte
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  return out;
}

// Quant steht verlaesslich im Dateinamen; die Tensor-Typen dafuer zu lesen waere
// deutlich teurer und beantwortet dieselbe Frage.
const QUANT_RE = /(?:^|[-_.])((?:UD-)?(?:IQ|Q)\d+(?:_[A-Z0-9]+)*|BF16|F16|F32|MXFP4)(?=\.gguf$|[-_.])/i;

export function quantFromFilename(name) {
  const m = name.match(QUANT_RE);
  return m ? m[1] : null;
}

export function expandRoot(root) {
  return root.startsWith('~') ? join(homedir(), root.slice(1)) : root;
}

function walk(dir, out) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    // .cache enthaelt die Zwischenablage von `hf download` -- teils unvollstaendige
    // Kopien derselben Modelle. Sie hier auszublenden verhindert Doppelanzeigen.
    if (e.isDirectory()) {
      if (e.name === '.cache' || e.name === 'node_modules') continue;
      walk(join(dir, e.name), out);
    } else if (e.isFile() && e.name.endsWith('.gguf')) {
      out.push(join(dir, e.name));
    }
  }
}

export function scanModels(roots, readMeta = readGgufMetadata) {
  const results = [];
  for (const root of roots) {
    const abs = expandRoot(root);
    if (!existsSync(abs)) continue;
    const files = [];
    walk(abs, files);
    for (const absPath of files) {
      const meta = readMeta(absPath);
      results.push({
        root,
        absPath,
        relPath: relative(abs, absPath).split('\\').join('/'),
        sizeBytes: statSync(absPath).size,
        quant: quantFromFilename(absPath.split('/').pop()),
        architecture: meta.architecture,
        blockCount: meta.blockCount,
      });
    }
  }
  return results.sort((a, b) => a.relPath.localeCompare(b.relPath));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/llm-proxy/models.test.mjs`
Expected: PASS, 7 Tests

- [ ] **Step 5: Gegenprobe an einer echten Datei**

Run:
```bash
node -e "import('./scripts/llm-proxy/models.mjs').then(m => console.log(m.readGgufMetadata(process.env.HOME + '/models/gguf/gptoss20/gpt-oss-20b-Q8_0.gguf')))"
```
Expected: `{ architecture: 'gpt-oss', blockCount: 24 }` (Architekturname kann abweichen; `blockCount` MUSS 24 sein — mit dem Python-Prototyp am 2026-07-28 verifiziert).

- [ ] **Step 6: Commit**

```bash
git add scripts/llm-proxy/models.mjs scripts/llm-proxy/models.test.mjs
git commit -m "feat(llm-proxy): GGUF-Header lesen und Modellverzeichnisse scannen [T002394]"
```

---

### Task 3: `runner.mjs` — argv bauen und systemd-Units steuern

**Files:**
- Create: `scripts/llm-proxy/runner.mjs`
- Test: `scripts/llm-proxy/runner.test.mjs`

**Interfaces:**
- Consumes: `Loadout` aus Task 1, `expandRoot` aus Task 2
- Produces:
  - `unitName(slug: string): string`
  - `buildServerArgv(loadout, modelPath: string, defaults: { host: string }): string[]`
  - `buildStartCommand(loadout, modelPath, defaults, binPath): string[]`
  - `startUnit(loadout, modelPath, defaults, binPath): void`
  - `stopUnit(slug): void`
  - `unitStatus(slug): { active: string, sub: string, exists: boolean }`
  - `recentLogs(slug, lines?): string`

- [ ] **Step 1: Write the failing test**

Create `scripts/llm-proxy/runner.test.mjs`:

```javascript
// scripts/llm-proxy/runner.test.mjs
// argv-Konstruktion ohne Prozessstart. Der wichtigste Test ist
// "null-Felder erscheinen NICHT in argv" -- er kodiert die --fit-Regel.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unitName, buildServerArgv, buildStartCommand } from './runner.mjs'

const base = {
  slug: 'gptoss-context',
  label: 'gpt-oss-20b',
  model: 'gptoss20/gpt-oss-20b-Q8_0.gguf',
  port: 8098,
  fit: { enabled: true, targetMarginMib: 2400, minCtx: 32768 },
  args: { ctx: null, ngl: null, parallel: 1, cacheTypeK: 'q8_0', cacheTypeV: 'q8_0',
          loadMode: 'mmap', flashAttention: true, jinja: true, metrics: true,
          reasoning: 'auto', reasoningBudget: null },
  speculative: { draftHfRepo: null, draftNgl: null },
  mcp: { serversConfig: null },
  extraArgs: [],
}
const defaults = { host: '0.0.0.0' }
const MODEL = '/home/u/models/gptoss20/gpt-oss-20b-Q8_0.gguf'

test('unitName folgt dem Slug', () => {
  assert.equal(unitName('gptoss-context'), 'llama-gptoss-context.service')
})

test('null-Felder erscheinen NICHT in argv (sonst ist --fit tot)', () => {
  const argv = buildServerArgv(base, MODEL, defaults)
  assert.equal(argv.includes('-c'), false, '-c darf nicht gesetzt sein')
  assert.equal(argv.includes('-ngl'), false, '-ngl darf nicht gesetzt sein')
  assert.equal(argv.includes('--reasoning-budget'), false)
  assert.equal(argv.includes('--spec-draft-hf'), false)
  assert.equal(argv.includes('--mcp-servers-config'), false)
})

test('fit erzeugt -fit/-fitt/-fitc', () => {
  const argv = buildServerArgv(base, MODEL, defaults)
  assert.deepEqual(argv.slice(argv.indexOf('-fit'), argv.indexOf('-fit') + 6),
    ['-fit', 'on', '-fitt', '2400', '-fitc', '32768'])
})

test('gepinnter ctx erscheint als -c', () => {
  const pinned = structuredClone(base)
  pinned.args.ctx = 65536
  const argv = buildServerArgv(pinned, MODEL, defaults)
  assert.equal(argv[argv.indexOf('-c') + 1], '65536')
})

test('flags werden gesetzt bzw. weggelassen', () => {
  const argv = buildServerArgv(base, MODEL, defaults)
  assert.ok(argv.includes('--jinja'))
  assert.ok(argv.includes('--metrics'))
  assert.deepEqual(argv.slice(argv.indexOf('-fa'), argv.indexOf('-fa') + 2), ['-fa', 'on'])
  const off = structuredClone(base)
  off.args.jinja = false
  off.args.flashAttention = false
  const argv2 = buildServerArgv(off, MODEL, defaults)
  assert.equal(argv2.includes('--jinja'), false)
  assert.equal(argv2.includes('-fa'), false)
})

test('alias ist der Slug — damit ist das Loadout unter seinem Namen anfragbar', () => {
  const argv = buildServerArgv(base, MODEL, defaults)
  assert.equal(argv[argv.indexOf('--alias') + 1], 'gptoss-context')
})

test('extraArgs stehen am Ende', () => {
  const withExtra = structuredClone(base)
  withExtra.extraArgs = ['--n-cpu-moe', '24']
  const argv = buildServerArgv(withExtra, MODEL, defaults)
  assert.deepEqual(argv.slice(-2), ['--n-cpu-moe', '24'])
})

test('fit.enabled=false erzeugt -fit off und die gepinnten Werte', () => {
  const noFit = structuredClone(base)
  noFit.fit.enabled = false
  noFit.args.ctx = 32768
  noFit.args.ngl = 24
  const argv = buildServerArgv(noFit, MODEL, defaults)
  assert.deepEqual(argv.slice(argv.indexOf('-fit'), argv.indexOf('-fit') + 2), ['-fit', 'off'])
  assert.equal(argv.includes('-fitt'), false)
  assert.equal(argv[argv.indexOf('-c') + 1], '32768')
  assert.equal(argv[argv.indexOf('-ngl') + 1], '24')
})

test('speculative und mcp erscheinen, wenn gesetzt', () => {
  const spec = structuredClone(base)
  spec.speculative = { draftHfRepo: 'org/draft:Q4_K_M', draftNgl: 8 }
  spec.mcp = { serversConfig: '/etc/mcp.json' }
  const argv = buildServerArgv(spec, MODEL, defaults)
  assert.equal(argv[argv.indexOf('--spec-draft-hf') + 1], 'org/draft:Q4_K_M')
  assert.equal(argv[argv.indexOf('-ngld') + 1], '8')
  assert.equal(argv[argv.indexOf('--mcp-servers-config') + 1], '/etc/mcp.json')
})

test('buildStartCommand kapselt systemd-run mit --user und --collect', () => {
  const cmd = buildStartCommand(base, MODEL, defaults, '/opt/llama/bin/llama-server')
  assert.equal(cmd[0], 'systemd-run')
  assert.ok(cmd.includes('--user'))
  assert.ok(cmd.includes('--collect'))
  assert.ok(cmd.includes('--unit=llama-gptoss-context.service'))
  const sep = cmd.indexOf('--')
  assert.equal(cmd[sep + 1], '/opt/llama/bin/llama-server')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/llm-proxy/runner.test.mjs`
Expected: FAIL mit `Cannot find module './runner.mjs'`

- [ ] **Step 3: Write minimal implementation**

Create `scripts/llm-proxy/runner.mjs`:

```javascript
// scripts/llm-proxy/runner.mjs
// Einziger Ort, der Prozesse anfasst. Die argv-Konstruktion ist bewusst als
// reine Funktion herausgezogen, damit sie ohne GPU getestet werden kann.
//
// WARUM null-Felder WEGGELASSEN werden (gemessen 2026-07-28):
//   llama.cpp b10155 hat --fit per Default auf 'on' und passt nur UNGESETZTE
//   Argumente an das freie VRAM an. Ein serialisiertes `-c 0` waere ein GESETZTES
//   Argument und schaltet die Anpassung ab. Handgesetzt -ngl 19 -c 65536 lieferte
//   30,9 tok/s decode; ungesetzt mit -fitt 2400 waren es 158-166 tok/s bei
//   105.472 statt 65.536 Kontext.
import { execFileSync } from 'node:child_process';

export function unitName(slug) { return `llama-${slug}.service`; }

/** @returns {string[]} argv fuer llama-server, OHNE das Binary selbst */
export function buildServerArgv(loadout, modelPath, defaults) {
  const a = loadout.args ?? {};
  const argv = ['-m', modelPath, '--host', defaults.host, '--port', String(loadout.port)];

  if (loadout.fit?.enabled) {
    argv.push('-fit', 'on');
    if (loadout.fit.targetMarginMib != null) argv.push('-fitt', String(loadout.fit.targetMarginMib));
    if (loadout.fit.minCtx != null) argv.push('-fitc', String(loadout.fit.minCtx));
  } else {
    argv.push('-fit', 'off');
  }

  // Nur was NICHT null ist, wird gesetzt.
  if (a.ctx != null) argv.push('-c', String(a.ctx));
  if (a.ngl != null) argv.push('-ngl', String(a.ngl));
  if (a.parallel != null) argv.push('-np', String(a.parallel));
  if (a.cacheTypeK != null) argv.push('-ctk', a.cacheTypeK);
  if (a.cacheTypeV != null) argv.push('-ctv', a.cacheTypeV);
  if (a.loadMode != null) argv.push('-lm', a.loadMode);
  if (a.flashAttention) argv.push('-fa', 'on');
  if (a.jinja) argv.push('--jinja');
  if (a.metrics) argv.push('--metrics');
  if (a.reasoning != null) argv.push('-rea', a.reasoning);
  if (a.reasoningBudget != null) argv.push('--reasoning-budget', String(a.reasoningBudget));

  const s = loadout.speculative ?? {};
  if (s.draftHfRepo != null) argv.push('--spec-draft-hf', s.draftHfRepo);
  if (s.draftNgl != null) argv.push('-ngld', String(s.draftNgl));

  if (loadout.mcp?.serversConfig != null) argv.push('--mcp-servers-config', loadout.mcp.serversConfig);

  // Der Alias ist der Slug: damit taucht das Loadout unter seinem eigenen Namen
  // in /v1/models auf und ist ohne Zuordnungstabelle anfragbar.
  argv.push('--alias', loadout.slug);

  return argv.concat(loadout.extraArgs ?? []);
}

export function buildStartCommand(loadout, modelPath, defaults, binPath) {
  return [
    'systemd-run', '--user',
    `--unit=${unitName(loadout.slug)}`,
    // --collect: ohne das Flag bleibt eine fehlgeschlagene transiente Unit im
    // Zustand 'failed' stehen und blockiert den Unit-Namen -- der naechste
    // Startversuch scheitert dann mit "unit already exists", obwohl nichts laeuft.
    '--collect',
    `--description=llama.cpp loadout ${loadout.slug}`,
    '--',
    binPath,
    ...buildServerArgv(loadout, modelPath, defaults),
  ];
}

export function startUnit(loadout, modelPath, defaults, binPath) {
  const [cmd, ...args] = buildStartCommand(loadout, modelPath, defaults, binPath);
  execFileSync(cmd, args, { encoding: 'utf8', stdio: 'pipe' });
}

export function stopUnit(slug) {
  execFileSync('systemctl', ['--user', 'stop', unitName(slug)], { encoding: 'utf8', stdio: 'pipe' });
}

export function unitStatus(slug) {
  try {
    const out = execFileSync('systemctl',
      ['--user', 'show', unitName(slug), '--property=ActiveState,SubState,LoadState'],
      { encoding: 'utf8', stdio: 'pipe' });
    const kv = Object.fromEntries(out.trim().split('\n').map((l) => l.split('=')));
    return {
      exists: kv.LoadState !== 'not-found',
      active: kv.ActiveState ?? 'unknown',
      sub: kv.SubState ?? 'unknown',
    };
  } catch {
    return { exists: false, active: 'unknown', sub: 'unknown' };
  }
}

export function recentLogs(slug, lines = 30) {
  try {
    return execFileSync('journalctl',
      ['--user', '-u', unitName(slug), '-n', String(lines), '--no-pager'],
      { encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    return `journalctl nicht verfuegbar: ${err.message}`;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/llm-proxy/runner.test.mjs`
Expected: PASS, 10 Tests

- [ ] **Step 5: Commit**

```bash
git add scripts/llm-proxy/runner.mjs scripts/llm-proxy/runner.test.mjs
git commit -m "feat(llm-proxy): argv-Bau und systemd-Steuerung fuer Loadouts [T002394]"
```

---

### Task 4: `loadouts.json` anlegen und Routen in `server.mjs`

**Files:**
- Create: `scripts/llm/loadouts.json`
- Modify: `scripts/llm-proxy/server.mjs` (Imports oben, Routen im `createServer`-Block vor der 404-Zeile)

**Interfaces:**
- Consumes: alles aus Task 1–3
- Produces: HTTP-Routen `/admin/models`, `/admin/loadouts`, `/admin/loadouts/status`, `/admin/loadouts/<slug>/start`, `/admin/loadouts/<slug>/stop`

- [ ] **Step 1: Registry-Datei anlegen**

Create `scripts/llm/loadouts.json`:

```json
{
  "version": 1,
  "modelRoots": [
    "~/models/gguf",
    "/mnt/c/Users/PatrickKorczewski/.lmstudio/models"
  ],
  "defaults": { "host": "0.0.0.0" },
  "loadouts": [
    {
      "slug": "gptoss-context",
      "label": "gpt-oss-20b · maximaler Kontext",
      "model": "gptoss20/gpt-oss-20b-Q8_0.gguf",
      "port": 8098,
      "fit": { "enabled": true, "targetMarginMib": 2400, "minCtx": 32768 },
      "args": {
        "ctx": null, "ngl": null, "parallel": 1,
        "cacheTypeK": "q8_0", "cacheTypeV": "q8_0", "loadMode": "mmap",
        "flashAttention": true, "jinja": true, "metrics": true,
        "reasoning": "auto", "reasoningBudget": null
      },
      "speculative": { "draftHfRepo": null, "draftNgl": null },
      "mcp": { "serversConfig": null },
      "extraArgs": [],
      "notes": "MXFP4-nativ: alle Quants 11,5-12,1 GB, Q8_0 ist praktisch gratis. Gemessen 158-166 tok/s decode bei 105.472 Kontext."
    },
    {
      "slug": "devstral-quality",
      "label": "Devstral-Small-2 24B · Code-Qualitaet",
      "model": "devstral24/Devstral-Small-2-24B-Instruct-2512-IQ4_XS.gguf",
      "port": 8099,
      "fit": { "enabled": true, "targetMarginMib": 2400, "minCtx": 8192 },
      "args": {
        "ctx": null, "ngl": null, "parallel": 1,
        "cacheTypeK": null, "cacheTypeV": null, "loadMode": "mmap",
        "flashAttention": true, "jinja": true, "metrics": true,
        "reasoning": "auto", "reasoningBudget": null
      },
      "speculative": { "draftHfRepo": null, "draftNgl": null },
      "mcp": { "serversConfig": null },
      "extraArgs": [],
      "notes": "IQ4_XS (12,78 GB) statt Q4_K_M (14,33 GB): kleiner UND besser als Q4_K_S (13,55 GB). f16-KV fuer maximale Qualitaet."
    }
  ]
}
```

- [ ] **Step 2: Write the failing test**

Add to `scripts/llm-proxy/server.test.mjs` (am Dateiende anhängen):

```javascript

// --- Loadout-Registry: die ausgelieferte Datei muss gueltig sein -----------
import { parseLoadouts } from './loadouts.mjs'
import { readFileSync } from 'node:fs'

test('scripts/llm/loadouts.json ist gueltig und portkollisionsfrei', () => {
  const doc = parseLoadouts(readFileSync('scripts/llm/loadouts.json', 'utf8'))
  assert.ok(doc.loadouts.length > 0)
  const ports = doc.loadouts.map((l) => l.port)
  assert.equal(new Set(ports).size, ports.length, 'Ports muessen eindeutig sein')
})

test('kein ausgeliefertes Loadout pinnt ctx oder ngl', () => {
  const doc = parseLoadouts(readFileSync('scripts/llm/loadouts.json', 'utf8'))
  for (const l of doc.loadouts) {
    assert.equal(l.args.ctx, null, `${l.slug}: ctx darf nicht gepinnt sein`)
    assert.equal(l.args.ngl, null, `${l.slug}: ngl darf nicht gepinnt sein`)
  }
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test scripts/llm-proxy/server.test.mjs`
Expected: FAIL — falls `loadouts.json` noch fehlt: `ENOENT`; sonst PASS für diese beiden Tests, dann weiter.

- [ ] **Step 4: Routen in `server.mjs` ergänzen**

Imports oben ergänzen (nach der `fixups.mjs`-Zeile, aktuell Zeile 6):

```javascript
import { readFileSync } from 'node:fs';
import { readLoadouts, writeLoadouts, findLoadout, DEFAULT_PATH } from './loadouts.mjs';
import { scanModels, expandRoot } from './models.mjs';
import { unitName, startUnit, stopUnit, unitStatus, recentLogs } from './runner.mjs';
import { join } from 'node:path';
```

Konstanten nach `const POLL_MS = 30_000;` ergänzen:

```javascript
const LLAMA_BIN = process.env.LLAMA_SERVER_BIN
  || join(process.env.HOME, 'opt/llama-b10155-cuda13.3/bin/llama-server');
const HEALTH_TIMEOUT_MS = 240_000;
```

Hilfsfunktionen vor `const server = http.createServer` einfügen:

```javascript
// Loesst den Loadout-Modellpfad gegen die konfigurierten modelRoots auf.
function resolveModelPath(doc, loadout) {
  for (const root of doc.modelRoots) {
    const candidate = join(expandRoot(root), loadout.model);
    try { readFileSync(candidate, { flag: 'r', encoding: null, length: 0 }); return candidate; }
    catch { /* naechste Wurzel */ }
  }
  return null;
}

async function waitHealthy(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return true;
    } catch { /* noch nicht da */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

// Ein Server kann auf /health antworten und trotzdem unfaehig sein, ein
// tool_calls-Objekt zu erzeugen -- fuer tool-basiertes Coding wertlos.
async function smokeTestToolCall(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Read the file /etc/hostname using the available tool.' }],
        tools: [{ type: 'function', function: { name: 'read_file', description: 'Read a file from disk',
          parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } }],
        tool_choice: 'auto', max_tokens: 256,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const body = await r.json();
    return Array.isArray(body?.choices?.[0]?.message?.tool_calls);
  } catch { return false; }
}

async function chosenSettings(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/props`, { signal: AbortSignal.timeout(5000) });
    const p = await r.json();
    return { ctx: p?.default_generation_settings?.n_ctx ?? null };
  } catch { return { ctx: null }; }
}

function portInUse(doc, port, exceptSlug) {
  return doc.loadouts.some((l) => l.port === port && l.slug !== exceptSlug
    && unitStatus(l.slug).active === 'active');
}
```

Routen vor `if (path.startsWith('/v1/') && method === 'POST')` einfügen:

```javascript
    // --- Loadout-Verwaltung -------------------------------------------------
    // Fehler bleiben bewusst auf /admin/* begrenzt: der Proxy liegt auf dem
    // kritischen Pfad der Factory, ein kaputtes loadouts.json darf /v1/* nie
    // beeintraechtigen. Deshalb wird die Datei bei JEDEM Aufruf frisch gelesen
    // und der Fehler lokal in 500 uebersetzt.
    if (path === '/admin/models' && method === 'GET') {
      try {
        const { doc } = readLoadouts(DEFAULT_PATH);
        return sendJson(res, 200, { models: scanModels(doc.modelRoots) });
      } catch (err) {
        return sendJson(res, 500, { error: { code: 'loadouts_invalid', message: err.message } });
      }
    }

    if (path === '/admin/loadouts' && method === 'GET') {
      try {
        const { doc, mtimeMs } = readLoadouts(DEFAULT_PATH);
        return sendJson(res, 200, { doc, mtimeMs });
      } catch (err) {
        return sendJson(res, 500, { error: { code: 'loadouts_invalid', message: err.message } });
      }
    }

    if (path === '/admin/loadouts' && method === 'PUT') {
      try {
        const body = await readBody(req);
        writeLoadouts(body.doc, DEFAULT_PATH, body.mtimeMs ?? null);
        const { mtimeMs } = readLoadouts(DEFAULT_PATH);
        return sendJson(res, 200, { saved: true, mtimeMs });
      } catch (err) {
        const conflict = /conflict|geaendert/i.test(err.message);
        return sendJson(res, conflict ? 409 : 400,
          { error: { code: conflict ? 'stale_write' : 'invalid', message: err.message } });
      }
    }

    if (path === '/admin/loadouts/status' && method === 'GET') {
      try {
        const { doc } = readLoadouts(DEFAULT_PATH);
        const status = await Promise.all(doc.loadouts.map(async (l) => {
          const u = unitStatus(l.slug);
          const running = u.active === 'active';
          return {
            slug: l.slug, unit: unitName(l.slug), port: l.port,
            active: u.active, sub: u.sub, running,
            chosen: running ? await chosenSettings(l.port) : null,
          };
        }));
        return sendJson(res, 200, { status });
      } catch (err) {
        return sendJson(res, 500, { error: { code: 'loadouts_invalid', message: err.message } });
      }
    }

    const startMatch = path.match(/^\/admin\/loadouts\/([a-z0-9-]+)\/start$/);
    if (startMatch && method === 'POST') {
      const slug = startMatch[1];
      try {
        const { doc } = readLoadouts(DEFAULT_PATH);
        const loadout = findLoadout(doc, slug);
        if (!loadout) return sendJson(res, 404, { error: { code: 'not_found', message: slug } });
        if (unitStatus(slug).active === 'active') {
          return sendJson(res, 409, { error: { code: 'already_running', message: `${slug} laeuft bereits` } });
        }
        if (portInUse(doc, loadout.port, slug)) {
          return sendJson(res, 409, { error: { code: 'port_busy', message: `Port ${loadout.port} belegt` } });
        }
        const modelPath = resolveModelPath(doc, loadout);
        if (!modelPath) {
          return sendJson(res, 422, { error: { code: 'model_missing', message: `${loadout.model} in keiner modelRoot gefunden` } });
        }

        startUnit(loadout, modelPath, doc.defaults, LLAMA_BIN);
        const healthy = await waitHealthy(loadout.port, HEALTH_TIMEOUT_MS);
        if (!healthy) {
          const logs = recentLogs(slug);
          try { stopUnit(slug); } catch { /* Unit war evtl. schon weg */ }
          return sendJson(res, 502, { error: { code: 'start_failed', message: 'Server wurde nicht gesund', logs } });
        }
        const chosen = await chosenSettings(loadout.port);
        const toolCallOk = await smokeTestToolCall(loadout.port);
        // Der eigentliche Gewinn davon, im Proxy zu sitzen: sofortige
        // Neuerkennung statt bis zu einem Poll-Intervall (30 s) Wartezeit.
        await discovery.probeNow();
        return sendJson(res, 201, {
          unit: unitName(slug), port: loadout.port, chosen, toolCallOk,
          warning: toolCallOk ? null : 'Kein tool_calls erzeugt — haeufigste Ursache: args.jinja ist false',
        });
      } catch (err) {
        return sendJson(res, 500, { error: { code: 'start_error', message: err.message } });
      }
    }

    const stopMatch = path.match(/^\/admin\/loadouts\/([a-z0-9-]+)\/stop$/);
    if (stopMatch && method === 'POST') {
      const slug = stopMatch[1];
      try {
        stopUnit(slug);
        await discovery.probeNow();
        return sendJson(res, 200, { stopped: slug });
      } catch (err) {
        return sendJson(res, 500, { error: { code: 'stop_error', message: err.message } });
      }
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `task test:llm-proxy`
Expected: PASS, alle Testdateien inkl. der neuen.

- [ ] **Step 6: Routen manuell gegen den laufenden Proxy prüfen**

Run:
```bash
systemctl --user restart llm-proxy.service
sleep 3
curl -s localhost:18235/admin/loadouts | head -c 300; echo
curl -s localhost:18235/admin/models | python3 -m json.tool | head -20
curl -s localhost:18235/admin/loadouts/status | python3 -m json.tool
```
Expected: `/admin/loadouts` liefert das Dokument, `/admin/models` listet die vorhandenen `.gguf` mit `blockCount`, `/admin/loadouts/status` zeigt beide Loadouts als `active: "inactive"`.

- [ ] **Step 7: Commit**

```bash
git add scripts/llm/loadouts.json scripts/llm-proxy/server.mjs scripts/llm-proxy/server.test.mjs
git commit -m "feat(llm-proxy): Loadout-Routen und ausgelieferte Registry [T002394]"
```

---

### Task 5: `ui/index.html` — die Seite

**Files:**
- Create: `scripts/llm-proxy/ui/index.html`
- Modify: `scripts/llm-proxy/server.mjs` (eine Route für `/admin`)

**Interfaces:**
- Consumes: die Routen aus Task 4
- Produces: nichts für andere Tasks

- [ ] **Step 1: Seite anlegen**

Create `scripts/llm-proxy/ui/index.html`:

```html
<!doctype html>
<meta charset="utf-8">
<title>LLM-Loadouts</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; margin: 2rem auto; max-width: 60rem; padding: 0 1rem; }
  h1 { font-size: 1.2rem; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; }
  th, td { text-align: left; padding: .4rem .6rem; border-bottom: 1px solid color-mix(in srgb, currentColor 20%, transparent); }
  th { font-weight: 600; opacity: .7; }
  .dot { display: inline-block; width: .6rem; height: .6rem; border-radius: 50%; background: #999; }
  .dot.on { background: #2ea043; }
  button { font: inherit; padding: .2rem .7rem; cursor: pointer; }
  button[disabled] { opacity: .4; cursor: default; }
  #msg { white-space: pre-wrap; padding: .6rem; border-left: 3px solid #888; margin-bottom: 1.5rem; display: none; }
  #msg.err { border-color: #d33; }
  details { margin-bottom: 2rem; }
  code { opacity: .75; }
</style>

<h1>LLM-Loadouts</h1>
<div id="msg"></div>

<table id="loadouts">
  <thead><tr><th></th><th>Loadout</th><th>Port</th><th>Kontext</th><th>Modell</th><th></th></tr></thead>
  <tbody></tbody>
</table>

<details>
  <summary>Gefundene Modelle</summary>
  <table id="models">
    <thead><tr><th>Datei</th><th>Quant</th><th>Layer</th><th>Groesse</th></tr></thead>
    <tbody></tbody>
  </table>
</details>

<script type="module">
const $ = (s) => document.querySelector(s)
const msg = (text, isErr = false) => {
  const el = $('#msg')
  el.textContent = text
  el.className = isErr ? 'err' : ''
  el.style.display = text ? 'block' : 'none'
}
const gb = (n) => `${(n / 1e9).toFixed(2)} GB`

async function api(path, opts) {
  const r = await fetch(path, opts)
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(body?.error?.message ?? `${r.status} ${path}`)
  return body
}

async function refresh() {
  try {
    const [{ doc }, { status }] = await Promise.all([
      api('/admin/loadouts'),
      api('/admin/loadouts/status'),
    ])
    const byslug = Object.fromEntries(status.map((s) => [s.slug, s]))
    $('#loadouts tbody').replaceChildren(...doc.loadouts.map((l) => {
      const st = byslug[l.slug] ?? {}
      const tr = document.createElement('tr')
      tr.innerHTML = `
        <td><span class="dot ${st.running ? 'on' : ''}"></span></td>
        <td>${l.label}<br><code>${l.slug}</code></td>
        <td>${l.port}</td>
        <td>${st.chosen?.ctx ?? '—'}</td>
        <td><code>${l.model}</code></td>
        <td></td>`
      const btn = document.createElement('button')
      btn.textContent = st.running ? 'stop' : 'start'
      btn.onclick = () => act(l.slug, st.running ? 'stop' : 'start', btn)
      tr.lastElementChild.append(btn)
      return tr
    }))
  } catch (err) { msg(err.message, true) }
}

async function loadModels() {
  try {
    const { models } = await api('/admin/models')
    $('#models tbody').replaceChildren(...models.map((m) => {
      const tr = document.createElement('tr')
      tr.innerHTML = `<td><code>${m.relPath}</code></td><td>${m.quant ?? '—'}</td>
                      <td>${m.blockCount ?? '—'}</td><td>${gb(m.sizeBytes)}</td>`
      return tr
    }))
  } catch (err) { msg(err.message, true) }
}

async function act(slug, verb, btn) {
  btn.disabled = true
  msg(verb === 'start' ? `Starte ${slug} — Modell laden dauert bis zu einer Minute…` : `Stoppe ${slug}…`)
  try {
    const r = await api(`/admin/loadouts/${slug}/${verb}`, { method: 'POST' })
    msg(verb === 'start'
      ? `${slug} laeuft. Kontext ${r.chosen?.ctx ?? '?'}, Tool-Call ${r.toolCallOk ? 'ok' : 'FEHLGESCHLAGEN'}.`
        + (r.warning ? `\n${r.warning}` : '')
      : `${slug} gestoppt.`)
  } catch (err) { msg(err.message, true) }
  btn.disabled = false
  refresh()
}

refresh()
loadModels()
setInterval(refresh, 5000)
</script>
```

- [ ] **Step 2: Route in `server.mjs` ergänzen**

Direkt vor der `/admin/models`-Route einfügen:

```javascript
    if ((path === '/admin' || path === '/admin/') && method === 'GET') {
      const html = readFileSync(new URL('./ui/index.html', import.meta.url), 'utf8');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(html);
    }
```

- [ ] **Step 3: Manuell prüfen**

Run:
```bash
systemctl --user restart llm-proxy.service
sleep 3
curl -sI localhost:18235/admin | head -3
```
Expected: `HTTP/1.1 200 OK` mit `content-type: text/html; charset=utf-8`.

Dann `http://localhost:18235/admin` im Browser öffnen: beide Loadouts sichtbar, „Gefundene Modelle" zeigt die vorhandenen `.gguf` mit Quant und Layer-Zahl.

- [ ] **Step 4: End-to-End prüfen**

Klicke bei `gptoss-context` auf **start**. Erwartung: nach ~30 s meldet die Seite `gptoss-context laeuft. Kontext 105472, Tool-Call ok.`, der Punkt wird grün.

Verifikation von außen:
```bash
systemctl --user is-active llama-gptoss-context.service    # -> active
curl -s localhost:18235/v1/models | grep -o gptoss-context  # Proxy kennt es sofort
```

Dann auf **stop** klicken und prüfen:
```bash
systemctl --user is-active llama-gptoss-context.service    # -> inactive
```

- [ ] **Step 5: Commit**

```bash
git add scripts/llm-proxy/ui/index.html scripts/llm-proxy/server.mjs
git commit -m "feat(llm-proxy): Loadout-UI unter /admin [T002394]"
```

---

### Task 6: BATS-Guard für die ausgelieferte Registry

Die `node --test`-Suite prüft die Modullogik. Dieser Guard prüft auf Repo-Ebene, dass die
**ausgelieferte** `loadouts.json` gültig bleibt — insbesondere, dass niemand `ctx` oder `ngl`
pinnt und damit `--fit` abschaltet (die Regression aus E4, die den Server nicht kaputt macht,
sondern nur um Faktor 5 verlangsamt und deshalb sonst unbemerkt bliebe).

**Files:**
- Modify: `tests/spec/local-llm-proxy.bats` (am Dateiende anhängen)

**Interfaces:**
- Consumes: `scripts/llm/loadouts.json` aus Task 4
- Produces: nichts

- [ ] **Step 1: Write the failing test**

An `tests/spec/local-llm-proxy.bats` anhängen:

```bash

# --- T002394: Loadout-Registry -------------------------------------------------
@test "T002394: loadouts.json ist gueltiges JSON mit mindestens einem Loadout" {
  run node -e 'const d=require("./scripts/llm/loadouts.json"); if(!Array.isArray(d.loadouts)||!d.loadouts.length) process.exit(1); console.log(d.loadouts.length)'
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "T002394: kein Loadout pinnt ctx oder ngl (sonst ist --fit abgeschaltet)" {
  run node -e '
    const d=require("./scripts/llm/loadouts.json");
    const bad=d.loadouts.filter(l=>l.args.ctx!==null||l.args.ngl!==null).map(l=>l.slug);
    if(bad.length){console.error("gepinnt: "+bad.join(","));process.exit(1)}
  '
  [ "$status" -eq 0 ]
}

@test "T002394: Loadout-Ports sind eindeutig" {
  run node -e '
    const d=require("./scripts/llm/loadouts.json");
    const p=d.loadouts.map(l=>l.port);
    if(new Set(p).size!==p.length){console.error("Portkollision: "+p.join(","));process.exit(1)}
  '
  [ "$status" -eq 0 ]
}

@test "T002394: runner baut argv ohne -c und ohne -ngl" {
  run node -e '
    import("./scripts/llm-proxy/runner.mjs").then(m=>{
      const d=require("./scripts/llm/loadouts.json");
      for(const l of d.loadouts){
        const a=m.buildServerArgv(l,"/tmp/model.gguf",d.defaults);
        if(a.includes("-c")||a.includes("-ngl")){console.error(l.slug+": "+a.join(" "));process.exit(1)}
        if(!a.includes("-fit")){console.error(l.slug+": -fit fehlt");process.exit(1)}
      }
    }).catch(e=>{console.error(e.message);process.exit(1)})
  '
  [ "$status" -eq 0 ]
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy.bats -f T002394`
Expected: FAIL, solange `scripts/llm/loadouts.json` oder `runner.mjs` noch fehlen.

(Bei Ausführung nach Task 1–4 laufen sie durch — dann ist der Fail-Nachweis der Lauf *vor*
Task 4, den der Implementierer bewusst einmal durchführt.)

- [ ] **Step 3: Testlauf nach Implementierung**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy.bats -f T002394`
Expected: PASS, 4 Tests

- [ ] **Step 4: Commit**

```bash
git add tests/spec/local-llm-proxy.bats
git commit -m "test(llm-proxy): BATS-Guard gegen gepinnte ctx/ngl in loadouts.json [T002394]"
```

---

### Task 7: Dokumentation, Verifikation und Abschluss

**Files:**
- Modify: `scripts/llm-proxy/llm-proxy.service` (Kommentarblock)
- Modify: `openspec/specs/local-llm-proxy.md` (falls vorhanden — sonst überspringen und im Commit vermerken)

**Interfaces:**
- Consumes: alles
- Produces: nichts

- [ ] **Step 1: Unit-Kommentar ergänzen**

In `scripts/llm-proxy/llm-proxy.service`, vor dem `[Unit]`-Block anfügen:

```
# LOADOUT-UI (T002394): der Proxy liefert unter http://127.0.0.1:18235/admin eine
# Seite aus, mit der lokale GGUF-Modelle als "Loadouts" gestartet und gestoppt
# werden. Die Server laufen als EIGENE transiente Units (llama-<slug>.service),
# NICHT als Kindprozesse dieses Dienstes -- ein Neustart des Proxys darf ein
# geladenes 12-GB-Modell nicht mitreissen. Registry: scripts/llm/loadouts.json
# (bewusst eine Datei, nicht Postgres: die Backend-Registry haengt an
# `kubectl exec ... psql`, und das Werkzeug zum Hochfahren lokaler Inferenz darf
# nicht von der Erreichbarkeit des Clusters abhaengen).
```

- [ ] **Step 2: Prüfen, ob der OpenSpec-Spec existiert**

Run: `ls openspec/specs/local-llm-proxy.md`

Falls vorhanden: einen Requirement-Abschnitt für die Loadout-Verwaltung ergänzen (Format aus der Datei übernehmen, `openspec/config.yaml` ist SSOT für die Konventionen). Falls nicht vorhanden: diesen Schritt überspringen.

- [ ] **Step 3: Verifikationsblock (die drei Pflicht-Gates)**

Run:
```bash
task test:changed
task freshness:regenerate
task freshness:check
```
Expected: alle drei PASS. `freshness:regenerate` kann generierte Dateien anfassen — entstandene
Änderungen gehören mit in den Abschluss-Commit.

- [ ] **Step 4: Volle Proxy-Suite**

Run: `task test:llm-proxy && tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy.bats`
Expected: PASS

- [ ] **Step 5: Commit und PR**

```bash
git add -A
git commit -m "docs(llm): Loadout-UI in der Proxy-Unit dokumentieren [T002394]"
git push -u origin feature/llm-loadout-ui-T002394
gh-axi pr create --title "feat(llm-proxy): Loadout-UI zum Starten lokaler llama.cpp-Server [T002394]" --body "..."
gh-axi pr merge <n> --squash --auto
```

---

## Self-Review

**Spec-Abdeckung:** E1 (UI im Proxy) → Task 4+5. E2 (Datei statt Postgres) → Task 1+4. E3 (transiente systemd-Units) → Task 3. E4 (`--fit` entscheidet) → Task 3 Step 1 (der `null`-Test), Task 4 Step 2 (der Registry-Test), Global Constraints. Datenmodell → Task 1+4. Komponenten → Tasks 1–5. Datenfluss → Task 4. Fehlerbehandlung: alle sieben Zeilen der Spec-Tabelle sind in Task 4 als Route abgebildet. Tests → Tasks 1–3.

**Nicht abgedeckt und bewusst so:** Das UI bietet kein Formular zum Anlegen neuer Loadouts — `PUT /admin/loadouts` existiert und akzeptiert ein vollständiges Dokument, aber die Seite nutzt es noch nicht. Loadouts werden vorerst in der JSON-Datei editiert. Das ist YAGNI-Schnitt, kein Versehen: der Kern ist „auswählen und starten", und ein Formular über zwölf Felder mit Validierung ist eigenständige Arbeit, die den ersten nutzbaren Stand verzögert. Folgeticket, sobald das Grundgerüst steht.

**Typkonsistenz geprüft:** `unitName`, `buildServerArgv`, `buildStartCommand`, `startUnit`, `stopUnit`, `unitStatus`, `recentLogs` (Task 3) werden in Task 4 mit exakt diesen Namen importiert. `readLoadouts` liefert `{ doc, mtimeMs }` — in Task 4 durchgängig so destrukturiert. `scanModels(roots)` und `expandRoot(root)` aus Task 2 werden in Task 4 mit derselben Signatur genutzt. `DEFAULT_PATH` aus Task 1 in Task 4 importiert.
