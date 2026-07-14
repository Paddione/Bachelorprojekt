---
title: "factory-dryrun-mark-loop — Implementation Plan"
ticket_id: T001816
domains: [factory]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-dryrun-mark-loop — Implementation Plan

_Ticket: T001816_

## File Structure

```
tests/spec/software-factory.bats  (modified — new FA-SF-31 test asserting the
                                    DRY_RUN branch calls ticket.sh dryrun-mark)
scripts/factory/pipeline.js       (modified — DRY_RUN branch's Deploy-phase
                                    agent prompt now calls
                                    `ticket.sh dryrun-mark --id ${A.ticket_id}`
                                    before release-slot/update-status)
```

## Task 1: Confirm RED — regression test fails without the fix

expected: FAIL

```bash
bats tests/spec/software-factory.bats --filter "T001816"
```

This must show `FA-SF-31: DRY_RUN branch marks the ticket dry-run-checked
before requeuing (T001816)` as `not ok` before the fix — the DRY_RUN branch in
`scripts/factory/pipeline.js` does not yet call `ticket.sh dryrun-mark`, so
`guards.sh:guard_dryrun_ok()` keeps forcing `dry_run=true` forever for any
ticket that ever entered this branch (it never graduates to a real run).
(The test itself was already added in the plan-stage commit — this task just
re-confirms RED before applying the fix, per the red→green fix-path contract.)

## Task 2: Add the missing dryrun-mark call

In `scripts/factory/pipeline.js`, inside the `if (DRY_RUN) { ... }` block
(Deploy phase, the agent prompt that starts with `DRY RUN — do NOT push,
merge, or deploy...`), add a step calling
`bash ${REPO}/scripts/ticket.sh dryrun-mark --id ${A.ticket_id}` before the
existing `release-slot`/`update-status --status backlog` steps. This records
the ticket as dry-run-checked so the next scheduled tick's
`guard_dryrun_ok()` allows a real (non-dry-run) run instead of forcing
another preview.

## Task 3: Confirm GREEN — regression test passes

```bash
bats tests/spec/software-factory.bats --filter "T001816"
```

The test from Task 1 must now pass (`ok`).

## Task 4: Verify

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

`task test:changed` picks up `tests/spec/software-factory.bats` and
`scripts/factory/pipeline.js` via git diff. No `website/src/**` files
touched, so no Vitest task needed
<!-- vitest: kein neuer Test nötig, weil die Änderung reines Bash/Node-Skript
     der Factory-Pipeline betrifft, kein website/src-Code -->.
No new `k3d/*.yaml` or top-level `scripts/*.sh` created (S4 n/a — only an
existing `.js` file changed). No hardcoded brand-domain literals introduced
(S3 n/a). `scripts/factory/pipeline.js` diff is 2 net lines (one comment
tweak, one new command); `docs/code-quality/baseline.json` S1 budget check:
`jq -r '."S1:scripts/factory/pipeline.js".metric // "nicht-baselined"' docs/code-quality/baseline.json`
— well within any effective threshold for a 2-line net addition. After
`freshness:regenerate`, commit any regenerated files (e.g.
`openspec-status.json`) alongside this change if they differ.
