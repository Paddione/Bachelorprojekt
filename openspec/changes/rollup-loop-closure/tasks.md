---
title: "rollup-loop-closure — Implementation Plan"
ticket_id: T013305
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# rollup-loop-closure — Implementation Plan

_Ticket: T013305_

## File Structure

```
scripts/factory/rollup-recurrence.sh            — NEU: Rezurrenz-Suche über Container-Batch-Kommentare (SQL)
scripts/factory/rollup-plan-tasks.sh            — Dispositions-Vokabular erweitern (beobachten bis Zyklus N), ×N-Rendering
scripts/factory/rollup-carryover.sh             — Watchlist-Re-Inclusion + Carryover-Zähler ≥2 → Eskalation
scripts/factory/mishap-rollup.sh                — Eskalations-Promotion vor dem Staging (ticket.sh create --needs-human-Äquivalent)
tests/spec/mishap-rollup/recurrence-tag.bats    — NEU
tests/spec/mishap-rollup/watchlist-disposition.bats — NEU
tests/spec/mishap-rollup/escalation-rule.bats   — NEU
```

## Tasks

1. RED: recurrence-tag.bats — zwei Batches mit gleichem Component+Titel in Container-Kommentaren
   seeded, Generator-Lauf rendert `×2` mit Vorzyklus-Referenz; Erstvorkommen ohne Marker.
2. GREEN: rollup-recurrence.sh + Rendering in rollup-plan-tasks.sh.
3. Watchlist: Template-Tabelle um `beobachten (bis Zyklus <N>)` erweitern; Parser für
   Dispositionszeilen vergangener Pläne; Re-Inclusion im Generatorlauf; Ablauf → Eskalation.
4. Eskalation: Carryover-Zähler (Consecutive-Open-Zyklen) bestimmen, Promotion in eigenes
   Ticket mit Zyklen-Historie, Aussortieren aus dem Batch.
5. Sequencing-Gate: Change erst mergen, wenn kein Rollup-Zyklus mid-flight ist
   (T013107-Abhängigkeit im Ticket notiert).
6. Final Verification: drei CI-Gates.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Add the BATS test that reproduces the
      bug. The test must FAIL on the current branch. Use the phrase
      `expected: FAIL` in the step body so plan-lint STRUCT2 picks it up.

```bash
# Example: run the BATS test the author will add in their first task
# (eigene Datei unter tests/spec/<spec-slug>/<kurz-slug>.bats, T002416)
tests/unit/lib/bats-core/bin/bats tests/spec/mishap-rollup/
# expected: FAIL (red — the fix is not yet implemented)
```

- [ ] **Fix-Step (GREEN).** Implement the fix. The BATS test from the
      previous step must now pass.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
