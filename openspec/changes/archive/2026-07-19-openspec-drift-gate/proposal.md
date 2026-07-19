# Proposal: openspec-drift-gate

## Why

Der OpenSpec-Workflow ist fail-closed für vorhandene Changes (`openspec.sh validate`), aber nichts erkennt, wenn Code an spec-gemappten Pfaden geändert wird, ohne dass die zugehörige SSOT-Spec oder eine Delta-Spec angefasst wird. Bei einer Agenten-Flotte mit Auto-Merge ist stille Spec-Code-Drift ein reales Risiko: `openspec/specs/` altert, während der Code weiterläuft. Quelle: Agentic-Trends-Radar 2026-07-19, Trend "Spec-Drift-Enforcement" (Verdict trial, Aufwand S).

## What

Ein advisory CI-Check `scripts/openspec-drift-check.sh` (Phase 1, nur Warnung):

- Für feat/fix-PRs (Conventional-Commit-Präfix des PR-Titels; lokal Branch-Prefix-Fallback) werden die gegen main geänderten Dateien via `openspec/component-map.yaml` (Longest-Prefix-Match, Parser-Semantik aus `scripts/openspec-context.sh`) auf SSOT-Spec-Slugs gemappt.
- Warnung (`DRIFT: <slug> <- <datei>` + `::warning::` + `$GITHUB_STEP_SUMMARY`), wenn für einen gematchten Slug weder `openspec/specs/<slug>.md` noch eine Delta-Spec `openspec/changes/*/specs/<slug>.md` im PR-Diff liegt.
- chore-PRs werden übersprungen; Bypass per `SKIP_SPEC_DRIFT=1` (Repo-Konvention env-Var, kein PR-Label).
- Exit-Code-Trennung: 0 = ok/advisory-Warnung, 1 = nur mit `DRIFT_CHECK_ENFORCE=1` (Phase-2-Schalter, in CI ungesetzt), ≥2 = Skript-Fehler (lässt den CI-Step failen).
- `--self-test`-Modus mit synthetischen Fällen; BATS-Tests in `tests/spec/ci-cd.bats`.
- CI-Einbindung als eigener Step im `test-bats`-Job (`if: github.event_name == 'pull_request'`).

Nach ~4 Wochen FP-Messung (manuelle TP/FP-Klassifikation der Warnungen) fällt die separate Entscheidung über Phase 2 (blockierend + `spec-exempt`-Override). Design-Spec: `docs/superpowers/specs/2026-07-19-openspec-drift-gate-design.md`.

_Ticket: T001979_
