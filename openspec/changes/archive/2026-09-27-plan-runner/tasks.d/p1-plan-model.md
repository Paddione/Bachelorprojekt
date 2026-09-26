---
title: "p1 — Planmodell: Manifest, Abhaengigkeiten, Zustand"
ticket_id: T900504
domains: [llm-local-dev]
status: active
---

# p1 — Planmodell: Manifest, Abhaengigkeiten, Zustand

Files: `scripts/llm/plan-runner/plan.mjs` (neu, reines Modul ohne Netzwerk- und Prozesszugriff;
disjunkt zu p2–p5).

## Task 1.1: Manifest parsen

Exportierte Funktion `parseManifest(tasksMdText)` liest die Tabelle unter `## Partials`
(Spalten `id | plan | role | target_files | depends_on`, Format wie in
`openspec/changes/archive/2026-09-26-software-factory-decommission/tasks.md`) und liefert
`[{ id, file, role, targetFiles: string[], dependsOn: string[] }]`.

- Kopf- und Trennzeile werden uebersprungen, Zellen getrimmt, Listen an `,` getrennt.
- Fehlt die Sektion oder ist ein `depends_on` unbekannt, wirft die Funktion einen `Error` mit der
  Partial-ID im Text.

## Task 1.2: Bereite Partials bestimmen

`readyPartials(partials, state)` liefert die IDs mit `status === 'open'`, deren `dependsOn` alle
`done` sind, in Manifest-Reihenfolge. Partials mit `role === 'tests'` gelten wie jede andere.

## Task 1.3: Zustand laden und speichern

- `statePath(changeDir)` = `<changeDir>/.plan-runner/state.json`.
- `loadState(changeDir, partials)`: legt fehlenden Zustand an (`status: 'open'`, `owner: null`,
  `attempts: 0`, `result: null`, `orchestrator: { notes: '', frozen_at: null }`); ergaenzt neue
  Partials; setzt `running` auf `open` zurueck (Resume, siehe Requirement "Progress survives a restart").
- `saveState(changeDir, state)`: schreibt nach `state.json.tmp` und benennt per `fs.renameSync` um
  (atomar).

## Task 1.4: Worker-Prompt und Ergebnis

- `buildWorkerPrompt({ partial, partialText, worktree })`: enthaelt den vollstaendigen Partial-Text,
  den Worktree-Pfad, die Regel "nur diese Dateien aendern: <targetFiles>" und die Pflicht, als letzte
  Zeile `PLAN-RUNNER-RESULT: success|failure <Kurzfassung>` auszugeben.
- `parseResult(output)`: sucht die letzte Zeile mit `PLAN-RUNNER-RESULT:`; ohne Treffer
  `{ ok: false, summary: 'no result line' }`.

Akzeptanz: `node --check scripts/llm/plan-runner/plan.mjs`; die p5-Tests "Partials run in dependency
order" und "Progress survives a restart" nutzen diese Funktionen ueber die CLI.
