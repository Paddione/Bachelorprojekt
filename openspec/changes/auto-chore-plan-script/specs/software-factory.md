## ADDED Requirements

### Requirement: Non-critical mishap bundles reach plan_staged without a human

The Software Factory SHALL provide `scripts/factory/auto-chore-plan.sh`, an executable that
takes a Mishap-Bundle ticket and carries it from `status=triage` to `status=plan_staged`
without human intervention: it derives slug and branch, seeds the OpenSpec change, has the plan
authored, gates it on `plan-lint`, calls `stage-plan` and pushes the branch.

The factory tick SHALL invoke it, so the step cannot be skipped by an agent that forgets it.
A procedure that exists only as prose in a skill file is skipped in practice — that is the
defect this requirement removes, not a hypothetical.

The script SHALL refuse to auto-plan a ticket whose `severity` is `major` or `critical`. Those
bundles carry `broken` or `security` entries and belong in front of a human.

`plan-lint` SHALL remain a hard gate: on failure the script SHALL NOT call `stage-plan`, the
ticket SHALL stay at `status=triage`, and the lint output SHALL be reported.

The branch name SHALL carry the ticket ID unchanged, including its uppercase `T`, while the
OpenSpec directory slug is lowercase. `.githooks/pre-commit` matches `T[0-9]{6,}`
case-sensitively, so a branch derived from the lowercase slug is rejected and the whole step
dies silently.

Commit and push SHALL be chained with `&&`, because a rejected commit does not prevent a push
issued on its own line.

`.claude/skills/mishap-tracker/SKILL.md` SHALL reference the script rather than restate the
procedure, so prose and code cannot drift apart.

#### Scenario: a minor bundle is planned and staged automatically

- **GIVEN** a Mishap-Bundle ticket at `status=triage` with `severity=minor`
- **WHEN** `bash scripts/factory/auto-chore-plan.sh <ext-id>` runs
- **THEN** the ticket reaches `status=plan_staged`, a `FACTORY-PLAN-REF` comment names branch
  and plan path, and the branch is pushed

#### Scenario: a major bundle is left for human triage

- **GIVEN** a Mishap-Bundle ticket at `status=triage` with `severity=major`
- **WHEN** the same command runs
- **THEN** the ticket stays at `status=triage`, nothing is pushed, and the reason is reported

#### Scenario: a lint failure does not stage a broken plan

- **GIVEN** a bundle whose authored plan fails `plan-lint`
- **WHEN** the script reaches the lint gate
- **THEN** `stage-plan` is not called, the ticket stays at `status=triage`, and the lint output
  is reported

#### Scenario: the branch name survives the pre-commit hook

- **GIVEN** ticket `T002382`
- **WHEN** the script derives its working branch
- **THEN** the branch is `chore/mishap-T002382` with an uppercase `T`, while the OpenSpec
  directory is `openspec/changes/mishap-t002382`
