---
title: "task-context-channel — Implementation Plan"
ticket_id: T002420
domains: [factory, test, infra]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# task-context-channel — Implementation Plan

Ein gemeinsamer Kontext-Assembler für beide Ausführungspfade. Statischer Kern zur Plan-Zeit
(deterministisch, committet), fail-softe Ergänzung zur Dispatch-Zeit. Design:
`docs/superpowers/specs/2026-07-28-task-context-channel-design.md`.

_Ticket: T002420_

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `scripts/plan-intel.sh` | 0 (neu) | n/a (neue Datei, Limit 800) |
| `scripts/task-context.sh` | 0 (neu) | n/a (neue Datei, Limit 800) |
| `scripts/plan-lint.sh` | n/a (laufend gemessen, s. u.) | n/a (laufend gemessen, s. u.) |
| `scripts/factory/pipeline.mjs` | 663 | n/a (auf `s1.ignore`) |
| `.claude/skills/dev-flow-execute/SKILL.md` | 250 | n/a (S1-ungated) |
| `.claude/skills/references/dev-flow-plan-phases.md` | 327 | n/a (S1-ungated) |
| `tests/spec/dev-flow-plan/task-context.bats` | 0 (neu) | n/a (S1-ungated) |

Budgets mit `PLAN_LINT_SELFTEST=1 bash scripts/plan-lint.sh residual_budget <pfad>` verifiziert.
Nur `scripts/plan-lint.sh` liefert überhaupt einen numerischen Wert; die übrigen sind
ignore-gelistet, ungated oder existieren noch nicht.

**Warum für `scripts/plan-lint.sh` trotzdem `n/a` in der Tabelle steht [T002506]:** Dieser Plan
ist zugleich die **Fixture** von `tests/spec/dev-flow-plan/task-context.bats` (TCC-Gate). Eine
eingetragene Zahl wird dort von B1a gegen den *live gemessenen* Restwert derselben Datei geprüft —
und `scripts/plan-lint.sh` wächst mit jeder Änderung an ihr. Jede solche Änderung ließ das Gate
rot werden, ohne dass am Plan oder am Gate etwas falsch war (450→350, dann 463→337, dann 330).
Der Wert wird deshalb bewusst nicht mehr behauptet; gemessen wird er weiterhin über das Kommando
oben. Die Aussagekraft von B1a bleibt für alle *echten* Pläne unberührt — dort ist die
Zieldatei nicht das messende Werkzeug selbst.

**Nicht-S1-Constraint für `dev-flow-execute/SKILL.md`:** Health-Goal G-AGENTIC09 (projekteigene
`SKILL.md` über 250 Zeilen, Ziel 0) — die Datei steht bei exakt 250, das Ziel ist derzeit grün.
Jede netto hinzugefügte Zeile reißt es. P3 **verkleinert** die Datei deshalb: vier Zeilen Prosa
(`SKILL.md:69-72`) werden durch einen einzeiligen Skript-Aufruf ersetzt.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|---------------|------------|
| p1 | tasks.d/p1-generator.md | impl | scripts/plan-intel.sh | |
| p2 | tasks.d/p2-assembler.md | impl | scripts/task-context.sh | p1 |
| p3 | tasks.d/p3-gate-wiring.md | impl | scripts/plan-lint.sh, scripts/factory/pipeline.mjs, .claude/skills/dev-flow-execute/SKILL.md, .claude/skills/references/dev-flow-plan-phases.md | p1, p2 |
| p4 | tasks.d/p4-tests.md | tests | tests/spec/dev-flow-plan/task-context.bats | p1, p2, p3 |

## Task: Rot-Grün-Anker

Der Failing-Test-Step liegt in p4 und läuft, bevor p1 bis p3 implementiert sind:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan/task-context.bats
# expected: FAIL — scripts/plan-intel.sh und scripts/task-context.sh existieren noch nicht
```

Erst wenn dieser Lauf rot ist, beginnt die Implementierung. Details in `tasks.d/p4-tests.md`.

## Task: Finale Verifikation

Nach Abschluss aller Partials:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan/task-context.bats
bash scripts/plan-lint.sh openspec/changes/task-context-channel/tasks.md
task test:inventory
bash scripts/health-goals-check.sh 2>&1 | grep G-AGENTIC09
```

Die Inventar-Regeneration ist Pflicht, weil p4 eine neue Test-Datei anlegt; das Ergebnis
(`website/src/data/test-inventory.json`) wird mitcommittet. Der Health-Goal-Wert muss 0 bleiben.

<!-- vitest: kein neuer Test nötig, weil dieser Change ausschliesslich Bash-Skripte und
Skill-Dokumentation berührt — keine Dateien unter website/src/lib oder website/src/pages/api. -->
