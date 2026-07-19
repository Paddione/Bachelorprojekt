## ADDED Requirements

### Requirement: the Brain Wiki ingest backlog SHALL reach zero missing worklist pages

`scripts/brain-ingest.sh` SHALL be run to completion against the GPU-host ingest pool so that every page
in the Brain worklist has a corresponding local ingest-state entry, closing the backlog reported by
`scripts/brain-ingest-worklist.sh`.

#### Scenario: the worklist backlog count reaches zero

- **GIVEN** `scripts/brain-ingest-worklist.sh` reports a non-zero `missing_count`
- **WHEN** `scripts/brain-ingest.sh --brain-repo <path>` completes a full ingest run without transform
  or LLM-timeout failures
- **THEN** a subsequent `scripts/brain-ingest-worklist.sh` run reports `missing_count: 0`
