// plan.mjs — Planmodell des plan-runners (T900504): plan partial-Manifest, Abhaengigkeiten,
// Zustandsdatei, Worker-Prompt und Ergebniszeile. Einzige Prozess-Ausnahme (T901542):
// buildWorkerPrompt reichert den Prompt per `task context:retrieve` mit aehnlichen
// Partials an (fail-soft, nie blockierend, via PLAN_RUNNER_RECALL_BIN testbar).
// Aufrufer: scripts/llm/plan-runner.mjs. Runbook: docs/runbooks/plan-runner.md.

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, basename, resolve } from 'node:path';

export const RESULT_MARKER = 'PLAN-RUNNER-RESULT:';

const splitList = (cell) => cell.split(',').map((s) => s.trim()).filter(Boolean);

// Size-Tier (T901542, plan-vector-routing): s = Microtask, m = Standard (4B-Worker),
// l = gross/unterspezifiziert (heute: Selbstaufruf, spaeter: Heavy-Track :1919).
// Quelle: optionale 6. Manifest-Spalte oder `size:` im Partial-Frontmatter (Frontmatter gewinnt).
export function normalisePartialSize(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 's' || s === 'm' || s === 'l' ? s : 'm';
}

// `size:` aus dem Partial-Frontmatter (--- ... ---), sonst Manifest-Spalte, sonst 'm'.
export function partialSize(partial, partialText) {
  const fm = String(partialText ?? '').match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (fm) {
    const hit = fm[1].match(/^\s*size\s*:\s*([sSmMlL])\s*$/m);
    if (hit) return hit[1].toLowerCase();
  }
  return normalisePartialSize(partial?.size);
}

// Liest die Tabelle unter "## Partials" (id | plan | role | target_files | depends_on [| size]).
export function parseManifest(tasksMdText) {
  const lines = String(tasksMdText).split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+Partials\s*$/.test(l.trim()));
  if (start < 0) throw new Error('manifest: section "## Partials" not found');
  const rows = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^#{1,2}\s/.test(line)) break;
    if (!line.startsWith('|')) continue;
    const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    if (/^-+$/.test(cells[0].replace(/:/g, '')) || cells[0].toLowerCase() === 'id') continue;
    const [id, file = '', role = '', targets = '', deps = '', size = ''] = cells;
    if (!id) continue;
    rows.push({ id, file, role, targetFiles: splitList(targets), dependsOn: splitList(deps), size: normalisePartialSize(size) });
  }
  if (!rows.length) throw new Error('manifest: "## Partials" has no rows');
  const ids = new Set(rows.map((r) => r.id));
  for (const r of rows) {
    if (!r.file) throw new Error(`manifest: partial ${r.id} has no plan file`);
    for (const d of r.dependsOn) {
      if (!ids.has(d)) throw new Error(`manifest: partial ${r.id} depends on unknown partial ${d}`);
      if (d === r.id) throw new Error(`manifest: partial ${r.id} depends on itself`);
    }
  }
  return rows;
}

// IDs mit status 'open', deren Abhaengigkeiten alle 'done' sind, in Manifest-Reihenfolge.
export function readyPartials(partials, state) {
  const st = (id) => state.partials[id]?.status;
  return partials
    .filter((p) => st(p.id) === 'open' && p.dependsOn.every((d) => st(d) === 'done'))
    .map((p) => p.id);
}

export const statePath = (changeDir) => join(changeDir, '.plan-runner', 'state.json');

const freshPartial = () => ({ status: 'open', owner: null, attempts: 0, result: null });

// Laedt oder legt den Zustand an; ergaenzt neue Partials; setzt 'running' auf 'open' zurueck (Resume).
export function loadState(changeDir, partials) {
  const file = statePath(changeDir);
  let state;
  if (existsSync(file)) {
    try {
      state = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      throw new Error(`state: ${file} is not valid JSON (${e.message})`);
    }
  } else {
    state = {};
  }
  state.slug = state.slug || basename(resolve(changeDir));
  state.partials = state.partials && typeof state.partials === 'object' ? state.partials : {};
  state.orchestrator = { notes: '', frozen_at: null, ...(state.orchestrator ?? {}) };
  for (const p of partials) {
    const cur = { ...freshPartial(), ...(state.partials[p.id] ?? {}) };
    if (cur.status === 'running') {
      cur.status = 'open';
      cur.owner = null;
    }
    // status zuerst, damit der Zustand lesbar serialisiert.
    state.partials[p.id] = { status: cur.status, owner: cur.owner, attempts: cur.attempts, result: cur.result };
  }
  return state;
}

