## ADDED Requirements

### Requirement: LLM scope in commit allowlist

The commit-msg validator SHALL accept `llm` as a valid scope for conventional commits.

#### Scenario: chore(llm) commit is accepted

- **GIVEN** a commit message with scope `llm`
- **WHEN** the commit-msg validator checks the message
- **THEN** it SHALL accept the message without error

### Requirement: Verification block documents commit step

The verification-block reference SHALL document that generated artifacts must be committed between `regenerate` and `check`.

#### Scenario: Agent follows verification-block instructions

- **GIVEN** an agent reads the verification-block four-command list
- **WHEN** the agent executes regenerate → commit → check
- **THEN** `freshness:check` SHALL pass (not report stale artifacts)
