// plan.mjs — Planmodell des plan-runners (T900504): plan partial-Manifest, Abhaengigkeiten,
// Zustandsdatei, Worker-Prompt und Ergebniszeile. Reines Modul ohne Netzwerk- und Prozesszugriff.
// Aufrufer: scripts/llm/plan-runner.mjs. Runbook: docs/runbooks/plan-runner.md.

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';

export const RESULT_MARKER = 'PLAN-RUNNER-RESULT:';

const splitList = (cell) => cell.split(',').map((s) => s.trim()).filter(Boolean);

// Liest die Tabelle unter "## Partials" (id | plan | role | target_files | depends_on).
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
    const [id, file = '', role = '', targets = '', deps = ''] = cells;
    if (!id) continue;
    rows.push({ id, file, role, targetFiles: splitList(targets), dependsOn: splitList(deps) });
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

// Prompt fuer einen Worker (4B oder Selbstaufruf): vollstaendiger Partial-Text + Regeln.
export function buildWorkerPrompt({ partial, partialText, worktree, extra = '' }) {
  const files = partial.targetFiles.length ? partial.targetFiles.join(', ') : '(none declared)';
  return [
    `Partial-ID: ${partial.id}`,
    `You implement one partial of an staged plan. Work in the git worktree ${worktree}.`,
    `Only change these files: ${files}. Do not touch any other file. Do not commit.`,
    'Carry out every task of the partial below completely.',
    extra ? `\nNotes from the orchestrator:\n${extra}` : '',
    `\n----- partial ${partial.file} -----\n${partialText}\n----- end of partial -----\n`,
    `When you are finished, print as your very last line exactly one of:`,
    `${RESULT_MARKER} success <one-line summary>`,
    `${RESULT_MARKER} failure <one-line reason>`,
  ].filter((l) => l !== '').join('\n');
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
