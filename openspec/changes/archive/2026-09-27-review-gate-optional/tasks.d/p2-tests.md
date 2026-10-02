---
partial: p2-tests
role: tests
depends_on: [p1]
---

## Task 2: BATS guards for the optional review and the merge gate

Context. This partial updates three existing guard suites under `tests/spec/agent-skills/` for change `review-gate-optional` (ticket T900687) and regenerates the test inventory. It runs after p1. The suites check skill text with a source grep; that is the documented exception to output verification (T002448-M4) already declared in their headers, because the behavior exists only as skill text. The script tests in `automerge-preflight-check.bats` stay output tests against a `gh` stub and are not changed. BATS files are not covered by the S1 line-limit gate. The repo runner is `tests/unit/lib/bats-core/bin/bats`.

Target files:

- `tests/spec/agent-skills/review-gate-before-auto-merge.bats` (review-gate-before-auto-merge.bats)
- `tests/spec/agent-skills/automerge-preflight-check.bats` (automerge-preflight-check.bats)
- `tests/spec/agent-skills/dev-flow-lifecycle-contract.bats` (dev-flow-lifecycle-contract.bats)
- `components/website/src/data/test-inventory.json` (test-inventory.json, regenerated)

### Steps

1. **review-gate-before-auto-merge.bats.** Update the header comment: SSOT delta `review-gate-optional` (T900687), review is optional since the user decision of 2026-09-27. Keep the two Schritt 2 mandate tests unchanged. Replace the third test with a test named `T900687: Merge-Gate (Schritt 3.8) fordert Auto-Merge an, Review nur auf Zuruf` that extracts the section with `awk '/^## Schritt 3\.8: Merge-Gate/{flag=1; next} /^## /&&flag{exit} flag'` and asserts it contains `gh pr merge --auto`, `requesting-code-review`, `Orchestrator` and the word `Zuruf`. Add a test named `T900687: Merge-Gate deaktiviert aktives Auto-Merge nicht` asserting the same section does not contain `--disable-auto` and does contain `rc=1`. Add a test named `T900687: kein Pflicht-Review-Gate mehr in SKILL.md` asserting `grep -c "PFLICHT vor Auto-Merge"` on the skill file prints 0.
2. **automerge-preflight-check.bats.** Change only the integration test `T006366: Review-Gate (Schritt 3.8) fuehrt den Auto-Merge-Check vor dem Review aus`: rename it to `T006366: Merge-Gate (Schritt 3.8) fuehrt den Auto-Merge-Check aus` and switch its awk anchor to `/^## Schritt 3\.8: Merge-Gate/`. Leave every other test in the file unchanged.
3. **dev-flow-lifecycle-contract.bats.** In `execute orders review, phase chain, merge, then finalizer` rename to `execute orders merge gate, phase chain, merge, then finalizer` and compute the first marker from `grep -n "Merge-Gate" "$EXEC" | grep "^[0-9]*:## Schritt 3.8" | head -1 | cut -d: -f1` so it points at the 3.8 heading; the order assertion stays. In `contract keeps exception loop active until MERGED and re-enters gates` replace the last grep with `grep -q "phase-chain re-entry" "$CONTRACT"` and add `grep -q "only when the operator asks\|nur auf Zuruf" "$CONTRACT"`.
4. **RED run against the pre-change skill text.** The new assertions must fail against `origin/main`, which proves they are not vacuous. Create a detached scratch worktree of `origin/main`, copy the three changed suites into it and run them there:
```bash
RED=/tmp/claude-1000/review-gate-red && rm -rf "$RED"
git worktree add --detach "$RED" origin/main
cp tests/spec/agent-skills/review-gate-before-auto-merge.bats tests/spec/agent-skills/automerge-preflight-check.bats tests/spec/agent-skills/dev-flow-lifecycle-contract.bats "$RED/tests/spec/agent-skills/"
(cd "$RED" && tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/review-gate-before-auto-merge.bats tests/spec/agent-skills/automerge-preflight-check.bats tests/spec/agent-skills/dev-flow-lifecycle-contract.bats)
git worktree remove --force "$RED"
```
   expected: FAIL for the new T900687 tests, the renamed Merge-Gate integration test and both changed lifecycle tests. The unchanged Schritt 2 and script-behavior tests pass. Keep the failure lines as red evidence for the commit body.
5. **GREEN run in the branch worktree.**
```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/review-gate-before-auto-merge.bats tests/spec/agent-skills/automerge-preflight-check.bats tests/spec/agent-skills/dev-flow-lifecycle-contract.bats tests/spec/agent-skills/check-pr-automerge-fail-closed.bats
```
   Every test passes. `check-pr-automerge-fail-closed.bats` is included unchanged as a regression check on the untouched script and Pre-Flight.
6. **Regenerate the inventory and commit.** Regenerate `components/website/src/data/test-inventory.json` with `task freshness:regenerate`, then commit with explicit pathspecs:
```bash
git add tests/spec/agent-skills/review-gate-before-auto-merge.bats tests/spec/agent-skills/automerge-preflight-check.bats tests/spec/agent-skills/dev-flow-lifecycle-contract.bats components/website/src/data/test-inventory.json
git commit -m "test(T900687): guards for merge gate with optional review [T900687]"
```

**Acceptance criteria:**

1. The RED run against `origin/main` fails exactly on the new or changed assertions and the scratch worktree is removed afterwards.
2. The GREEN run of the four suites passes completely.
3. The script-behavior tests in `automerge-preflight-check.bats` and all of `check-pr-automerge-fail-closed.bats` are unchanged.
4. `test-inventory.json` is regenerated and committed together with the suites.
