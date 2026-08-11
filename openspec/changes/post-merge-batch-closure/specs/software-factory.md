## ADDED Requirements

### Requirement: Batch-PR closure resolves delivered child tickets from the PR title

The post-merge closure (`scripts/factory/auto-close-merged.sh`) SHALL derive two distinct
ticket roles from the merged PR title: the parent from square-bracket notation `[T……]`, and
the delivered children from round-bracket notation `(T……,T……)`. All resolved tickets SHALL be
closed using the existing resolution derivation, so that a batch PR no longer leaves its
delivered children open.

Round brackets are the authoritative delivery record because they state what the PR actually
shipped, whereas `child_of` links state planning intent and diverge whenever a batch spans
multiple PRs.

#### Scenario: Batch PR closes parent and all children named in round brackets

- **GIVEN** a merged PR titled `feat(ci): Batch CI/Check-Auswertung Fixes (T003109,T002815,T002922) [T003540]`
- **WHEN** the post-merge closure processes the merge
- **THEN** `T003540` is closed as the parent
- **AND** `T003109`, `T002815` and `T002922` are closed as delivered children

#### Scenario: Partial delivery closes only the children the title names

- **GIVEN** a merged PR titled `feat(scripts): Batch Git/Worktree-Integritaet — P1 worktree-health (T002994,T002995,T002998) [T003539]`
- **AND** the batch parent `T003539` has seven `child_of` children in the database
- **WHEN** the post-merge closure processes the merge
- **THEN** only `T002994`, `T002995` and `T002998` are closed
- **AND** the four children absent from the title remain open

#### Scenario: Single-ticket PR is unaffected

- **GIVEN** a merged PR titled `fix(ci): preflight-pr-scope matcht ALLE Ticket-IDs im PR-Titel [T003103]`
- **WHEN** the post-merge closure processes the merge
- **THEN** `T003103` is closed
- **AND** no additional ticket is closed

#### Scenario: Round brackets without ticket IDs close nothing extra

- **GIVEN** a merged PR titled `fix(ci): repariere (endlich) den Watcher [T001234]`
- **WHEN** the post-merge closure processes the merge
- **THEN** `T001234` is closed
- **AND** no additional ticket is closed

### Requirement: Closure no longer consults the partial-completeness guard

The post-merge closure SHALL NOT call `check_partial_plan_completeness` from
`scripts/factory/merge-hooks.sh` when deciding whether to close a ticket. The guard measures
unchecked checkboxes in the change plan, which do not track actual delivery: measured against
four real batches it produced three false blocks and one false pass. The PR title carries the
delivery statement instead.

`scripts/factory/merge-hooks.sh` itself SHALL remain in the repository; only its invocation
from the closure path is removed.

#### Scenario: Merged batch with unchecked plan boxes still closes

- **GIVEN** a merged PR whose batch parent `T003540` has a change plan containing 93 unchecked task boxes
- **WHEN** the post-merge closure processes the merge
- **THEN** the parent and the children named in the title are closed
- **AND** the unchecked boxes do not block the closure
