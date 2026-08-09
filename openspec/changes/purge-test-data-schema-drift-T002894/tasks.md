---
title: "purge-test-data-schema-drift-T002894 — Implementation Plan"
ticket_id: T002894
domains: [db]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# purge-test-data-schema-drift-T002894 — Implementation Plan

_Ticket: T002894_

Root cause, evidence and the A-vs-B fix-direction weighing live in
`openspec/changes/purge-test-data-schema-drift-T002894/design.md` — read that first. Summary:
`tickets.fn_purge_test_data()` unconditionally `UPDATE`s `questionnaire_test_status` as its very
first statement, with no existence guard — unlike every other optional table the function
touches. That table does not exist on the local k3d dev `shared-db` (confirmed; it does exist on
fleet mentolder), so the function throws before any of its 12 sweep steps run, and
`purge_factory_test_data()` silently purges nothing. This plan implements Option A (defensive
`to_regclass` guard, matching the function's own established pattern) — see design.md for why
Option B (closing the schema drift itself via `migrations/`) is deferred to a follow-up ticket
pending T002647.

## File Structure

```
scripts/one-shot/purge-fn-v8.sql                                      (new)
tests/spec/e2e-test-infrastructure/purge-test-data-missing-table.bats (new — already written, RED)
website/src/data/test-inventory.json                                  (regenerated)
```

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED) — already committed.** The BATS test
      `tests/spec/e2e-test-infrastructure/purge-test-data-missing-table.bats` seeds a real
      `is_test_data=true` ticket via `seed_test_feature` (fixture library
      `tests/lib/factory-test-fixtures.sh`), asserts it exists (positive anchor, test 1), then
      calls `purge_factory_test_data "mentolder"` (which invokes
      `tickets.fn_purge_test_data()` against the real local k3d `shared-db`) and asserts the row
      is gone (test 2). Confirmed RED on the current branch — test 2 fails because the DB call
      returns non-zero (`relation "questionnaire_test_status" does not exist"`):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/e2e-test-infrastructure/purge-test-data-missing-table.bats
# expected: FAIL — test 2 ("fn_purge_test_data() raeumt die Zeile ab, obwohl
# questionnaire_test_status lokal fehlt") fails with `[ "$status" -eq 0 ]' failed,
# because tickets.fn_purge_test_data() currently aborts on the missing table before
# any DELETE runs. Test 1 (positive anchor) passes.
```

  Requires a reachable local k3d `shared-db` pod (context `k3d-mentolder-dev`, namespace
  `workspace`); the test's own `_skip_if_no_db` guard skips gracefully otherwise — CI/offline
  runs are unaffected.

- [x] **Step 1: Create `scripts/one-shot/purge-fn-v8.sql` (GREEN).**
      Copy `scripts/one-shot/purge-fn-v7.sql` to `scripts/one-shot/purge-fn-v8.sql` (same
      convention as the v5→v6 and v6→v7 bumps — see `openspec/changes/archive/2026-07-08-coaching-sessions-admin-ux/tasks.md`
      and `openspec/changes/archive/2026-08-02-e2e-testdata-leak/`). In the new file:

  1. Add one new guard variable next to the existing `has_*` declarations
     (`has_scores`, `has_answers`, … — see `design.md` for the full read of the current
     function body):
     ```sql
     has_qts BOOLEAN;
     ```
  2. Add one new probe next to the existing `information_schema`-based probes, using the same
     pattern already used for `has_qts_evidence` two lines below it in the current function:
     ```sql
     SELECT to_regclass('questionnaire_test_status') IS NOT NULL INTO has_qts;
     ```
  3. Wrap the existing Step-1 block (currently the unguarded
     `UPDATE questionnaire_test_status SET last_failure_ticket_id = NULL WHERE …`) in
     `IF has_qts THEN … END IF;` — no other change to that block's body.
  4. Bump the trailing `COMMENT ON FUNCTION tickets.fn_purge_test_data() IS '...'` string to
     `'... v8 (T002894): guards questionnaire_test_status against schema drift (table absent
     on local k3d dev).'` (same convention the v7 comment uses for its own bump).
  5. Leave every other line byte-identical to v7 — this is a single targeted guard addition, not
     a rewrite.

  `.sql` is not a gated extension in `docs/code-quality/gates.yaml` → `s1.limits`, so no S1
  budget applies to this new file.

