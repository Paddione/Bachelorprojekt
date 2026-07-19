---
ticket_id: T001979
plan_ref: openspec/changes/openspec-drift-gate/tasks.md
status: active
date: 2026-07-19
---

# openspec-drift-gate — Design Spec

## Kontext & Warum

Quelle: Agentic-Trends-Radar 2026-07-19, Trend "Spec-Drift-Enforcement" (Verdict: trial, Aufwand S), Ticket T001979.

Unser OpenSpec-Workflow ist fail-closed für *vorhandene* Changes (`openspec.sh validate`), aber es gibt kein Gate, das erkennt, wenn Code an spec-gemappten Pfaden geändert wird, **ohne** dass die zugehörige Spec angefasst wird. Bei einer Agenten-Flotte mit Auto-Merge ist stille Spec-Code-Drift ein reales Risiko: `openspec/specs/` altert, während der Code weiterläuft.

## Was gebaut wird

Ein advisory CI-Check `scripts/openspec-drift-check.sh`, der für feat/fix-PRs warnt, wenn geänderte Dateien auf SSOT-Specs mappen, aber keine Spec-Änderung im PR liegt.

### Entscheidungen (Brainstorming-Ergebnis)

| # | Entscheidung | Begründung |
|---|---|---|
| E1 | **Advisory-only in Phase 1** — das Skript liefert Exit 0 im Default; `DRIFT_CHECK_ENFORCE=1` (für spätere Phase 2) macht Warnungen zu Exit 1. Dieses Feature liefert NUR Phase 1. | Blockierend ohne FP-Messung verschlechtert DORA Lead Time direkt (Radar-Risiko). |
| E2 | **feat/fix-Erkennung über Conventional-Commit-Präfix des PR-Titels** (`feat:*`/`fix:*` → prüfen, alles andere → skip mit Meldung), lokal Fallback auf Branch-Prefix (`feature/*`, `fix/*`). | Muster existiert bereits in `.github/workflows/post-merge.yml:152-157` (scout-drift ratchet); PR-Titel ist in CI via `${{ github.event.pull_request.title }}` verfügbar (ci.yml:461). Chore-Pfad bleibt explizit ausgenommen. |
| E3 | **Mapping-Logik wird aus `scripts/openspec-context.sh:41-72` wiederverwendet** (Mini-YAML-Parser + Longest-Prefix-Match auf `openspec/component-map.yaml`), Changed-Files via `git diff --name-only $(git merge-base HEAD origin/main) HEAD`. | Einziger heutiger Konsument der component-map; identische Semantik verhindert Drift zwischen Kontext-Injektion und Gate. Extraktion in eine gemeinsame Lib ist erlaubt, aber kein Muss (S-Scope). |
| E4 | **"Spec angefasst" heißt:** der PR-Diff enthält (a) `openspec/specs/<slug>.md` ODER (b) irgendeine Datei unter `openspec/changes/*/specs/<slug>.md` (Delta-Spec, benannt nach Parent-SSOT-Slug gem. T001304) ODER (c) einen ganzen Change-Ordner `openspec/changes/<change>/`, dessen `specs/` den Slug enthält. | Deckt beide legitimen Wege ab (direkter SSOT-Edit via archive, Delta via propose). |
| E5 | **Bypass per env-Var `SKIP_SPEC_DRIFT=1`**, kein PR-Label. | Repo-Konvention (`SKIP_COMMIT_VS_DIFF=1`, `TICKET_OFFLINE=1`); Label-Mechanismen existieren in ci.yml bisher nicht. `spec-exempt`-Label ist Phase-2-Option, nicht jetzt. |
| E6 | **FP-Messung über strukturierte Ausgabe:** pro Warnung eine greppbare Zeile `DRIFT: <spec-slug> <- <datei>` auf stdout + `::warning::`-Annotation + Zusammenfassung in `$GITHUB_STEP_SUMMARY`. Nach ~4 Wochen werden die Warnungen der gemergten PRs manuell als TP/FP klassifiziert (kein eigenes Tracking-System in Phase 1). | Leichtgewichtig; die Entscheidung Phase 2 (blockierend) braucht nur eine Handvoll klassifizierter Fälle. |
| E7 | **CI-Einbindung als eigener Step im `test-bats`-Job** (nach dem Freshness-Check, `if: github.event_name == 'pull_request'`), advisory über Skript-Exit-0 (nicht `continue-on-error`, damit echte Skript-Fehler wie Syntax-Bugs weiter auffallen — Unterscheidung: Drift = Warnung/Exit 0, kaputtes Skript = Exit ≥ 2). | `test-bats` hat `fetch-depth: 0` (ci.yml:52-55), `origin/main` ist verfügbar. Muster: Ticket-Tag-Check ci.yml:459-468. |
| E8 | **`--self-test`-Modus** im Skript (analog `check-commit-vs-diff.sh:36-126`) mit synthetischen Fällen: feat-PR mit Drift, feat-PR mit Delta-Spec, chore-PR (skip), Bypass. | In-Skript-Tests machen das Gate BATS-testbar ohne Git-Fixture-Zirkus. |

### Ausdrücklich NICHT in Scope

- Blockierender Modus / Phase 2 (separate Entscheidung nach FP-Messung).
- PR-Label-Override (`spec-exempt`) — Phase 2.
- Vollständigkeits-Audit der component-map (Mappings werden nur dort ergänzt, wo Self-Test/BATS es erfordern).
- Erkennung von "Alibi-Spec-Edits" (Spec-Rauschen durch Autopilot) — bekanntes Restrisiko, wird in der FP-Messung mit beobachtet.

## Betroffene Dateien

| Datei | Zeilen (ist) | Änderung |
|---|---|---|
| `scripts/openspec-drift-check.sh` | neu | Gate-Skript (~150-190 Z., Vorbild check-commit-vs-diff.sh) |
| `.github/workflows/ci.yml` | 521 | +1 advisory Step im test-bats-Job |
| `tests/spec/ci-cd.bats` | 324 | Neue @test-Blöcke (Self-Test-Aufruf + Struktur-Assertions) |
| `openspec/changes/openspec-drift-gate/specs/ci-cd.md` | neu | Delta-Spec (Parent-SSOT: ci-cd) |

## Akzeptanzkriterien

1. feat-PR, der `website/src/lib/tickets/…` ändert ohne Spec-Änderung → genau eine `DRIFT:`-Zeile + `::warning::`, Exit 0.
2. Gleicher PR mit Delta-Spec `openspec/changes/<x>/specs/<slug>.md` im Diff → keine Warnung.
3. chore-PR (Titel `chore:` bzw. Branch `chore/*`) → Skip-Meldung, keine Prüfung.
4. `SKIP_SPEC_DRIFT=1` → Skip-Meldung, Exit 0.
5. `DRIFT_CHECK_ENFORCE=1` + Drift → Exit 1 (Phase-2-Schalter existiert, wird in CI nicht gesetzt).
6. `bash scripts/openspec-drift-check.sh --self-test` → grün; BATS in `tests/spec/ci-cd.bats` ruft ihn auf.

## Risiken

- FP durch unvollständige component-map → deshalb advisory + Messphase; die Map wird bewusst nicht vorab "vervollständigt".
- Skript-Fehler dürfen nicht als Drift maskiert werden → Exit-Code-Trennung (0 = ok/advisory-Warnung, 1 = enforce-Drift, ≥2 = Skript-Fehler; CI-Step failt nur bei ≥2).
