---
ticket_id: T001242
title: Mishap-Bundle — dev-flow-plan Step 3.7, openspec.sh propose seeding, ticket.sh offline-mode
status: planning
date: 2026-06-27
---

# T001242 — Mishap-Bundle: dev-flow-plan, openspec.sh, scripts/ticket.sh

## Context (what broke)

Three mishaps observed in the last wave of dev-flow-execute runs, all rooted in
the same area: **the contract between the plan-lint gate and the artifacts that
feed it is not enforced anywhere a subagent can read it before guessing**.

| # | Component | Mishap |
|---|-----------|--------|
| 1 | `.agents/skills/dev-flow-plan/SKILL.md` (Step 3.7 prompt) | Subagent prompt omits the plan-lint hard rules → first plan draft fails 8 hard-fails, needs a manual correction round. |
| 2 | `scripts/openspec.sh` (propose seed) | `cmd_propose` seeds `tasks.md` as `# Tasks: <slug>` + one bullet. `plan-lint.sh` requires YAML frontmatter + `# <slug> — Implementation Plan` + `## File Structure` + a failing-test step → 11 hard-fails on a fresh change. |
| 3 | `scripts/ticket.sh` (and `openspec.sh` `cmd_archive` status-guard) | Cluster-only psql path: `kubectl exec ... psql`. If the runner has no `kubectl` (or no `~/.kube/config`), `_pgpod` fails or `psql` errors with `FATAL: role '<user>' does not exist` against the local unix socket. `tickets.ticket_plans` + `factory_phase_events` silently drop. |

## Root cause (one sentence)

Plan-lint is a hard gate, but its requirements are not embedded into the only
two places that can guarantee they are honored on the first pass — the
plan-author subagent prompt and the artifact seeder.

## Fix approach

### Mishap 1 — Augment the Step 3.7 subagent prompt

The current Step 3.7 prompt names the file path and CI gates, but does not
enumerate the plan-lint F1/F2/STRUCT/P1 hard rules. Add a `## plan-lint Hard
Rules (MANDATORY)` sub-block right after the existing "Kontext-Injektion"
list, listing the four required frontmatter keys, the `# … Implementation
Plan` H1 + `## File Structure` H2, the `expected: FAIL` step pattern, the
prose placeholder rule, and the three mandatory verify-task commands
(`task test:changed`, `task freshness:regenerate`, `task freshness:check`).

This is a documentation-only change in `.agents/skills/dev-flow-plan/SKILL.md`.
The fix is correct iff a fresh subagent reading only the prompt produces a
plan that passes `bash scripts/plan-lint.sh` on the first try.

### Mishap 2 — Make `openspec.sh propose` produce a plan-lint-ready tasks.md

Two viable shapes:

a) **Seed full skeleton**: `cmd_propose` writes a tasks.md that already
contains YAML frontmatter (title/ticket_id/domains/status), the
`# <slug> — Implementation Plan` H1, an empty `## File Structure` H2 with a
one-line comment, and a `## Task 0 — Verify (RED→GREEN)` step with
`expected: FAIL` + the three mandatory `task …` invocations. The plan-author
subagent then fills in the body. This is the same strategy the upstream
`openspec init` uses for its `tasks.md` template.

b) **Seed just the frontmatter + section headers**: the subagent still
authors the body, but the skeleton at least passes F1/F2/STRUCT1; STRUCT2 +
STRUCT3 still depend on the author (covered by Mishap 1 fix).

Choose **(a)**. It is the only one that guarantees a fresh change folder is
plan-lint PASS on `apply` (Step 6 of the dev-flow-execute flow) without
relying on the author remembering the rules. The seed body must be
deliberately minimal (1 step) so it does not conflict with the plan author.

### Mishap 3 — Add `TICKET_OFFLINE=1` to `scripts/ticket.sh` write paths

