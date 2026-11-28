# Goal: ci-queue-guard
health_goals: [G-CI03]
## Objective
CI-Queue-Latenz auf main begrenzen: p95 der Wall-Clock-Dauer der letzten 20 ci.yml-Laeufe dauerhaft auf <= 12 Minuten druecken, damit PR-Feedback wieder planbar wird.
## Ist-Befunde
- B1: p95 14/12 mit gh-Befehl und sortierten Durations belegt (RCA 2026-11-28: `gh run list --workflow ci.yml --branch main --limit 20 --json createdAt,updatedAt` + sortierte Minuten-Deltas).
- B2: Ausreisser 45996916608 mit 1161 min (Shard-4 Queue 1158.7 min) — Queue dominiert Wall-Clock, nicht Testzeit.
- B3: Ausreisser 46125023106 mit 13.55 min Queue+Fail — Queue plus fehlgeschlagener Lauf verzoegert Fenster.
- B4: ci.yml-Referenzen: concurrency Zeilen 47-51, schedule Zeilen 37-38, timeout-minutes Zeile 546, fail-fast Zeile 550.
## Entscheidungen
- D1: Scope nur Queue-Guard ohne Runner-Split (Eigner-Entscheid 2026-11-28).
- D2: Nachweis via workflow_dispatch, kein Warten auf Nightly.
## Erfolgskriterien
1. Queue-Guard landet: concurrency + Run-Timeout in ci.yml — Nachweis: `gh run list` p95 <= 12 ueber 20 Runs.
2. Shard-4 rerun-Doku — Nachweis: `task test:changed` gruen + `gh workflow run` Beleg.
3. Messhygiene-Doku — Nachweis: `node ~/scripts/goal-lint.mjs` gruen.
## Nicht-Ziele
- Kein Runner-Split (keine Shard-Aufteilung, keine neuen Runner).
- Kein E2E (keine Playwright-/Brand-Umgebungen).
## Abhängigkeiten
- Keine; bzw. G-CI03 (CI Pipeline p95 Duration).
