---
title: "p5 — Rollen ausführen und auswerten"
ticket_id: T900561
domains: [llm-local-dev]
status: active
---

# p5 — Rollen ausführen und auswerten

Files: `scripts/llm/agent-bench/lib/roles.mjs` (neu). Jede Rolle ist eine Funktion
`run<Role>({ variant, inputs, endpoints, workdir, recorderUrls, timeoutMs })` →
`{ outcome, events, usage, artifacts }`; `events` folgen den Arten aus p1 Task 1.5.

## Task 5.1: Arbeitsverzeichnis je Auftrag

`prepareWorkdir(case, variant, dest)`: Fixture-Fall → `base/` nach `dest` kopieren und `git init`
+ Initial-Commit; Replay → `git worktree add --detach dest <parent_commit>` im Repo und den
archivierten Change aus `change_path` nach `openspec/changes/<slug>/` kopieren. Aufräumen per
`git worktree remove --force`.

## Task 5.2: Orchestrator

Führt `scripts/llm/plan-runner.mjs <workdir>/openspec/changes/<slug> --worktree <workdir> --4b-slots <n>`
mit `PLAN_RUNNER_ORCH_URL=<recorder-url des Orchestrators>` aus; Worker-Aufrufe von `opencode`
zeigen über eine temporäre opencode-Konfiguration auf den Recorder des Code-Workers.
Auswertung aus `.plan-runner/state.json`, der Exit-Code und dem Trace:
- `outcome` = 1, wenn alle Partials `done` und alle `checks/` grün, sonst Anteil grüner Checks.
- Events: `protocol_error` (Antwort ohne Tool-Call), `self_exec` (Selbstausführung trotz freiem Slot), `accepted_faulty_result` (Variante `faulty-worker`: eingespeistes Falschergebnis ohne Neu-Delegation übernommen), `redelegate_without_cause` (Neu-Delegation nach grünem Worker-Ergebnis).

## Task 5.3: Code-Worker

`opencode run --agent plan-worker-4b` bzw. das dem Modell zugeordnete Agentenprofil mit dem
Referenz-Partial (isoliert) oder dem geplanten Partial (Kette). Danach `checks/run.sh` im Workdir.
- `outcome` = 1 bei grünen Checks, sonst 0.
- Events: `out_of_scope_file` (Diff-Datei nicht in `target_files`), `red_test_run` (Testaufruf im Trace mit Exit ≠ 0 vor dem Erfolg), `tool_error`, `protocol_error` (fehlende oder falsche `PLAN-RUNNER-RESULT`-Zeile).

## Task 5.4: Planner

Chat-Tool-Loop mit Tools `read_file(path)`, `list_dir(path)`, `write_plan(tasks_md, partials: [{id, text}])`, `ask_clarification(question)`.
- Variante mit `expected_decision: clarify`: `outcome` = 1 nur bei `ask_clarification`; `write_plan` → `outcome` 0 + Event `clarify_miss`.
- Sonst: Plan wird gespeichert (Artefakt für die Kette) und strukturell geprüft (Manifest parsebar mit `parseManifest` aus `scripts/llm/plan-runner/plan.mjs`, `target_files` disjunkt, `depends_on` gültig). Isoliert: `outcome` aus Präzision/Recall der `target_files` gegen die Dateien der Referenz-Partials (F1-Wert). In der Kette überschreibt p6 den Planner-Outcome mit dem Marginal über die Ausführungsbelegungen.
- Events: `file_precision` je überflüssiger Datei, `invalid_manifest` als Fehler.

## Task 5.5: Vision-Worker

Eine Chat-Anfrage mit Bild (`image_url` als Data-URL aus `checks/`) und Frage aus `brief.md`,
Antwortformat JSON laut `checks/expected.json` (`{ fields: {...}, forbidden: [...] }`).
- `outcome` = Anteil korrekt beantworteter Felder (exakter Vergleich nach Trim/Lowercase).
- Events: `hallucinated_element` je Nennung eines Eintrags aus `forbidden`, `protocol_error` bei nicht parsebarem JSON.

## Task 5.6: Reviewer

Chat-Anfrage mit Partial-Text und Diff (`checks/diffs/clean.diff` bzw. `seeded-*.diff`), Antwortformat
`{ verdict: "pass"|"fail", reason, location }`.
- `outcome` = 1 bei richtigem Urteil.
- Events: `false_pass`, `false_fail`, `defect_unnamed` (Urteil `fail` richtig, aber `location` trifft die in `checks/diffs/seeded-*.json` hinterlegte Datei/Zeile nicht).

Akzeptanz: `node --check`; p9-Tests nutzen Fake-Endpunkte und ein Fake-`opencode` (Muster: `tests/spec/llm-local-dev/fixtures/plan-runner-fake-opencode.sh`).
