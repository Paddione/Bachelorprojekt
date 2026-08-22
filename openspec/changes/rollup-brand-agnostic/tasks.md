---
title: "rollup-brand-agnostic — Implementation Plan"
ticket_id: T013304
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# rollup-brand-agnostic — Implementation Plan

_Ticket: T013304_

## File Structure

```
scripts/factory/wakeup.sh                       — Rollup-Schritt aus der Brand-Schleife lösen (1× pro Tick)
scripts/ticket.sh                               — cmd_rollup_container: ROLLUP_CONTAINER_BRAND-Konstante, Header-Kommentar, --brand deprecaten
tests/spec/mishap-rollup/container-resolution.bats  — (falls wiedereinzug) Resolution brand-agnostisch
tests/spec/mishap-rollup/wakeup-single-run.bats — NEU: Generator läuft genau einmal pro Tick
```

## Tasks

1. RED: Test, der `rollup-container` ohne Brand-Kontext aufruft und pinnt, dass ein
   existierender offener Container zurückgegeben wird, egal welche `BRAND` in der
   Environment steht; plus Creation-Pfad: neue Container tragen `ROLLUP_CONTAINER_BRAND`.
2. GREEN: `cmd_rollup_container` umbauen (`--brand` ignorieren mit Hinweis, Konstante pinnen,
   Header-Kommentar zur absichtlich cross-brand Lane).
3. wakeup.sh: Rollup-Aufruf aus der `_mr_brand`-Schleife nehmen — genau eine Invokation,
   unmittelbar nach dem per-Brand Flush-Block.
4. Spike T013304-Follow-up: ticket-mcp get_ticket vs export_ticket_timeline Brand-Divergenz
   anhand T013107 reproduzieren (DB-Zeile vs. beide Endpoints), Ursache fixen oder als
   separates Ticket abspalten.
5. Final Verification: drei CI-Gates.

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
