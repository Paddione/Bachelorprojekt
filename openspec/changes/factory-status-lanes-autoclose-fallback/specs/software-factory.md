## ADDED Requirements

### Requirement: Factory-Status-Lane-Counts reflect the real dispatchable queue

The factory queue feed (`scripts/factory/queue.sh`) SHALL include the `status`
column in its JSON SELECT list, and the MCP lane counter
(`countByStatus` in `scripts/factory/mcp-go/main.go`) SHALL derive
`dispatchable["backlog"]` and `dispatchable["plan_staged"]` from that column so
that reported lane depths match the row count of the raw queue output.
A consumer parsing queue JSON SHALL treat a missing `status` field as a parse
degradation (log a warning) instead of silently reporting zero lanes.

Observed defect (T015960, 2026-08-24): `factory_status` reported
`backlog=0 / plan_staged=0` while `queue.sh` returned 8 dispatchable rows,
because the SELECT omitted `status` and every row parsed as empty.

#### Scenario: Lane counts match raw queue rows

- **GIVEN** `queue.sh` emits N rows whose JSON objects carry a `status` field
- **WHEN** `countByStatus` aggregates the feed
- **THEN** `dispatchable[status]` sums to exactly N across lanes
- **AND** `factory_status` no longer reports `backlog=0` while the raw queue lists backlog rows

#### Scenario: Missing status field degrades loudly, not silently

- **GIVEN** a queue JSON row without a `status` field (pre-fix regression)
- **WHEN** `countByStatus` parses the feed
- **THEN** a warning naming the missing field is logged
- **AND** the row is counted in an explicit unknown bucket rather than inflating any lane to a false zero

### Requirement: Post-merge closure falls back to branch-suffix ticket ID when the title tag is missing

The post-merge closure (`scripts/factory/auto-close-merged.sh`) SHALL resolve a
candidate ticket when the merged PR title carries no `[T……]` bracket tag by
extracting the ticket ID from the PR head branch suffix matching
`-T[0-9]{6}$`. The fallback result SHALL enter the same pipeline as a
title-derived ID — including the pre-merge anchor Identity-Guard, which is not
weakened by this change. When neither title nor branch yield an ID, the closure
SHALL skip the PR with a loud diagnostic naming both exhausted sources.

Observed defect (T015960, 2026-08-24): PR #5214 carried its ticket ID only as
branch suffix `…-t015919`, was skipped by the poller, and T015919 stayed open
after merge until manual closure — violating merge=closure.

#### Scenario: Title tag missing but branch suffix carries the ID

- **GIVEN** a merged PR titled without any `[T-NNNNNN]` bracket tag
- **AND** the head branch name ends in `-T015919`
- **WHEN** the post-merge closure processes the PR
- **THEN** the candidate set contains T015919 via the branch-suffix fallback
- **AND** closure proceeds through the unchanged Identity-Guard before writing the status

#### Scenario: Neither source yields an ID — loud skip

- **GIVEN** a merged PR whose title has no `[T……]` tag and whose branch has no `-T[0-9]{6}` suffix
- **WHEN** the post-merge closure processes the PR
- **THEN** the PR is skipped
- **AND** a diagnostic names `title` and `branch` as the exhausted ID sources
