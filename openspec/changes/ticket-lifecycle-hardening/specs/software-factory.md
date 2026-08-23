## MODIFIED Requirements

### Requirement: Batch-PR closure resolves delivered child tickets from the PR title

The post-merge closure (`scripts/factory/auto-close-merged.sh`) SHALL derive two distinct
ticket roles from the merged PR title: the parent from square-bracket notation `[T……]`, and
the delivered children from round-bracket notation `(T……,T……)`. All resolved tickets SHALL be
closed using the existing resolution derivation, so that a batch PR no longer leaves its
delivered children open.

Round brackets are the authoritative delivery record because they state what the PR actually
shipped, whereas `child_of` links state planning intent and diverge whenever a batch spans
multiple PRs.

**ID-reuse defense (incident T015005):** Before closing any resolved external_id, the
closure SHALL corroborate that the merged PR actually belongs to THAT ticket row. A
candidate is corroborated when at least one of:

1. the ticket's persisted `plan_ref` contains `branch=<b>` and `<b>` equals the PR's
   head branch, or
2. an explicit ticket↔PR link (`tickets.ticket_links`, `kind='pr'`) connects the
   ticket to the PR number.

A candidate that cannot be corroborated SHALL be skipped with a warning on stderr and
MUST NOT be closed — after a delete/sequence-reuse event the external_id may point at
an unrelated newer row.

#### Scenario: Batch PR closes parent and all children named in round brackets

- **GIVEN** a merged PR titled `feat(ci): Batch CI/Check-Auswertung Fixes (T003109,T002815,T002922) [T003540]`
- **AND** each named ticket is corroborated (plan_ref branch matches the PR head branch)
- **WHEN** the post-merge closure processes the merge
- **THEN** `T003540` is closed as the parent
- **AND** `T003109`, `T002815` and `T002922` are closed as delivered children

#### Scenario: Partial delivery closes only the children the title names

- **GIVEN** a merged PR titled `feat(scripts): Batch Git/Worktree-Integritaet — P1 worktree-health (T002994,T002995,T002998) [T003539]`
- **AND** the batch parent `T003539` has seven `child_of` children in the database
- **AND** every named ticket is corroborated
- **WHEN** the post-merge closure processes the merge
- **THEN** only `T002994`, `T002995` and `T002998` are closed
- **AND** the four children absent from the title remain open

#### Scenario: Single-ticket PR is unaffected

- **GIVEN** a merged PR titled `fix(ci): preflight-pr-scope matcht ALLE Ticket-IDs im PR-Titel [T003103]`
- **AND** the ticket is corroborated
- **WHEN** the post-merge closure processes the merge
- **THEN** `T003103` is closed
- **AND** no additional ticket is closed

#### Scenario: Round brackets without ticket IDs close nothing extra

- **GIVEN** a merged PR titled `fix(ci): repariere (endlich) den Watcher [T001234]`
- **AND** the ticket is corroborated
- **WHEN** the post-merge closure processes the merge
- **THEN** `T001234` is closed
- **AND** no additional ticket is closed

#### Scenario: Un-corroborated external_id is skipped instead of closed

- **GIVEN** a merged PR titled `fix(db): harden lifecycle [T014936]` with head branch `fix/lifecycle-T015000`
- **AND** the row for external_id `T014936` was recreated after the original was deleted
  (sequence reuse), its plan_ref names branch `fix/other-T014999` and no pr-link exists
- **WHEN** the post-merge closure processes the merge
- **THEN** the row is NOT closed
- **AND** a warning naming the skipped ID and the reason `id-reuse-suspected` is emitted on stderr