- [x] **Step 2: Apply the migration to the local k3d dev DB and re-run the RED test (GREEN).**

```bash
POD=$(kubectl get pod -n workspace --context k3d-mentolder-dev -l 'app in (shared-db,shared-db-dev)' --field-selector status.phase=Running -o name | head -1)
kubectl exec -i "$POD" -n workspace --context k3d-mentolder-dev -c postgres -- \
  psql -U postgres -d website < scripts/one-shot/purge-fn-v8.sql

tests/unit/lib/bats-core/bin/bats tests/spec/e2e-test-infrastructure/purge-test-data-missing-table.bats
# expected: both tests pass now (GREEN) — the seeded row is gone after purge_factory_test_data.
```

  Apply the same file to fleet mentolder and fleet korczewski `shared-db` pods post-merge
  (`kubectl exec ... psql -U postgres -d website < scripts/one-shot/purge-fn-v8.sql`, context
  `fleet`, namespaces `workspace` / `workspace-korczewski`) so the deployed function stays in
  sync with the version applied locally — `CREATE OR REPLACE FUNCTION` is idempotent, matching
  the header convention of every prior `purge-fn-v*.sql`. Note this by hand in the PR description
  since it is a manual post-merge DB step, not something CI runs.

- [x] **Step 3: Regenerate the test inventory.**

```bash
task test:inventory
git status --porcelain website/src/data/test-inventory.json   # expect: new test listed
```

- [x] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Out of Scope

- Closing the schema drift itself (creating `questionnaire_test_status` and its 3 sister tables
  via a versioned entry in `migrations/`) — deferred to a follow-up ticket, to avoid colliding
  with the in-flight T002647 migration-runner work. See `design.md` "Fix-Richtung — abgewogen".
- Any change to `scripts/factory/mcp-server.mjs` — it was the observing call path in the original
  incident report, not the fault location.

## Abweichung vom Plan (Umsetzung 2026-08-09)

Der Plan sah **einen** `to_regclass`-Guard für `questionnaire_test_status` vor. Beim
RED→GREEN-Durchlauf gegen die lokale k3d-DB zeigte sich, dass die Drift breiter ist: 11 der von
der Funktion referenzierten Tabellen fehlen lokal. Weil PL/pgSQL Relationsbezüge pro Statement
zur Laufzeit auflöst, scheitert die Funktion immer nur an der jeweils nächsten fehlenden
Tabelle — der Befund war deshalb erst nach mehreren Durchläufen vollständig sichtbar.

Umgesetzt wurde daher:

1. `to_regclass`-Guards für **7** Tabellen statt einer (questionnaire_test_status,
   _assignments, _test_evidence, _test_fixtures, _templates, systemtest_failure_outbox,
   systemtest_magic_tokens), plus Verschärfung der bestehenden
   `has_scores`/`has_answers`/`has_src_assn_col`/`has_qts_evidence`-Guards um `has_assignments`,
   weil deren Unterabfragen `questionnaire_assignments` referenzieren.

2. **Schritt 12 (Customer-Sweep) auf dynamisches SQL umgebaut.** Der dort vorhandene Guard
   `NOT has_billing_inv OR NOT EXISTS (SELECT 1 FROM billing_invoices …)` hat nie geschützt:
   PostgreSQL löst Relationsnamen beim Parsen/Planen auf, also bevor der boolesche Ausdruck
   ausgewertet wird. Ein Kurzschluss kann eine fehlende Tabelle grundsätzlich nicht retten —
   der Guard muss den Text des Statements steuern. Weglassen der Klausel ist semantisch exakt
   (fehlt die Tabelle, ist die `NOT EXISTS`-Bedingung ohnehin TRUE) und macht den Sweep nicht
   aggressiver, was bei einem `DELETE FROM customers` der entscheidende Punkt ist.

Weiterhin **out of scope**: die Drift selbst zu schließen (fehlende Tabellen per `migrations/`
anlegen) — unverändert dem Folge-Ticket nach T002647 vorbehalten.
