---
title: "plan-context-unmatched-domains — Implementation Plan"
ticket_id: T002614
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# plan-context-unmatched-domains — Implementation Plan

_Ticket: T002614 — Freie domains-Woerter in Proposals greifen im Rollenfilter ins Leere._

## File Structure

| Datei | Ist-Zeilen | Budget (.sh-Limit 800, keine Baseline) |
|---|---|---|
| `scripts/plan-context.sh` | 186 | 614 |
| `tests/spec/dev-flow-plan/domains-vocabulary.bats` | neu | kein S1-Scope für `.bats` |
| `openspec/changes/plan-context-unmatched-domains/specs/dev-flow-plan.md` | — | Delta-Spec (Parent-SSOT `dev-flow-plan`) |
| `website/src/data/test-inventory.json` | — | generiert, via `task test:inventory` |

`scripts/plan-context.sh` ist nicht in `docs/code-quality/baseline.json`
eingetragen; wirksame Schwelle ist das statische `.sh`-Limit 800. Die
Änderung addiert grob 15-25 Zeilen (Allowlist-Wörter, Selbst-Match, Union-
Vokabular, `--vocab`-Flag, WARN) — weit unter 80 % der Schwelle, kein Split
einzuplanen.

Der RED-Test liegt bereits auf dem Branch (mit diesem Plan committet) und ist
auf dem Pre-Fix-Skript rot — Rotlauf vor jedem Produktivcode reproduzieren
(Task 1). Das Design mit der Wort-Rollen-Mapping-Tabelle steht in
`design.md`; die Delta-Spec in `specs/dev-flow-plan.md` ist mit diesem Plan
befüllt (MODIFIED filter-by-role + ADDED anchor-requirement).

## Task 1 — RED: Rotlauf des Failing-Tests reproduzieren

Der Test `tests/spec/dev-flow-plan/domains-vocabulary.bats` ist mit diesem
Plan bereits committet und rot (6 von 8 Fällen schlagen auf dem Pre-Fix-Stand
fehl; die zwei Anker-Fälle sind absichtlich grün). Er baut seine Fixtures in
einem Wegwerf-Repo unter `$BATS_TEST_TMPDIR` und fasst nie den echten Korpus
an (Ausnahme: der Korpus-Guard, der nur liest).

- [ ] Rotlauf reproduzieren, bevor eine Zeile Produktivcode entsteht:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/dev-flow-plan/domains-vocabulary.bats
# expected: FAIL — 6 Faelle rot (Selbst-Match, Vokabular, WARN, Guard),
#           2 Anker-Faelle gruen (T002356 Positiv-Anker)
```

## Task 2 — GREEN: Fix in `scripts/plan-context.sh` + Delta-Spec

- [ ] `_role_allowlist()` erweitern (Mapping aus `design.md` §2):
  - `bachelorprojekt-test`: um `testing devflow plan-authoring ticket-mcp
    ticket-ops scripts ci-cd ci dev-tooling` ergänzen
  - `bachelorprojekt-infra`: um `deployment` ergänzen
  - übrige Rollen: unverändert (Selbst-Match deckt die Rollennamen ab)
- [ ] Union-Vokabular einmal pro Lauf berechnen (alle sechs
  Rollen-Allowlists plus alle sechs Rollennamen, sortiert/dedupliziert).
- [ ] Neuer Flag `--vocab`: bereits VOR der ROLE-Pflicht prüfen
  (`[[ "${1:-}" == "--vocab" ]]`), gibt die Union als Token-Liste auf stdout
  aus, Exit 0 — die WARN-Logik nutzt dieselbe Union intern.
- [ ] Selbst-Match-Regel in der Intersection-Prüfung: ein Domain-Token, das
  exakt `$ROLE` ist, matcht immer (vor dem Allowlist-`case`).
- [ ] Fail-loud: Ein Proposal, das exkludiert wird UND ungeankert ist
  (kein slash-freies Token in der Union), bekommt eine stderr-Zeile
  `WARN: proposal <slug> has domains [<liste>] matching no role allowlist —
  excluded for every role` (Slash-Token sind Pfad-Verweise und zählen nie
  als Anker). Bei `__ALL__` (`orchestrator`, unknown-role-Fail-Soft) keine
  WARN — dort wird nichts exkludiert. Legacy-Proposals ohne `domains:` und
  `domains: []` behalten ihr bestehendes Verhalten.
- [ ] Usage-Zeile im Kopf-Kommentar um `--vocab` ergänzen.
- [ ] Delta-Spec `specs/dev-flow-plan.md` inhaltlich prüfen (liegt bereits
  befüllt bei — MODIFIED filter-by-role mit Selbst-Match- und
  Vokabular-Szenarien, ADDED anchor-requirement mit vier Szenarien).

Rot-Grün-Schleife pro Teilschritt: nach jedem Teil die betroffenen
BATS-Fälle laufen lassen.

## Task 3 — GREEN-Verifikation, Inventory, finale Gates

- [ ] Neuer Test grün:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/dev-flow-plan/domains-vocabulary.bats
```

- [ ] Regression: bestehende Verträge (T001387 Filter, T002322
  Zusammenfassung) bleiben grün:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/plan-context.bats
```

- [ ] Test-Inventar regenerieren und `website/src/data/test-inventory.json`
  mitcommitten (CI-Inventar-Check failt sonst):

```bash
task test:inventory
```

- [ ] Finale Gate-Verifikation:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
