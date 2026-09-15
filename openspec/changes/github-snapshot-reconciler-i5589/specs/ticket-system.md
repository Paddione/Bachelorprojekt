## ADDED Requirements

### Requirement: GitHub Snapshot Schema and Cursor Tracking

The system SHALL provide tables `tickets.github_issue_snapshots`, `tickets.github_pr_snapshots`, and `tickets.github_sync_cursors` in `tickets-schema.ts`. Sync cursors SHALL update only within the transaction that successfully commits the corresponding snapshot inserts or updates.

#### Scenario: Transactional cursor update on snapshot ingestion

- **GIVEN** a batch of 50 GitHub Issue snapshots and an end cursor string `"cursor_abc123"`
- **WHEN** `reconcileGitHubIssueSnapshots(batch, "cursor_abc123")` is executed
- **THEN** all 50 snapshots are upserted into `tickets.github_issue_snapshots` and `tickets.github_sync_cursors` is updated with `cursor = 'cursor_abc123'` in a single committed transaction

#### Scenario: Transaction rollback leaves cursor untouched on failure

- **GIVEN** a batch of snapshots containing an invalid node ID or database error
- **WHEN** `reconcileGitHubIssueSnapshots` fails during transaction execution
- **THEN** the transaction is rolled back, no snapshots are saved, and the cursor in `tickets.github_sync_cursors` remains at its previous value

---

### Requirement: GitHub Identity and Closing Relationship Auto-Registration

The reconciler SHALL automatically register GitHub objects and coordinates via `registerGitHubObject` and record closing relationships (`closes` / `implements`) via `recordGitHubRelation` when processing Issue and Pull Request snapshots.

#### Scenario: Ingesting PR with closing issue reference

- **GIVEN** a PR snapshot with title `"Fix bug in auth"` and body `"Closes #42"`
- **WHEN** the PR snapshot is reconciled
- **THEN** both the PR and Issue #42 are registered in `tickets.github_objects`, their coordinates are recorded in `tickets.github_object_coordinates`, and a relation with `kind = 'closes'` is inserted into `tickets.github_object_relations`

---

### Requirement: PR Events and Status Compatibility Projection

The system SHALL maintain backward compatibility for `tickets.pr_events` and `pr_status` consumers by projecting merged PR snapshots into `tickets.pr_events` rows upon reconciliation.

#### Scenario: Merged PR snapshot projects to pr_events

- **GIVEN** a merged PR snapshot with `number = 5589`, `merged_at = '2026-09-12T04:00:00Z'`, and `title = 'GitHub SDLC: complete issue and PR snapshot reconciler'`
- **WHEN** the PR snapshot is reconciled
- **THEN** a row in `tickets.pr_events` is inserted or updated with matching `pr_number`, `title`, and `merged_at` timestamps
