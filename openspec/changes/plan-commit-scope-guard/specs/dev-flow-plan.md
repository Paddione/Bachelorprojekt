## ADDED Requirements

### Requirement: plan-lint validates commit-scope prescriptions against the named-scope allowlist

Plans SHALL only prescribe conventional-commit headers with a valid scope. Because the
commit-msg hook validates scopes only at commit time — after a plan has already been followed —
`scripts/plan-lint.sh` SHALL validate every `type(scope):` occurrence in the plan file
(`tasks.md` and, in partial mode, every `tasks.d/*.md`) as a hard rule (P2): the scope MUST be in
the named-scope allowlist of `commitlint.config.cjs`, loaded via
`scripts/validate-commit-msg.sh scopes` (no duplicate list), or match the always-allowed
patterns `^T\d{6}$` (ticket scope) or `^G-[A-Z][A-Z0-9]+$` (health-goal scope,
commitlint.config.cjs:66–67). Any occurrence with an invalid scope SHALL fail plan-lint with
exit 1, naming the scope and the offending line. Lines that generate test-fixture input via a
file redirect (`>` — e.g. `printf 'chore(openspec): …' > /tmp/msg.txt`) SHALL be exempt: they
intentionally produce invalid commit messages as hook-test data and are not prescriptions.

<!-- bats: plan-commit-scope-guard.bats -->

#### Scenario: Commit prescription with an invalid scope fails plan-lint *(BATS)*
- **GIVEN** a plan whose task prescribes `git commit -m "fix(openspec-embed): …"`
- **WHEN** `bash scripts/plan-lint.sh <plan>` runs
- **THEN** the exit code is 1 and the output names the invalid scope `openspec-embed`

#### Scenario: Commit prescription with a valid named scope passes *(BATS)*
- **GIVEN** a plan whose task prescribes `git commit -m "fix(scripts): …"`
- **WHEN** `bash scripts/plan-lint.sh <plan>` runs
- **THEN** the exit code is 0 (positive anchor)

#### Scenario: Ticket and health-goal scopes pass plan-lint *(BATS)*
- **GIVEN** a plan prescribing `chore(T004896): …` and one prescribing `fix(G-AGENTIC01): …`
- **WHEN** `bash scripts/plan-lint.sh <plan>` runs
- **THEN** the exit code is 0

#### Scenario: Test-fixture input line does not trigger P2 *(BATS)*
- **GIVEN** a plan containing `printf 'chore(openspec): …\n' > /tmp/msg-t003139.txt` (hook-test
  fixture, not a prescription)
- **WHEN** `bash scripts/plan-lint.sh <plan>` runs
- **THEN** the exit code is 0 (no false alarm)
