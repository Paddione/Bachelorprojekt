---
title: "p3 — Orchestrator-Loop, Selbstaufruf, Idle-Dispatch und CLI"
ticket_id: T900504
domains: [llm-local-dev]
status: active
---

# p3 — Orchestrator-Loop, Selbstaufruf, Idle-Dispatch und CLI

Files: `scripts/llm/plan-runner.mjs` (neu), `docs/runbooks/plan-runner.md` (neu; verweist auf das
Skript, damit S4 es als erreichbar wertet). Nutzt p1 (`plan.mjs`) und p2 (`workers.mjs`).

## Task 3.1: CLI

`node scripts/llm/plan-runner.mjs <change-dir> [--worktree <pfad>] [--4b-slots N] [--max-turns N]`

- `<change-dir>` = `openspec/changes/<slug>`; `--worktree` Default = Git-Toplevel des Change-Ordners.
- Orchestrator-URL = `PLAN_RUNNER_ORCH_URL` oder `http://127.0.0.1:1919`.
- Exit 0, wenn am Ende alle Partials `done` sind; Exit 1 bei mindestens einem `failed`; Exit 2 bei
  Konfigurationsfehlern (Manifest, Pfade).

## Task 3.2: Tool-Loop gegen den Orchestrator

Chat-Loop wie in `scripts/llm/bench-orchestration.mjs` (`/v1/chat/completions`, `tools`,
`tool_choice: 'auto'`). System-Prompt: Rolle, die Regel "4B zuerst, `execute_self` nur wenn alle
4B-Slots belegt", die Pflicht, jedes Worker-Ergebnis zu pruefen, bevor `mark(id,'done')` faellt.
Tools und Semantik:

| Tool | Argumente | Wirkung |
|---|---|---|
| `plan_status` | – | Zustand je Partial, bereite IDs, `free4b` |
| `dispatch_4b` | `partial_id`, `prompt` | Partial bereit und Slot frei → `start4b`, Status `running/4b`, Antwort `STARTED`; sonst `BUSY` bzw. Fehlertext |
| `execute_self` | `partial_id`, `prompt`, `plan_notes` | `free4b() > 0` → Fehler "use dispatch_4b"; sonst `plan_notes` + `frozen_at` speichern, `runSelf` starten und bis zum Ende blockieren (waehrenddessen Task 3.3), Ergebnis `success|failure <summary>` zurueckgeben |
| `wait_event` | – | `nextEvent()`; liefert Partial-ID, `ok`, Kurzfassung, Ausgabe-Ende |
| `mark` | `partial_id`, `status` (`done`/`failed`/`open`), `note` | setzt den Status, `open` erhoeht `attempts` (max. 2 Wiederholungen, danach `failed`) |
| `finish` | `summary` | beendet den Loop |

Nach jedem Tool-Aufruf `saveState`. Kein Tool-Call in einer Antwort zaehlt als Protokollfehler; nach
drei Protokollfehlern in Folge bricht der Lauf mit Exit 1 ab.

## Task 3.3: Idle-Dispatch waehrend des Selbstaufrufs

Solange `runSelf` laeuft, prueft der Scheduler bei jedem Ende eines 4B-Jobs und alle 5 s
`readyPartials`: fuer jeden freien Slot wird die naechste bereite Partial (ohne die gerade selbst
ausgefuehrte) mit `buildWorkerPrompt` gestartet. Beendete Ergebnisse bleiben in `nextEvent()`
gepuffert und werden dem Orchestrator nach der Rueckkehr als Anhang des `execute_self`-Ergebnisses
("Waehrend du geschlafen hast: …") gemeldet.

## Task 3.4: Runbook

`docs/runbooks/plan-runner.md`: Voraussetzungen (`qwen38-gsq-iq2s.service` mit `-cram 12288`,
`qwen35-mtp.service`), Aufruf, Zustandsdatei, Resume nach Abbruch, Messgrundlage mit Verweis auf
`scripts/llm/measurements/2026-09-26-qwen38-gsq-iq2s-mtp.md`.

Akzeptanz: `node --check scripts/llm/plan-runner.mjs`; p5-Szenarien "Self-execution is refused while a
worker slot is free" und "Workers keep running while the orchestrator sleeps" gruen.
