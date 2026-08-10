# Proposal: archive-deliverable-guard

## Why

On 2026-08-09, PR #3919 archived the change `fa-59-e2e-spec-positive-assertion` and merged
its delta into `openspec/specs/e2e-testing.md` — but the deliverable it described (the
positive `toBe(403)` assertion in `tests/e2e/specs/fa-59-systemtest-purge-endpoint.spec.ts`
plus two BATS guards) landed only later, in the still-open PR #3914. Verified by reproduction
against the actual merge order on `main`: commit `2d584d2b8` (`chore(plans): archive … [#3919]`)
is an ancestor of commit `8a58ab009` (`fix(e2e-testing): … [#3914]`) — the archive that declared
T002730 finished landed on `main` strictly before the code it described. Between those two
commits, `main` carried an SSOT spec claiming a fix that did not exist yet; the spec still had
the negative `not.toBe(404)` assertion the change was supposed to remove.

`scripts/openspec.sh archive` (`cmd_archive`, line 224) already refuses to run unless the
linked ticket's status is `done` or `archived` — a real, existing fail-closed guard. But that
guard checks a **status label**, not **content**. It cannot by itself detect that "done" was
recorded before the deliverable actually existed on the branch being archived from — exactly
the CLAUDE.md M10 case ("Deliverable-Check vor manuellem done/shipped"), except M10 is (a)
redactional only, not automated, and (b) scoped to manual ticket closures. It says nothing
about the archive command itself, which is a second, distinct point where a "done" ticket's
declared deliverable can be asserted without ever being checked.

## Relationship to T002824

T002824 (`half-archive-check-edge-case`, staged on `fix/half-archive-check-edge-case-T002824`)
hardens a related but different failure on the same archive path: a slug that exists
simultaneously under `openspec/changes/<slug>/` and `openspec/changes/archive/<date>-<slug>/`
because a session died mid-`archive` run. Its own "Angrenzend" section explicitly scopes T002813
out and names the mechanism this proposal implements: extend the `reap`/pre-commit style
structural-check pattern to "verifying declared touched_files/plan deliverables exist … after a
ticket transitions to done." This proposal builds on that pointer rather than re-deciding it,
but lands the check at a different call site (`cmd_archive` itself, not `reap`/pre-commit — see
"What" for why) because the failure mode is different: T002824 is about an interrupted local
session leaving two directories on disk; T002813 is about a *completed*, *pushed* archive
carrying a false completeness claim into the SSOT spec. Not a duplicate — no
`duplicate_of` link is proposed.

## What

Extend `cmd_archive` in `scripts/openspec.sh` with a **deliverable-presence check**, run
immediately after the existing ticket-status guard (same `if` block, same `.ticket`-file
lookup, no second network round-trip): reuse the ticket JSON `scripts/ticket.sh get` already
fetches for the status check, and additionally read its `touched_files` column.

**Why `touched_files` is the reliable source, not the plan's `## File Structure` prose or a
fresh git diff:** `touched_files` is already populated by `scripts/plan-touched-files.sh` at
`stage-plan` time from the plan's `## File Structure` section (T002446), and it is already
filtered there to plausible repo paths (tracked files, or new files whose parent directory
exists) — prose fragments and non-path entries (e.g. `deployment/arena-server in namespace
workspace-korczewski`) are dropped before the column is ever written. Re-parsing the plan's
prose a second time inside `cmd_archive` would duplicate that filtering logic and risk drifting
from it; reading the already-filtered column is cheaper and consistent with the one existing
convention in this repo for "what does a ticket's deliverable consist of."

**Why this can only be a graded signal, not a strict one:** a plan can legitimately evolve
between staging and merge — a file gets renamed or a task turns out unnecessary — without that
being a T002813-shaped bug. A guard that fails closed on any single missing path would be "a
guard that has to guess," which the ticket's own framing rules out as worse than no guard.
Three tiers, driven only by how much of the declared list is actually missing:

1. **`touched_files` empty/unset** — nothing machine-checkable exists. Print an advisory (same
   spirit as M10) pointing at the manual check; do not block.
2. **Some declared paths exist, some don't** — plausible drift (rename, dropped sub-task).
   Print a warning naming the missing paths; do not block.
3. **`touched_files` non-empty and *none* of the declared paths exist** — the specific
   T002813 shape: the entire deliverable is absent from the tree being archived. Refuse the
   archive (`die`), matching the existing guard's own fail-closed style and message format.

**Why `cmd_archive` and not `reap`/pre-commit (unlike T002824):** the check needs to run at
the moment the archive *decision* is made, against the exact working tree being archived from
— which is also the one place the ticket ID and its `touched_files` are already being read.
`reap` runs against `openspec/changes/` structure irrespective of any single change's ticket
and has no natural per-slug ticket lookup; retrofitting one there would duplicate the lookup
`cmd_archive` already performs. The pre-commit hook fires on every commit, most of which don't
touch `openspec/changes/archive/` at all, so it isn't the natural gate either. `cmd_archive` is
the single call site both `task openspec:archive` and the `/opsx:archive`-driven
`openspec-archive-change` skill already go through — extending it closes the gap for both
paths without adding a new call site to remember.

**Explicitly not attempted:** cross-referencing already-archived changes retroactively
against current `main` (scanning `openspec/changes/archive/**/tasks.md` and re-checking their
`touched_files` at every CI run). Rejected — an archived change's declared files legitimately
disappear over time via unrelated refactors, and a global historical scan would accumulate
false positives without bound as the archive grows. The guard is scoped to the moment of
archiving, where the signal is fresh and the false-positive risk (recent drift only) is bounded.

**CLAUDE.md M10 update:** extend the M10 paragraph in `CLAUDE.md` to note the archive path now
has a machine guard for the *total-absence* case (tier 3 above), while the manual-closure case
(tiers 1–2, and closures that never touch `cmd_archive` at all) remains the existing redactional
check. This is "both," not an either/or between redactional and machine guard — the manual
check still catches partial mismatches and closures outside the OpenSpec archive flow that no
automated check here can see.

_Ticket: T002813_
