# Proposal: fix-devflow-ciwatch-cwd-head

## Why

`scripts/devflow-ci-watch.sh` is the merge-readiness gate: it polls CI checks on a PR and reports
"✅ … alle grün" when all checks pass. On 2026-08-11, it reported green on PR #4227 (T003550) while
9 of its 18 checks were still `IN_PROGRESS` — it counted and approved 27 checks belonging to
`main`'s HEAD (`5941ea331`) instead of the PR's headRefOid.

Three independent bugs cause this:

1. **Line 74 — PR argument ignored:** `gh pr checks --watch --interval 15` is called **without**
   `$PR_URL`. When run from a checkout without an active PR (e.g. `main`), the command fails
   immediately and `|| true` swallows the error. No actual waiting occurs.

2. **Line 90 — cwd-HEAD instead of PR-headRefOid:** `TOTAL_CHECKS` is derived from
   `$(git rev-parse HEAD)`, which is the HEAD of the working directory, not the PR's `headRefOid`.
   The count it reports belongs to a different commit entirely.

3. **Line 96 — IN_PROGRESS indistinguishable from success:** The green-path condition
   `if [[ -z "$FAILED_CHECKS" ]]` checks only the *absence* of `conclusion=FAILURE|TIMED_OUT`.
   A check with `status=IN_PROGRESS` has no `conclusion` and is therefore indistinguishable from
   a passed check. When bug 1 prevents the blocking `--watch` from actually waiting, bug 3 lets
   partially-complete CI suites pass as "all green".

Without this fix, `devflow-ci-watch.sh` can signal merge-readiness for PRs whose CI has not
finished — the same class of error described in `repo-hygiene-ops.md` §3 ("ein leeres Signal ist
kein Urteil") and foreshadowed in `dev-flow-gotchas.md` line 46.

_Ticket: T003612_