`scripts/openspec.sh` already honors `TICKET_OFFLINE=1` and skips the
cluster write. `scripts/ticket.sh` does not. When the runner cannot reach
`kubectl` (or cannot reach the cluster), `cmd_archive_plan` and `cmd_phase`
fail loudly with the kubectl/psql error, but `cmd_set_touched_files`,
`cmd_set_pipeline_slot`, and `cmd_release_slot` use the same `_exec_sql`
path and fail the same way.

Add the same `TICKET_OFFLINE` guard at the top of every write subcommand
(`cmd_archive_plan`, `cmd_phase`, `cmd_set_*`, `cmd_update_status`'s cluster
call, `cmd_inject`, `cmd_add_comment`'s cluster call, `cmd_add_pr_link`,
`cmd_grill`, `cmd_set_readiness_flag` equivalents, etc.). On
`TICKET_OFFLINE=1`, each subcommand prints a structured `OFFLINE: skipped
<op> for <id>` line and exits 0 — preserving the dev-flow-execute
"best-effort, never block" contract that the `|| true` fallbacks already
assume.

Reads (`cmd_get`, `cmd_get_attachments`, `cmd_list`, `cmd_get_injections`,
`cmd_retry_count`) must continue to fail loudly in `TICKET_OFFLINE=1` mode
because the dev-flow-execute read fallback chain explicitly needs the
cluster reachable to validate ticket state.

## Acceptance criteria (all three must be green in BATS)

1. **M1**: `tests/spec/dev-flow-plan-ticket-sh-mishaps.bats` reads
   `.agents/skills/dev-flow-plan/SKILL.md`, finds the Step 3.7 block, and
   asserts the prompt mentions the four F1 frontmatter keys (title,
   ticket_id, domains, status), the `## File Structure` section requirement,
   the `expected: FAIL` phrase, and the three mandatory
   `task test:changed` / `task freshness:regenerate` / `task freshness:check`
   verify-task commands.
2. **M2**: the same BATS file runs
   `OPENSPEC_ROOT=<tmp> TICKET_OFFLINE=1 bash scripts/openspec.sh propose <slug> --ticket T000000`
   in a sandbox and asserts `bash scripts/plan-lint.sh <tmp>/changes/<slug>/tasks.md`
   exits 0 (PASS). F2 (`domains`) is satisfied by a sane default
   (`["plan-authoring"]`); the other 10 hard-fails are eliminated by
   seeding the frontmatter + headers + a single verify step.
3. **M3**: the same BATS file invokes each cluster-writing subcommand
   (`archive-plan`, `phase`, `set-touched-files`, `set-pipeline-slot`,
   `set-scout-drift`, `add-comment`, `add-pr-link`, `inject`, `update-status`)
   with `TICKET_OFFLINE=1` and asserts the command exits 0 with a
   `OFFLINE: skipped <op>` line in stdout. Read subcommands (`get`,
   `get-attachments`, `list`, `get-injections`) are asserted to exit non-zero
   in the same mode (reads must still require the cluster).

## Out of scope

- The "DATABASE_URL/Port-forward-Pfad" alternative for `ticket.sh` is
  deferred to a follow-up ticket. The `TICKET_OFFLINE=1` guard is the
  minimum viable fix and matches the existing `openspec.sh` contract.
- Adding `archive_plan` / `record_phase_event` MCP tools is already done
  by T001211 (PR #2144). The fix here is the offline guard, not new MCP
  surface area.
- The Go-report_mishap enum gap (`process` type) is owned by T001211 Slice 1
  and stays there.

## Implementation order

1. Fix Mishap 1 (skill prompt) — one file edit.
2. Fix Mishap 2 (openspec.sh seed) — one function rewrite in `cmd_propose`.
3. Fix Mishap 3 (ticket.sh TICKET_OFFLINE) — guard insertion in ~9
   subcommands.
4. `task test:changed` — confirms the BATS file goes from FAIL (before
   fix) to PASS (after fix).
5. `task freshness:regenerate` + `task freshness:check`.
6. Open PR, auto-merge, deploy.
