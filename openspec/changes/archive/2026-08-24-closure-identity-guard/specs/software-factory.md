## ADDED Requirements

### Requirement: Post-merge closure verifies ticket identity via pre-merge anchors (Identity-Guard)

The post-merge closure (`scripts/factory/auto-close-merged.sh`) SHALL resolve the
candidate ticket row and its pre-merge anchors in a single query and SHALL close
the candidate only when the anchors confirm its identity by UUID. Anchors are
(a) `tickets.ticket_links` rows with `kind='pr'` matching the merged PR number
(`from_id` = ticket UUID) and (b) `tickets.ticket_plans` rows matching the PR
branch or the PR number (`ticket_id` = ticket UUID). Both anchor kinds are
created before the merge and therefore survive deletion/re-issue of the
`external_id`. The anchor comparison SHALL use the candidate row's UUID
(`tickets.tickets.id`), never the `external_id`, because the external_id may
have been re-issued after the merge (ID reuse, incident T015005).

#### Scenario: Anchors exist and none matches the candidate UUID

- **GIVEN** a merged PR whose title carries a `[T-NNNNNN]` tag
- **AND** pre-merge anchors exist for that PR (PR link or plan), but none of them points to the UUID of the row found under that external_id
- **WHEN** the post-merge closure processes the merge
- **THEN** the closure MUST NOT write any status change for that ticket row
- **AND** it SHALL emit a loud skip message naming the ID-reuse suspicion and referencing incident T015005

#### Scenario: At least one anchor confirms the candidate UUID

- **GIVEN** a merged PR whose title carries a `[T-NNNNNN]` tag
- **AND** at least one pre-merge anchor (PR link or plan) references the UUID of the candidate row
- **WHEN** the post-merge closure processes the merge
- **THEN** the closure proceeds with the normal status transition to done

#### Scenario: No pre-merge anchors exist (legacy path)

- **GIVEN** a merged PR whose title carries a `[T-NNNNNN]` tag
- **AND** neither a PR link nor a plan row exists for that PR (e.g. manual chores without staged plan)
- **WHEN** the post-merge closure processes the merge
- **THEN** the closure proceeds with the normal status transition to done

### Requirement: Identity-Guard decision is fail-closed and precedes the closure write

The pure decision function `identity_guard_blocks(anchor_count, anchor_match)`
SHALL block when `anchor_count` is empty (unparseable query answer — fail-closed)
and when anchors exist (`anchor_count != 0`) without a UUID match
(`anchor_match != 't'`). It SHALL allow closure when no anchors exist
(`anchor_count == 0`) or when at least one anchor matches (`anchor_match == 't'`),
regardless of the other flag. Within the per-ticket loop the guard SHALL run
after the terminal-status check (done/archived rows are skipped silently — the
guard would only be noise there) and before the `update-status --status done`
write.

#### Scenario: Unparseable anchor count blocks closure

- **GIVEN** the anchor query returned an empty/unparseable anchor count
- **WHEN** identity_guard_blocks evaluates the decision
- **THEN** it blocks the closure (fail-closed)

#### Scenario: Zero anchors never block regardless of match flag

- **GIVEN** the anchor query returned anchor_count 0
- **WHEN** identity_guard_blocks evaluates the decision with either match flag
- **THEN** it allows the closure (legacy path)

#### Scenario: Guard ordering within the closure loop

- **GIVEN** the per-ticket processing loop in auto-close-merged.sh
- **WHEN** a candidate row carries a terminal status (done/archived)
- **THEN** it is skipped before the Identity-Guard is evaluated
- **AND** for every non-terminal candidate the guard decision precedes the update-status write
