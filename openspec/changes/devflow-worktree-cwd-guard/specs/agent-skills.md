## ADDED Requirements

### Requirement: dev-flow skills must not rely on the implicit Bash cwd for git operations

The dev-flow skill files (`dev-flow-plan/SKILL.md`, `dev-flow-execute/SKILL.md`,
`dev-flow-chore/SKILL.md` in `.claude/skills/` and their opencode counterparts
`opencode-flow-plan/SKILL.md`, `opencode-flow-execute/SKILL.md`,
`opencode-flow-chore/SKILL.md` in `.opencode/skills/`, plus the
`dev-flow-plan-phases.md` reference) MUST instruct every Bash invocation of git
(`git add`, `git commit`, `git push`) and git-using preflight scripts
(`preflight-pr-scope.sh`) to run either with an explicit `git -C <worktree>` or with
an explicit `cd` followed by a toplevel guard
(`git rev-parse --show-toplevel` equals the worktree path). Relying on the implicit
Bash cwd is forbidden — the cwd may point at the main checkout after previous
commands, and a bare `git commit` would then land on a foreign branch
(T002357-Falle, mishap T006367). Each affected file MUST carry the canonical phrase
`nie auf implizites cwd vertrauen` so the convention is verifiable by guard test.

#### Scenario: dev-flow-plan commit block uses git -C

- **GIVEN** the commit section of `.claude/skills/dev-flow-plan/SKILL.md`
- **WHEN** the section is inspected for its git invocation forms
- **THEN** the section shows `git -C <worktree>` (or an explicit cd plus toplevel guard) for add, commit and push
- **AND** the file contains the phrase `nie auf implizites cwd vertrauen`

#### Scenario: opencode-flow-execute preflight runs in the worktree cwd

- **GIVEN** `.opencode/skills/opencode-flow-execute/SKILL.md`
- **WHEN** the preflight-pr-scope.sh invocation is inspected
- **THEN** the invocation is preceded by an explicit cd+guard or uses `git -C`
- **AND** the file contains the phrase `nie auf implizites cwd vertrauen`

#### Scenario: guard test is red without the convention

- **GIVEN** the guard test `tests/spec/agent-skills/devflow-worktree-cwd-guard.bats`
- **WHEN** the canonical phrase is absent from any affected dev-flow skill file
- **THEN** the guard test fails (Positiv-Anker: the test is red until every file carries the phrase)
