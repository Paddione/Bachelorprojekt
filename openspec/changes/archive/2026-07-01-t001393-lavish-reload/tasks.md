---
title: "t001393-lavish-reload — Implementation Plan"
ticket_id: T001393
domains: [dev-flow, lavish, documentation]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t001393-lavish-reload — Implementation Plan

_Ticket: T001393_

## File Structure

```
.claude/skills/lavish/SKILL.md                    (edit — add "Reload Safety" H2 section)
.claude/skills/references/dev-flow-gotchas.md      (edit — add lavish reload cross-reference line)
tests/spec/lavish.bats                             (new — already added on this branch, red)
openspec/specs/dev-flow-plan.md                    (edit at archive time — merges the delta below)
```

## Context

Root cause and fix rationale are documented in
`docs/superpowers/specs/2026-07-01-t001393-lavish-reload-design.md`. Summary:
re-running `npx -y lavish-axi <html-file>` to check a layout-warning fix
reloads the existing browser tab. If the board contains an `input` playbook
form and the user has made a selection but not yet clicked submit, that
selection lives only in client-side DOM state — a reload wipes it silently.
Symptom observed in the T001373 M3 mishap: user says "ich habe geantwortet",
next `poll` still shows `prompts: []`.

`lavish-axi` is an external npm package (not vendored in this repo), so the
fix is a protocol/documentation change to `.claude/skills/lavish/SKILL.md`,
verified by the grep-based BATS spec already added on this branch
(`tests/spec/lavish.bats`, currently RED — 6/6 failing).

## Tasks

### Task 1 — Confirm the failing test is red (RED)

The failing-test step was already completed while staging this plan
(`tests/spec/lavish.bats` was added in the same commit). Re-run it to confirm
the red baseline before touching `.claude/skills/lavish/SKILL.md`:

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/lavish.bats
# expected: FAIL (6/6 tests fail — no "Reload Safety" section exists yet)
```

### Task 2 — Add the "Reload Safety" section to `.claude/skills/lavish/SKILL.md`

Insert a new `## Reload Safety` section (after `## Commands & rules`, or
directly below `## Workflow` — either placement satisfies the test, which
scans for any H2 whose header contains "Reload Safety"). The section body
MUST satisfy every scenario in
`openspec/changes/t001393-lavish-reload/specs/dev-flow-plan.md`:

- State explicitly that the agent must **never** trigger a reload
  (re-running `npx -y lavish-axi <html-file>`) while a `poll` call is still
  outstanding / has not yet returned.
- Require checking the most recent **poll result/status** before triggering
  the next reload.
- Name the **`input` playbook** / unsubmitted form-state risk as the reason:
  a radio selection made before clicking "Antwort senden" lives only in
  client-side DOM state until submit, so a reload during that window
  silently discards it.
- Instruct the agent to **explicitly warn the user** before triggering a
  risky reload when the board has an open `input`-playbook form with a
  possibly unsubmitted selection, and to ask for confirmation/re-submit
  before proceeding.
- Recommend applying layout fixes as a file edit first and folding the next
  reload into the already-due poll cycle instead of forcing extra ad-hoc
  reloads while a form is open (documents the design's Fix-Ansatz point 4;
  not separately test-asserted, but keep it for operator guidance).

Target file: `.claude/skills/lavish/SKILL.md` (~73 lines today; this task
adds ~15-20 lines — no S1 budget entry exists yet for this file in
`docs/code-quality/baseline.json`, confirm with:
`jq -r '."S1:.claude/skills/lavish/SKILL.md".metric // "nicht-baselined"' docs/code-quality/baseline.json`
— if unbaselined, the generic size-goal limit applies, not a ratchet-zero
budget).

### Task 3 — Cross-reference the rule from `dev-flow-gotchas.md`

Add one line under the existing Lavish/Brett-adjacent gotchas grouping in
`.claude/skills/references/dev-flow-gotchas.md` that mentions both "lavish"
and "reload" (matching the test's case-insensitive grep for either word
order), pointing readers to `.claude/skills/lavish/SKILL.md#reload-safety`
for the full rule. Keep it to a single bullet — this file is a reference
index, not the source of truth for the rule itself.

### Task 4 — Confirm GREEN

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/lavish.bats
# expected: all 6 tests PASS
```

If any scenario still fails, re-read the failing assertion's grep pattern in
`tests/spec/lavish.bats` and adjust the SKILL.md wording — do not weaken the
test.

### Task 5 — Final Verification (mandatory CI-equivalent gates)

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

All three must pass before opening the PR. `task test:changed` picks up the
new/changed `tests/spec/lavish.bats` and the two doc edits; no source code
paths are touched so no additional Vitest/Playwright suites are implicated.
