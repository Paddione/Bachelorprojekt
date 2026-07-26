---
title: "mishap-t002240 — Implementation Plan"
ticket_id: T002240
domains: [test, plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t002240 — Implementation Plan

_Ticket: T002240_

Mishaps from the ticket-ops run on 2026-07-26 that concern the commit/push guard
rails and test stability. M1 and M3 are the same failure mode seen twice: a
pre-commit gate rejects the commit, the push in the same invocation runs anyway,
and an **empty branch** lands on the remote. M3 was reproduced live while staging
this very plan.

No file overlap with the sibling bundle T002239 — that one touches
`.githooks/post-merge`, `pre-commit-freshness.bats`, `website-core.bats`,
`worktree-create.sh` and `t002204-mishap-bundle.bats`; none of those appear here.

## File Structure

```
.githooks/pre-push                                   # M1 — warn on pushing a branch with no own commits
scripts/validate-commit-msg.sh                       # M1 — suggest the nearest valid scope
.claude/skills/mishap-tracker/SKILL.md               # M3 — slug/branch-name contract vs the branch check
tests/spec/t001356-git02-conventional-commit.bats    # M1 + M3 — regression tests (file exists, extend it)
tests/spec/software-factory.bats                     # M2 — flake instrumentation (file exists, extend it)
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Add the failing assertions to the existing spec
      files above — the BATS convention in CLAUDE.md forbids new ticket-numbered
      spec files, and both topics already have an owner:
      `t001356-git02-conventional-commit.bats` owns `validate-commit-msg.sh`, and
      `software-factory.bats` owns the `FA-SF-*` suite including FA-SF-72.

      For M1, assert that `validate-commit-msg.sh` emits a nearest-match suggestion
      when given an unknown scope that prefix-matches a valid one — e.g. `agents`
      against the valid `agent-guide`. For M3, assert that the slug/branch-name form
      the `mishap-tracker` skill prescribes actually satisfies the `pre-commit`
      branch check regex.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/t001356-git02-conventional-commit.bats
# expected: FAIL (red — neither the scope suggestion nor the slug contract exists yet)
```

- [ ] **M1 Fix-Step (GREEN) — a rejected commit must not leave an empty pushed branch.**
      Two sightings on 2026-07-26, both with `git commit` and `git push` as separate
      lines of one shell block rather than `&&`-chained. The commit was rejected by a
      pre-commit gate; the push ran regardless and published a branch pointing at the
      same commit as `main`:

          ✗ unknown scope 'agents': fix(agents): drop invented tool names …
           * [new branch]          fix/T002221-agent-tools-frontmatter -> …

      A PR from such a branch would be empty. Both times it was only caught by an
      immediate `git log --oneline -1`; an empty PR with green CI is the plausible
      failure that follows when nobody checks.

      Two independent improvements:

      *Guard.* `.githooks/pre-push` already runs (it regenerates freshness
      artifacts). Extend it to warn — or refuse — when the branch being pushed has
      no commits ahead of its upstream base. Pushing a branch with no own commits is
      practically always an accident.

      *Message.* `scripts/validate-commit-msg.sh` rejects an unknown scope with only
      a pointer to another command:

          ✗ unknown scope 'agents': …
          💡 Erlaubte Scopes: bash scripts/validate-commit-msg.sh scopes

      With 100+ valid scopes that is an unnecessary extra round trip. `agents` →
      `agent-guide` is a plain prefix match. Add a "did you mean" line via
      prefix/substring matching against the scope list.

- [ ] **M2 Fix-Step (GREEN) — FA-SF-72 is order-dependently flaky.**
      `FA-SF-72: eval.mjs --replay --dry-run records mode=replay and touches no LLM`
      failed in one full run of `tests/spec/software-factory.bats` and was green in
      isolation, green on `main`, and green in a second full run. The branch under
      test changed only `scripts/vda/ticket/update-status.sh` and two test files —
      not `eval.mjs` — so the failure is order- or state-dependent, not a regression.

      This matters now because **T002182 is putting all 132 `tests/spec/*.bats` behind
      a required check.** An order-dependent flake in that set turns from a rare
      annoyance into a merge blocker that strikes at random, and into an incentive to
      re-run red builds away instead of reading them.

      Suspicion, unverified: the test writes or reads shared state — a fixture file,
      a temp directory, an env var — that an earlier test in the same file
      influences. The name says "records mode=replay", which points at a written
      file.

      Start by measuring: run the file repeatedly and record the failure rate, then
      compare against a fixed order and against `--no-parallelize-within-files`.
      Once the shared state is identified, isolate it per test (own temp dir, own
      fixture copy) rather than adding a retry.

- [ ] **M3 Fix-Step (GREEN) — the mishap-tracker slug cannot satisfy the branch check.**
      `.githooks/pre-commit:117` requires an uppercase ticket ID in the branch name:

          [[ "$_bn" =~ T[0-9]{6,} ]] && _has_ticket=1

      The regex is case-sensitive. `mishap-tracker`'s Step 3.5 prescribes the
      opposite:

          slug="mishap-$(echo "<ext-id>" | tr '[:upper:]' '[:lower:]')"

      That yields `chore/mishap-t002239` with a lowercase `t`, which the check
      rejects — so Step 3.5 can never complete as written. Reproduced live on
      2026-07-26 while staging T002239; the commit was rejected and, per M1, an empty
      branch reached the remote. Worked around by renaming the branch to
      `chore/mishap-T002239` (uppercase ID) while keeping the change directory slug
      lowercase, then re-running `stage-plan` with the corrected branch.

      Fix the skill so the two agree: keep the directory slug lowercase (it matches
      the `openspec/changes/<slug>` convention) but derive the **branch name** with
      the ticket ID unchanged. Encode it explicitly so the next reader cannot fall
      into the same trap, and add the assertion from the RED step so a future edit
      to either the hook regex or the skill breaks a test instead of a session.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