// Atomar: Temp-Datei schreiben, dann umbenennen.
export function saveState(changeDir, state) {
  const file = statePath(changeDir);
  mkdirSync(join(changeDir, '.plan-runner'), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
  renameSync(tmp, file);
}

// Maschinenlesbares Partial-Schema (T901014 P2): Pflichtfelder zuerst, knappe
// Feldnamen, feste Reihenfolge — kleine (low-quant) Modelle erhalten Struktur
// statt Fliesstext. BODY ist auf MAX_PROMPT_BODY_CHARS gekuerzt (4B-Budget).
export const PARTIAL_FIELDS = ['pid', 'role', 'files', 'deps'];
export const MAX_PROMPT_BODY_CHARS = 12000;

// Kompakte Record-Zeile eines Partials: `PID:..|ROLE:..|FILES:..|DEPS:..`.
// Leere Listen werden als `-` kodiert, damit jeder Key immer vorhanden ist.
export function formatPartialRecord(partial) {
  const files = partial.targetFiles.length ? partial.targetFiles.join(',') : '-';
  const deps = partial.dependsOn.length ? partial.dependsOn.join(',') : '-';
  return `PID:${partial.id}|ROLE:${partial.role || '-'}|FILES:${files}|DEPS:${deps}`;
}

// Dispatch-Recall (T901542, plan-vector-routing): top-k Partial-Snippets fremder
// Plaene aus der K1-Collection specs_plans (K1→K3-Recall). Rolle/Budget/Corpora wie
// im Plan: --role bachelorprojekt-run --budget 1500 --corpora specs_plans.
// HINWEIS: bachelorprojekt-run steht (noch) nicht in der context-retrieve-Allowlist
// (agents.yaml: bp-build/bp-run/bp-ship/orchestrator) — bis dahin greift hier der
// Fail-soft-Pfad. Rolle via PLAN_RUNNER_RECALL_ROLE korrigierbar (z. B. bp-run).
// Binary via PLAN_RUNNER_RECALL_BIN ersetzbar (Muster: PLAN_RUNNER_OPENCODE);
// PLAN_RUNNER_RECALL=off schaltet den Recall ganz ab (z. B. agent-bench).
export const RECALL_ROLE = 'bachelorprojekt-run';
export const RECALL_BUDGET = 1500;
export const RECALL_CORPORA = 'specs_plans';
export const RECALL_MAX_CHARS = 1500;
export const RECALL_TIMEOUT_MS = 20000;

// Holt aehnliche Partials als Textblock; '' bei jedem Fehler (Exit != 0, leer,
// Timeout, Binary fehlt) — der Dispatch laeuft dann ohne Recall-Abschnitt weiter.
export function recallSimilarPartials(partialText) {
  if (['0', 'off', 'no'].includes(String(process.env.PLAN_RUNNER_RECALL ?? '').toLowerCase())) return '';
  const query = String(partialText ?? '').slice(0, MAX_PROMPT_BODY_CHARS);
  if (!query.trim()) return '';
  const bin = process.env.PLAN_RUNNER_RECALL_BIN || 'task';
  const role = process.env.PLAN_RUNNER_RECALL_ROLE || RECALL_ROLE;
  try {
    // Kind-stderr wird ignoriert: `task` erklaert jeden Aufruf auf stderr
    // (`task: [context:retrieve] ...`), das duerfte nie im Prompt- oder
    // Test-Output des Aufrufers landen. Nur stdout zaehlt als Treffer.
    const out = execFileSync(bin,
      ['context:retrieve', '--', '--task-prompt', query,
        '--role', role, '--budget', String(RECALL_BUDGET), '--corpora', RECALL_CORPORA],
      { encoding: 'utf8', timeout: RECALL_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'ignore'] });
    return String(out ?? '').trim().slice(0, RECALL_MAX_CHARS);
  } catch {
    return '';
  }
}

// Prompt fuer einen Worker (4B oder Selbstaufruf) im Maschinen-Format: eine
// Record-Zeile + BODY-Block, kein Fliesstext-Ballast, keine .md-Reste.
// `Partial-ID:` bleibt erste Zeile (Test-Stub parst sie, T900504).
// recall=false unterdrueckt den Aehnliche-Partials-Abschnitt im Einzelfall.
export function buildWorkerPrompt({ partial, partialText, worktree, extra = '', recall = true }) {
  let body = String(partialText ?? '');
  if (body.length > MAX_PROMPT_BODY_CHARS) {
    body = `${body.slice(0, MAX_PROMPT_BODY_CHARS)}\n[TRUNCATED ${body.length - MAX_PROMPT_BODY_CHARS} chars]`;
  }
  const lines = [
    `Partial-ID: ${partial.id}`,
    formatPartialRecord(partial),
    `WORKTREE:${worktree}`,
    'BODY:',
    body,
    'END-BODY',
  ];
  if (recall) {
    const hits = recallSimilarPartials(partialText);
    if (hits) lines.push('Ähnliche Partials (K1-Recall aus specs_plans, top-k Snippets fremder Pläne):', hits);
  }
  lines.push(
    extra ? `EXTRA:${String(extra).slice(0, 2000)}` : '',
    'Carry out every task of the partial completely. Only change FILES. Do not commit.',
    'RESULT: your very last line must be exactly one of:',
    `${RESULT_MARKER} success <one-line summary>`,
    `${RESULT_MARKER} failure <one-line reason>`,
  );
  return lines.filter((l) => l !== '').join('\n');
}

// Sucht die letzte Zeile mit PLAN-RUNNER-RESULT:. Ohne Treffer gilt der Lauf als Fehlschlag.
export function parseResult(output) {
  // Nur Zeilen, die mit dem Marker BEGINNEN, und ohne <Platzhalter>: sonst zaehlt die im Prompt
  // stehende oder vom Modell zitierte Vorlage "success <one-line summary>" als Erfolg (T900504, Lauf 1).
  const re = new RegExp(`^${RESULT_MARKER}\\s+(success|failure)\\b\\s*(.*)$`);
  const hits = String(output ?? '').split(/\r?\n/)
    .map((l) => l.trim().match(re))
    .filter((m) => m && !/^<[^>]*>/.test(m[2]));
  if (!hits.length) return { ok: false, summary: 'no result line' };
  const m = hits[hits.length - 1];
  return { ok: m[1] === 'success', summary: m[2] || m[1] };
}
