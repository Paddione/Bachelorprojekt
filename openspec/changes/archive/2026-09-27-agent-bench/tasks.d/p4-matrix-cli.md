---
title: "p4 — Kombinationsmatrix, Scheduler und CLI"
ticket_id: T900561
domains: [llm-local-dev]
status: active
---

# p4 — Kombinationsmatrix, Scheduler und CLI

Files: `scripts/llm/agent-bench/lib/matrix.mjs`, `scripts/llm/agent-bench/bench.mjs` (beide neu).

## Task 4.1: Belegungen erzeugen (`matrix.mjs`)

`buildAssignments({ roles, models, pool, mode, profile, seed })`:

- Rollen nur an Modelle mit passenden Fähigkeiten (`vision-worker` braucht `vision`, alle anderen `tools`).
- Stufen: `plan` (planner), `execute` (orchestrator + code-worker, bei `vision`-Varianten zusätzlich vision-worker), `review` (reviewer).
- `execute`-Paare nur aus gleichzeitig residenten Modellen (p3-Residenz-Regel) oder demselben Modell in beiden Rollen.
- Modus `isolated`: jede Rolle gegen Referenz-Artefakte; Modus `chained`: `plan`-Ergebnisse jedes Planners gehen an jede `execute`-Belegung, deren Ergebnis an jeden Reviewer.
- Profil `quick`: Diagonale (jedes Modell allein in allen fähigen Rollen) + Baseline (`qwen38-27b` + `qwen35-4b`), 1 Rep, pro Fall 1 Variante (erste in Sortierreihenfolge). Profil `full`: alle Varianten, 3 Reps, ganze Matrix; bei mehr als `maxJobs` Aufträgen Stichprobe mit `seed` (deterministischer PRNG, z. B. mulberry32) und Vermerk `sampled: true`.

## Task 4.2: Stufen-Cache und Scheduler

- Cache-Schlüssel `<stufe>/<variante>/<modell-oder-paar>/<rep>`; vorhandenes `score.json` = erledigt (Resume ohne Wiederholung, Requirement "Resume skips completed stages").
- `schedule(jobs)` sortiert nach benötigtem Loadout (Menge der Modelle je GPU), sodass zusammengehörige Aufträge ohne Umladen laufen; Anzahl Umladevorgänge wird im Manifest vermerkt.

## Task 4.3: CLI (`bench.mjs`)

Befehle:
- `run --profile quick|full --roles <csv> --models <csv> [--cases <csv>] [--reps N] [--seed S] [--mode isolated|chained] [--split eval|train]`
- `resume <run-id>`
- `report <run-id> [--baseline <run-id>]` → ruft p6
- `gate <run-id> --baseline <run-id>` → ruft p6, Exit 0/1, Exit 2 bei Konfigurationsfehler
- `export-corpus <run-id...> --out <dir>` → ruft p6

Ablauf `run`: Fälle validieren (p1, Exit 2 bei Fehlern), Rollen parsen (unbekannt → Exit 2 vor jedem Modell-Laden), `manifest.json` schreiben (`git rev-parse HEAD`, `scoring_version`, SHA-256 von `models.json`, Seed, Profil, Modus, Server-Kommandozeilen), `installRestoreHooks()` (p3), Aufträge je Loadout abarbeiten: `ensureLoadout` → je Auftrag Recorder (p2) starten, Rolle ausführen (p5), `scoreRun` (p1), `score.json` schreiben → `restoreProduction()`. Zustand in `state.json` atomar (Temp-Datei + `rename`, Muster aus `scripts/llm/plan-runner/plan.mjs`).

Infra-Fehler (Loadout-Check, Server-Absturz, Port belegt): einmal Loadout neu starten und Auftrag wiederholen, danach `score.json` mit `infra_error: <grund>` und ohne Score.

Letzte stdout-Zeile: `AGENT-BENCH: run=<id> jobs=<n> done=<n> infra=<n>`.

Env: `AGENT_BENCH_RUNS` (Default `~/agent-bench-runs`), `AGENT_BENCH_CASES` (Default `scripts/llm/agent-bench/cases`), `AGENT_BENCH_MODELS` (Default `scripts/llm/agent-bench/models.json`).

Akzeptanz: `node --check`; p9-Tests "Only selected roles are measured", "Unknown role is refused", "Plans are reused across executors", "Resume skips completed stages", "Vision role skips models without vision".
