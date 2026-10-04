# Design: Worker-Track + Maschinen-Format (T901014)

- Status: abgestimmt (2026-10-04)
- Ticket: T901014 (feat, agents) — Folgeticket zu T900999 (PR #6253 gemergt)
- Struktur: Mono-Plan, Track-Partials (disjunkte Files, max 9 Partials)

## 1. Ziel

Zwei bewusst separierte Folgetracks aus der T900999-Neuausrichtung:
Worker-Ausführung vs. Lifecycle-Verwaltung trennen (Track 1) und
Pläne in ein low-quant-ausführbares Maschinen-Format überführen
(Track 2) — mit eigener Validierung statt .md-Rest-Files (P3).

## 2. Partial-Zuschnitt (disjunkt)

- P1 Worker-Track (`scripts/llm/plan-runner/workers.mjs`,
  `scripts/llm/plan-runner.mjs` Dispatch-Policy): Pool/Agent-Trennung,
  Worker-Ausführung als eigener Track neben Receipt/Delete.
  Runner-Handoff (FACTORY-REF-Auflösung) ist OUT — eigenes
  Follow-up T901015.
- P2 Maschinen-Format (`scripts/llm/plan-runner/plan.mjs`
  parseManifest/buildWorkerPrompt): Tabellen-Format + Prompt-Bau in
  low-quant-ausführbares Format; Context-Rerank je Edit,
  Web-Search-Einbindung und Headed-Run-Intelligenz als
  scoping-offene Punkte (0 Priors im Repo).
- P3 Validierung (`scripts/plan-lint.sh`): andere Validierungsform
  statt .md-Rest-Files — keine .md-Reste mehr; fail-closed.
- P4 Tests (`tests/spec/llm-local-dev/`, Fixtures
  `plan-runner-fake-*`): je Track Abdeckung, Failing-Test-Pflicht.

## 3. Sequenz

1. Phase A auf `main`: Proposal, `intel.json` via
   `scripts/plan-intel.sh`, Plan unter
   `.agents/plans/worker-machine-format/`, Frontmatter.
2. Phase B: Worktree `feature/worker-machine-format-T901014`,
   Lock claimen, Scaffold-Commit + Push.
3. Phase C: Partials schreiben → committen → stagen → enqueuen;
   plan-lint, finaler Push. Ausstieg: Branch gepusht, Ticket
   `plan_staged`, kein PR (Übergabe an `dev-flow-execute`).

## 4. Guards / Eval

- `plan-lint.sh` hartes Gate pro Partial; letzte Manifest-Zeile
  ist Tests (STRUCT-Regel).
- BATS-Suiten + Fixtures je Track grün; Kollisions-Check
  (kein File-Overlap zwischen Partials).
- CI-Gate vor Merge: `task test:changed` + `task freshness:check` +
  `task workspace:validate`. Keine direkten Pushes nach `main`,
  kein Force-Push. Generierte Artefakte nie committen.

## 5. Out of Scope

- T900999-Scope (Receipt/Delete/Doktrin — done/shipped).
- `ml/*` (fremde Trainings-Artefakte, ungetrackt) unangetastet.

## 6. Entscheidungs-Log

- Mono-Plan mit Track-Partials (statt 2 Tickets, Kaskade,
  Track-2-Spike).
- Validierung als eigenes Partial P3 (statt in T2 versteckt).
- Vorbefunde Recon: keine ADR-/Spec-Priors; Rerank-Treffer nur
  K3/Embed-Domain; naechster Vorlaeufer-Plan
  `.agents/plans/plan-runner-opencode-v2/`.

## 7. Offene Punkte für Phase A

- Exakte File-Grenzen P1–P4 aus `intel.json` ableiten.
- Erledigt separiert: Runner-Handoff → T901015.
- T2-Scope: Rerank/Web-Search/Headed drin oder Follow-up.
