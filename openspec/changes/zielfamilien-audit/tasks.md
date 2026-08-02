---
title: "zielfamilien-audit — systematischer Zielfamilien-Audit (T002356-M1-Fehlerklasse)"
ticket_id: T002584
domains: [testing, agentic-tooling, plan-authoring]
status: plan_staged
file_locks: [.claude/lib/goals.md, scripts/health-goals-check.sh]
shared_changes: false
batch_id: null
parent_feature: T002440
depends_on_plans: [zielfamilie-llm-stack (T002442), zielfamilie-worktree-hygiene (T002443)]
---

# zielfamilien-audit — Implementation Plan

Systematischer Durchgang durch alle 21 Zielfamilien in `.claude/lib/goals.md` /
`scripts/health-goals-check.sh` auf die Fehlerklasse T002356-M1 (SKIP-forever /
vakuos grün). Fehlerhafte Ziele werden nach dem T002442-Muster geschärft
(Positiv-Anker, n/a statt 0, nie eine leere Liste/Default als Erfolg). Ein
committeter Audit-Report dokumentiert den Befund je Familie; eine BATS-Fixture-
Suite verhindert Regression (SKIP-forever und vakuos-grün machen die Suite rot).

_Ticket: T002584_

## File Structure

| Datei | Ist | Budget |
| --- | --- | --- |
| `scripts/health-goals-check.sh` | 615 | 800 (S1, keine Baseline) |
| `scripts/lib/zielfamilien-audit.sh` | neu | 800 (S1) — Zielgröße ≤ 350, analog T002442 |
| `.claude/lib/goals.md` | 920 | — (kein S1-Gate) |
| `docs/health-goals/zielfamilien-audit.md` | neu | — (Report, committet) |
| `tests/spec/health-goals/zielfamilien-audit.bats` | 84 (committet, RED) | — |

Generierte Artefakte (aus `task freshness:regenerate`, committen im Workflow):
`website/src/lib/goals-data.generated.json` (health:goals:emit),
`docs/agent-guide/maps/goals-map.md` + `docs/agent-guide/*.md` (agent-guide:emit),
`docs/code-quality/repo-index.json` (quality:index), `website/src/data/test-inventory.json`
(test:inventory).

Budget-Hinweis: `scripts/health-goals-check.sh` hat nur 185 Zeilen Luft bis zum
S1-Limit — Schärfungen gehören primär in `goals.md` (Messbefehl) und in den neuen
Runner; nur wenn unvermeidbar in health-goals-check.sh, dann reduzierend umbauen.

## Entscheidungen (Brainstorming, Patrick, 2026-08-02)

1. **Fix-Umfang:** Nur audit-failende Ziele schärfen. Grüne Ziele bleiben
   unangetastet — sie bekommen nur Fixture-Regressionsschutz.
2. **Permanenter Schutz:** BATS-Fixture-Suite reicht. **Kein Meta-Ziel**
   (kein G-AUDIT01) in goals.md.
3. **Abgrenzung:** G-LLM\* → T002442, G-WT\* → T002443 explizit **ausgeschlossen**
   (gleiche Dateien, FREEZE / plan_staged). Keine Doppelmessung der
   Schnittstellen-Familie (in T002442 geklärt).
4. **Protokoll:** Committeter Audit-Report `docs/health-goals/zielfamilien-audit.md`
   + Ticket-Link (kein reiner Ticket-Kommentar).

## Fehlerklassen (Taxonomie, T002583 / T002356)

| ID | Klasse | Erkennungsmuster |
| --- | --- | --- |
| E1 | Fehlende Mess-Basis → Nullwert → vakuos grün (T002356-M1) | Messbefehl liest Feld, das in der realen Antwort nicht existiert; Default `0`/leere Liste gilt als Erfolg |
| E2 | SKIP-forever | Fallback `-` (z. B. except-Zweig nach Struktur-Fehler) → Ziel läuft nie |
| E3 | Filter auf nicht-existierenden Schlüssel | `grep -c '"kind"' …` findet nie etwas, Messung schweigt |
| E4 | Textwert im arithmetischen Vergleich | `ready:false` schreibt Text `degraded`, danach `[ "$actual" -le 0 ]` |
| E5 | Existenz-Anker fehlt | Verschwundene Basis (Pfad/grep-Quelle weg) → `0` bleibt grün |

## Partials

| id | Datei | Rolle | target_files | depends_on |
| --- | --- | --- | --- | --- |
| p1 | `tasks.d/p1-audit-runner.md` | impl | `scripts/lib/zielfamilien-audit.sh` | |
| p2 | `tasks.d/p2-schaerfung.md` | impl | `.claude/lib/goals.md`, `scripts/health-goals-check.sh` | p1 |
| p3 | `tasks.d/p3-report.md` | docs | `docs/health-goals/zielfamilien-audit.md` | p2 |
| p4 | `tasks.d/p4-tests.md` | tests | `tests/spec/health-goals/zielfamilien-audit.bats` | p1, p2 |

Sequenziell: p1 (Runner liefert Messwerte) → p2 (Schärfung anhand der Befunde) →
p3 (Report dokumentiert Ergebnis) → p4 (Fixture-Suite grün gegen geschärfte Ziele).

## Task 1 — Failing Test (RED, bereits committet)

- [x] **FAILING (expected: FAIL)**: `tests/spec/health-goals/zielfamilien-audit.bats`
  ist committet (71a4f178a) und rot verifiziert — 7 Tests, exit 1
  (`command not found` 127, Runner existiert noch nicht). Run with
  `bats tests/spec/health-goals/zielfamilien-audit.bats` and verify it fails.

## Task 2 — Final verification (nach allen Partials, im Worktree)

```bash
bats tests/spec/health-goals/zielfamilien-audit.bats            # exit 0
task test:changed
task freshness:regenerate && task freshness:check
task test:code-quality
task workspace:validate
bash scripts/plan-lint.sh openspec/changes/zielfamilien-audit/tasks.md
bash scripts/openspec.sh validate
```

Danach PR `fix/zielfamilien-audit-T002584` → main (git-workflow-Skill), CI-Gate grün.
