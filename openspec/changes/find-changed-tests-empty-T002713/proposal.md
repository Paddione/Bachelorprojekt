---
ticket_id: T002713
domains: [test]
status: planning
---

# Proposal: find-changed-tests-empty-T002713

## Why

`scripts/find-changed-tests.sh` computes its primary `CHANGED` file list via
`git diff --name-only HEAD origin/main`. This is a **commit-to-commit** diff —
it compares two refs and never looks at the working tree. Consequently it is
structurally blind to uncommitted (staged or unstaged) edits, regardless of
whether the local branch is fresh or stale relative to `origin/main`.

The `||` in `git diff --name-only HEAD origin/main 2>/dev/null || git diff
--name-only HEAD 2>/dev/null || true` is gated on the **exit status** of the
first `git diff`, not on whether its output is empty. `git diff --name-only`
always exits 0 (success) whether or not there are differences, so the
working-tree-aware fallback (`git diff --name-only HEAD`, second in the
chain) is unreachable in practice — it only fires if the first `git`
invocation itself errors (e.g. missing `origin/main`).

Reproduced live (2026-08-09) in `.worktrees/find-changed-tests-empty-T002713`:
HEAD was 1 commit ahead of the merge-base while `origin/main` had advanced 2
commits past it. `git diff --name-only HEAD origin/main` returned a
non-empty but **irrelevant** 4-file list (unrelated commits, coincidentally
including one incidental `tests/spec/software-factory/*.bats` path). After
touching 9 real `tests/spec/*.bats` files (uncommitted), `CHANGED` still only
reflected the same stale 4-file list — the 9 uncommitted edits never
appeared. Only `git diff --name-only HEAD` (the fallback that never runs)
captured them (verified: 9 files).

This also resolves the ticket's open "Gegenprobe" contradiction: the main
checkout that appeared to "find a selection" was, at that moment, *also*
stale relative to `origin/main`, and its primary diff coincidentally
included an unrelated `tests/spec/` path — creating the illusion of a
working selector while still ignoring the actual uncommitted edit. Whether
the bug looks like "empty" (exit 0, "No matching spec tests") or "found
something" is just luck of what happens to differ between local HEAD and
`origin/main` at that moment — neither reflects the real uncommitted diff.

A selector that silently reports "nothing changed" while files are actually
changed but unseen is worse than a hard failure: local pre-commit runs
(`task test:spec:changed`) look complete while doing nothing, and the gap
only shows up later in CI.

## What

1. **Diff-basis fix:** replace the commit-to-commit primary source with a
   single-ref diff against `origin/main` (`git diff --name-only origin/main`),
   which — per `git-diff(1)` — compares the named commit against the
   **working tree** (index + unstaged), not against another commit. This
   captures both committed drift since `origin/main` *and* uncommitted
   local edits in one call, with no dependency on `HEAD` at all. Fallback
   (no `origin/main` remote-tracking ref, e.g. shallow/detached checkout)
   stays `git diff --name-only HEAD` — still working-tree-based.
2. **Provenance/debug line:** the script always emits one line to stderr
   naming which diff source produced `CHANGED` and how many raw entries it
   contained (`origin/main`, `HEAD`, or `override` when
   `FIND_CHANGED_TESTS_FILES` is set) — regardless of whether the resulting
   selection later ends up empty. This removes the need for runtime
   speculation the next time this is investigated (the exact gap this
   ticket's "NÄCHSTER SCHRITT" called out).
3. **Existing seams preserved:** the `FIND_CHANGED_TESTS_FILES` override
   (T002518, used by `changed-tests-collection-parity.bats`) keeps working
   unchanged — it still short-circuits the diff computation entirely, only
   the source label changes to `override`. The per-file classification loop
   (script line 78 onward: direct bats candidates, script→test-name
   matching, RUN_ALL triggers, spec ancestor-dir probing) is untouched; only
   what feeds `CHANGED` into it changes.

## Non-Goals

- Not changing RUN_ALL trigger conditions, spec probing, or the unit-vs-spec
  collection asymmetry (T002518) — those are working as designed.
- Not adding a new CLI flag; the fix changes the default diff basis only.

_Ticket: T002713_
