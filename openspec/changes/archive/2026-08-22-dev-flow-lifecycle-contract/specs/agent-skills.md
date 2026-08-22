## ADDED Requirements

### Requirement: Shared dev-flow lifecycle contract

The four project flow skills (`dev-flow-plan`, `dev-flow-execute`, `dev-flow-e2e`, and
`dev-flow-chore`) SHALL reference one shared lifecycle contract that defines their entry state,
exit state, owner, next handoff, and common worktree/PR/cleanup invariants. Each skill SHALL keep
its domain-specific decisions and gates while delegating repeated mechanics to the existing
reference SSOTs.

#### Scenario: An agent follows a cross-skill handoff

- **GIVEN** one dev-flow skill reaches its declared exit state
- **WHEN** the agent selects the documented next skill
- **THEN** the next skill's entry state matches the predecessor's exit state
- **AND** branch, ticket, worktree and PR ownership do not need to be inferred from duplicated prose

### Requirement: Execute role and gate ordering

`dev-flow-execute` SHALL present Implementer, Orchestrator and Finalizer responsibilities as an
explicit role handoff. The Orchestrator SHALL complete independent review and a fail-closed
`assert-phase-chain` check before requesting auto-merge. After auto-merge is requested, a fresh
Finalizer SHALL own merge waiting and idempotent post-merge finalization; the Orchestrator SHALL
retain the CI exception loop that sends failures to the existing Implementer until the pull
request is confirmed `MERGED`. The loop SHALL handle failures and conflicts that appear after an
earlier green snapshot or after a corrective push, and SHALL repeat all invalidated review,
phase-chain and CI gates before considering the pull request merge-ready again.

#### Scenario: A green PR cannot merge ahead of the phase gate

- **GIVEN** the Implementer has created a pull request and independent review has approved it
- **WHEN** the Orchestrator prepares auto-merge
- **THEN** `assert-phase-chain` completes successfully before `gh pr merge --auto --squash`
- **AND** a missing required phase prevents the auto-merge request

#### Scenario: CI fails after finalization was delegated

- **GIVEN** auto-merge is requested and a fresh Finalizer is waiting for the merge
- **WHEN** a required CI check fails or the PR becomes conflicting
- **THEN** the Orchestrator sends the failure to the already spawned Implementer
- **AND** the Finalizer does not close the ticket before the PR is confirmed merged

#### Scenario: A later check or main update invalidates an earlier green state

- **GIVEN** all observed required checks were green but the pull request is not yet merged
- **WHEN** a later check fails, a corrective push starts replacement checks, or `main` advancement makes the pull request `DIRTY` or `CONFLICTING`
- **THEN** the Orchestrator re-enters the CI/conflict fix loop with the existing Implementer
- **AND** repeats every review, phase-chain or CI gate invalidated by the new commit before waiting for merge again

### Requirement: E2E follows the test-only Chore lifecycle

`dev-flow-e2e` SHALL own Playwright-specific discovery and verification but SHALL use the
test-only Chore/Git lifecycle for repository mutations. E2E-only work SHALL use a ticketed
`chore/*` branch and a pull request; the skill SHALL NOT prescribe a direct push to `main` or a
`feature/*` branch for test-only changes.

#### Scenario: Post-deploy E2E coverage is added

- **GIVEN** a deployed feature needs a new Playwright specification
- **WHEN** `dev-flow-e2e` creates only test and generated inventory changes
- **THEN** it uses the test-only Chore worktree/branch contract
- **AND** Playwright execution, optional headed verification and live-environment constraints remain owned by `dev-flow-e2e`

### Requirement: Progressive disclosure preserves safety contracts

The four dev-flow skill bodies SHALL avoid duplicating executable procedures and incident
narratives already owned by references, while preserving all existing fail-closed safety
contracts for worktree isolation, SID propagation, git-crypt staging, Freshness, independent
review, CI watching, merge confirmation and cleanup.

#### Scenario: Skill prose is slimmed without weakening a guard

- **GIVEN** a normative rule is removed from an individual skill body
- **WHEN** the rule is already owned by a referenced SSOT
- **THEN** the skill retains a concise operator-facing contract and a link to that SSOT
- **AND** regression tests prove that the safety invariant remains discoverable and enforceable
