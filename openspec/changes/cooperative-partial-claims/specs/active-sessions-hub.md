## ADDED Requirements

### Requirement: File-scoped claims for plan partials

A session working on a plan partial SHALL be able to claim only the files that
partial declares, rather than the whole worktree. `agent-lock.sh claim` SHALL
accept a set of file paths on a claim and record it with the lock.

Because `plan-lint.sh` rule D1 already guarantees that no file appears in the
`target_files` of two partials, two file-scoped claims derived from the same plan
SHALL never overlap.

#### Scenario: Two sessions on disjoint partials of one plan

- **GIVEN** a plan whose `## Partials` manifest declares partial `p1` over file A
  and partial `p2` over file B
- **AND** session One holds a file-scoped claim covering file A
- **WHEN** session Two writes to file B in the same worktree
- **THEN** the write SHALL be allowed
- **AND** session Two SHALL be able to claim `p2` while `p1` remains claimed

#### Scenario: Second session reaching into a claimed partial

- **GIVEN** session One holds a live file-scoped claim covering file A
- **WHEN** session Two writes to file A
- **THEN** the write SHALL be refused
- **AND** the refusal SHALL name the holding session

#### Scenario: Claim without a file list

- **GIVEN** a live claim that records no file list
- **WHEN** another session writes anywhere under that claim's worktree
- **THEN** the write SHALL be refused, unchanged from the worktree-scoped
  behaviour that preceded this change

### Requirement: Write guard active in every harness

The worktree write guard SHALL be registered in every agent harness the repository
supports. A harness that dispatches file writes without the guard SHALL be treated
as a defect, not as an accepted variant.

#### Scenario: Auditing harness registration

- **WHEN** the harness registrations are enumerated
- **THEN** Claude Code, Codex, opencode and agy SHALL each invoke
  `scripts/hooks/worktree-write-guard.sh` before a file write

### Requirement: Single source for the git workflow

The repository SHALL hold exactly one authoritative description of the git
lifecycle (pull-first, commit conventions, freshness guard, commit verification,
PR scope preflight, CI fix loop, auto-merge, worktree cleanup) including the ORDER
of its steps. Per-harness copies SHALL reference that source rather than restate it.

#### Scenario: Harness-specific workflow document

- **GIVEN** a harness that needs the git workflow
- **WHEN** its skill is loaded
- **THEN** the content SHALL resolve to the single authoritative source
- **AND** SHALL NOT be an independently maintained copy that can drift from it
