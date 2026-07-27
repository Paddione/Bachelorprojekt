# mishap-ci-scripts

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu mishap-ci-scripts ergänzen._

## Requirements

### Requirement: devflow-ci-watch regenerates freshness artifacts after an auto-rebase

`scripts/devflow-ci-watch.sh` SHALL run `task freshness:regenerate` between its automatic
`git rebase origin/main` and the following `git push --force-with-lease`, and SHALL commit the
result when the regeneration produces a diff. The rebase moves HEAD onto a new base, so every
generated artifact snapshot (`website/src/data/openspec-status.json`,
`docs/code-quality/repo-index.json`, `website/src/data/test-inventory.json`, …) can be stale
against that base; pushing without regenerating makes the CI freshness gate fail on a branch the
script itself just updated.

#### Scenario: auto-rebase branch regenerates before pushing

- **GIVEN** `devflow-ci-watch.sh` observes `mergeStateStatus=DIRTY` and rebases onto `origin/main`
- **WHEN** the rebase succeeds and the script prepares the force-push
- **THEN** it SHALL invoke `task freshness:regenerate` before `git push --force-with-lease`
- **AND** it SHALL create an additional commit (never `--amend`) when the working tree is dirty afterwards

### Requirement: plan-archive-steps step 4 stages the regenerated openspec status map

Step 4 of `.claude/skills/references/plan-archive-steps.md` SHALL call `task freshness:regenerate`
before its `git add` and SHALL stage `website/src/data/openspec-status.json` explicitly.
`scripts/openspec.sh archive` rewrites that file when it moves the change directory, so an archive
commit that stages only the moved files carries the pre-archive slug and status and fails the CI
freshness gate.

#### Scenario: archive commit carries the post-archive status map

- **GIVEN** an agent follows the copy-paste bash block in step 4 of `plan-archive-steps.md`
- **WHEN** the block reaches its `git add`
- **THEN** `task freshness:regenerate` SHALL already have run
- **AND** `website/src/data/openspec-status.json` SHALL be among the staged paths

### Requirement: ticket status writes respect a foreign agent-lock claim

`scripts/vda/ticket/update-status.sh` SHALL consult `scripts/agent-lock.sh check ticket <id>`
before it mutates a ticket status, and SHALL refuse the write when the lock is held by another
session. Without the guard any session can silently overwrite the status of a ticket another
session holds, which is how T002270 regressed from `done` back to `awaiting_deploy`.

#### Scenario: write against a foreign claim is refused

- **GIVEN** ticket `T000123` is claimed by another session via `agent-lock.sh`
- **WHEN** a second session runs `ticket.sh update-status --id T000123 --status done`
- **THEN** the write SHALL be refused with a message naming the holding session
- **AND** the ticket status SHALL remain unchanged

#### Scenario: explicit override bypasses the guard

- **GIVEN** an automation path has already gated the dispatch via `agent-lock.sh check`
- **WHEN** it runs the status write with `TICKET_LOCK_OVERRIDE=1`
- **THEN** the guard SHALL be skipped and the write SHALL proceed

<!-- merged from change delta mishap-ci-scripts.md (42ea05cc63ed) -->