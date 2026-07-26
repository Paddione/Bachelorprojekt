# Proposal: t002186-ci-watch

## Why

`scripts/devflow-ci-watch.sh` reports "✅ Alle CI-Checks grün" (exit 0) even when zero
check-runs exist for the commit. This is not fail-closed — it actively misleads the merge
pipeline into thinking CI passed when no CI ran at all.

Observed during T002162 / T002174: a PR with `mergeStateStatus=CONFLICTING` had zero
check-runs for ~35 minutes, yet `devflow-ci-watch.sh` returned exit 0.

## Changes

1. **Zero-check detection**: Before the success check, query `gh api .../check-runs` for
   total count. If `total_count == 0`, exit with code 5 and message "Keine CI-Checks
   gefunden — CI läuft möglicherweise noch oder wurde nie gestartet."

2. **Count-aware success message**: Replace "✅ Alle CI-Checks grün." with
   "✅ $TOTAL_CHECKS CI-Checks, alle grün."

3. **mergeStateStatus CONFLICTING preflight**: Add a preflight check that exits with code 4
   (already exists as mergeable=CONFLICTING guard, but also check early for CONFLICTING via
   mergeStateStatus before entering the poll loop).

4. **Regression test**: Add BATS test in `tests/spec/ci-cd.bats` that validates the 0-checks
   case.

## Trade-offs

- Minimal. The fix is defensive — changes only the gate logic and messaging.

## Risks

- None.
