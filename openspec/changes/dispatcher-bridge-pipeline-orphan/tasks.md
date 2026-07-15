---
title: dispatcher-bridge-pipeline-orphan
ticket_id: T001850
domains: [factory]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# dispatcher-bridge-pipeline-orphan — Implementation Plan

## File Structure

- `scripts/factory/watchdog.sh` (51 lines, nicht-baselined — no S1 budget constraint)
  — modified: conditional reset target based on `plan_ref`.
- `tests/local/FA-SF-26-watchdog.bats` — modified: new failing test case (already added
  in the plan-stage commit), asserts `status='backlog'` for a stale ticket that already
  carries a `FACTORY-PLAN-REF` comment.

## Task 1 — Reproduce: failing test confirms the bug (already committed)

`tests/local/FA-SF-26-watchdog.bats` now contains
`"FA-SF-26: a stale in_progress feature WITH a staged plan (FACTORY-PLAN-REF) is returned to
backlog, not triage [T001850]"`. Against current `watchdog.sh` (unconditional
`status='triage'` reset at line 19) this fails: `st=$(... | jq -r '.status')` reads `triage`,
the assertion `[ "$st" = "backlog" ]` fails.

- expected: FAIL
- Run: `bats tests/local/FA-SF-26-watchdog.bats -f "WITH a staged plan"` (requires
  `FACTORY_CTX` pointed at a dev cluster; skips otherwise — see `[ -n "${FACTORY_CTX:-}" ] ||
  skip` in the test file).

## Task 2 — Fix `watchdog.sh`: resume instead of restart when a plan already exists

In the per-ticket loop of `scripts/factory/watchdog.sh` (currently: unconditional
`bash "$HERE/../ticket.sh" update-status --id "$ext_id" --status triage`), before choosing
the reset status:

1. Read `plan_ref` the same way `pipeline.js`'s auto-detect does (scripts/factory/pipeline.js
   ~line 111-123): `plan_ref=$(BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash
   "$HERE/../ticket.sh" get --id "$ext_id" | jq -r '.plan_ref // empty')` and also capture
   `ticket_type=$(... | jq -r '.type')` (or read both from a single `ticket.sh get` call to
   avoid a second round-trip).
2. Choose the reset target:
   - `plan_ref` non-empty AND `ticket_type == 'feature'` → `--status backlog` (matches
     `queue.sh`'s `type='feature' AND status='backlog' AND lastenheft_locked=true` gate; the
     ticket was already locked before its original dispatch, so it re-qualifies immediately).
   - `plan_ref` non-empty AND `ticket_type == 'task'` → `--status plan_staged` (matches
     `queue.sh`'s `type='task' AND status='plan_staged'` gate).
   - `plan_ref` empty (no plan was ever staged) → `--status triage` (existing behaviour,
     unchanged).
3. Adjust the `add-comment` body to reflect which branch was taken, e.g. for the
   plan-exists case: `"Watchdog: pipeline stale > ${STALE_MIN}min (no phase progress write).
   Plan already staged (${plan_ref}) — resuming via ${target_status} instead of restarting
   from Scout."` — for the no-plan case, keep the current wording verbatim.
4. Do not touch `readiness`/`lastenheft_locked` — the lock is forward-only per the
   Pflichtenheft→Lastenheft design (`docs/superpowers/specs/2026-06-17-ticket-pflichtenheft-lastenheft-design.md`)
   and must survive the reset untouched.
5. Zombie-worktree cleanup (existing lines after the status/slot/comment calls) stays
   unconditional — a stale worktree gets removed either way; `pipeline.js`'s
   `REUSE`/`WORK_WT = ${slug}-reuse` path re-clones from the pushed branch on the next
   dispatch, so removing the local worktree is safe even in the resume case.

## Task 3 — Verify

Run the reproduction test again to confirm it now passes (green), then the full
mandatory verification block:

- `bats tests/local/FA-SF-26-watchdog.bats` (both the new and the pre-existing
  `FA-SF-26` cases must pass; `FACTORY_CTX` required — skip is acceptable in CI if no dev
  cluster is configured, but must be run manually against `k3d-mentolder-dev` before merge)
- `task test:changed`
- `task freshness:regenerate`
- `task freshness:check`
