---
ticket_id: T002713
plan_ref: openspec/changes/find-changed-tests-empty-T002713/tasks.md
---

# Design: find-changed-tests-empty-T002713

## Root cause (measured, not hypothesized)

`scripts/find-changed-tests.sh:17`:

```bash
CHANGED="${FIND_CHANGED_TESTS_FILES:-$(git diff --name-only HEAD origin/main 2>/dev/null || git diff --name-only HEAD 2>/dev/null || true)}"
```

`git diff --name-only HEAD origin/main` is a **two-commit diff** — it never
inspects the working tree. It ignores uncommitted changes unconditionally,
whether or not `HEAD` happens to be fresh or stale relative to
`origin/main`. The trailing `|| git diff --name-only HEAD` fallback is
gated on the exit code of the first command; `git diff --name-only` exits 0
whether or not it produced output, so this fallback is unreachable except on
a hard `git` error (e.g. `origin/main` not resolvable).

Measured live in `.worktrees/find-changed-tests-empty-T002713` (2026-08-09):

- `git merge-base HEAD origin/main` = `5798c025`
- `HEAD` (`e4599e190`) = merge-base + 1 local commit
- `origin/main` (`097773fdb`) = merge-base + 2 upstream commits
- `git diff --name-only HEAD origin/main` → 4 files, none touched locally
- After touching 9 real `tests/spec/*.bats` files (uncommitted): `CHANGED`
  unchanged (still the same 4-file list) — the 9 edits never appear
- `git diff --name-only HEAD` (the unreachable fallback) → correctly shows
  all 9 files

This also explains the ticket's "Gegenprobe widerspricht" note: at the time
that was observed, the main checkout's `HEAD` was *also* behind
`origin/main`, and its 2-commit diff happened to include an unrelated
`tests/spec/` path — so it looked like a working selection while still not
reflecting the actual uncommitted edit under test. Both the "empty" and the
"found something" outcomes are artifacts of the same design flaw: the
primary diff source is commit-to-commit and structurally cannot see
uncommitted state.

## Decision

Replace the commit-to-commit primary source with a **single-ref diff**:

```bash
git diff --name-only origin/main
```

Per `git-diff(1)`, `git diff <commit>` (no second ref) compares `<commit>`
against the **working tree** (index + unstaged combined) — this is exactly
"everything different from origin/main, including anything not yet
committed." One git call replaces the two-call chain; no ordering/`||`
ambiguity remains for the common case.

Fallback when `origin/main` doesn't resolve (shallow clone, no
remote-tracking ref, detached checkout without a remote): `git diff
--name-only HEAD`, unchanged from today — still working-tree-based.

**Why not a union of both diffs (rejected):** more code, needs manual
dedup, and no scenario found where the single-ref diff misses something the
union would catch — `origin/main` already accumulates every ancestor of
`HEAD` up to the merge-base plus everything since, since it's compared
directly against the working tree rather than through `HEAD`.

**Provenance line (always emitted, stderr):**

```
find-changed-tests: diff-source=<origin/main|HEAD|override> files=<n>
```

`<n>` = raw entry count before the per-file classification loop (line 78+)
runs — i.e. "how many files did the diff basis actually return," not "how
many tests were selected." This directly answers the question this ticket's
"NÄCHSTER SCHRITT" asked for, without requiring another future
investigation to re-derive it from scratch. Emitted unconditionally
(including the true-empty case and the override case) so CI/local logs
always carry diff provenance.

**Untouched:** the per-file loop (script line 78 onward — direct `.bats`
candidates, script→test-name matching, RUN_ALL triggers, ancestor-dir
probing for spec) and the `FIND_CHANGED_TESTS_FILES` override contract
(T002518) both keep their existing behavior; only what feeds `CHANGED`
changes, and the override's label becomes `override` in the provenance
line.

## Edge cases considered

- **No `origin/main` remote-tracking ref:** `git diff --name-only
  origin/main` errors → `2>/dev/null` swallows it, `||` moves to the
  `HEAD` fallback (unchanged behavior, still exit-code-gated but now the
  first branch reliably signals success/failure via git's own resolution
  error, not via emptiness).
- **`TYPE=unit` vs `TYPE=spec`:** both share the same `CHANGED` computation
  (line 17) and were already parameterized purely by `BASE_DIR`/`TYPE`
  downstream (line 78+) — this fix touches only line 17, so unit's flat
  `RUN_ALL` collection and spec's recursive collection are unaffected.
- **`FIND_CHANGED_TESTS_FILES` override (T002518 test seam):** still checked
  first via `${FIND_CHANGED_TESTS_FILES:-...}` — no git command runs at all
  when set. `changed-tests-collection-parity.bats` keeps passing unmodified.
