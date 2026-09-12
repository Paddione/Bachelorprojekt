# Partial 2: Snapshot Reconciler and Compatibility Projection

- [ ] **Implement GitHub Snapshot Reconciler**
  - Create `components/website/src/lib/tickets/github-snapshot-reconciler.ts`:
    - Export `reconcileGitHubIssueSnapshots(snapshots: GitHubIssueSnapshotInput[], cursor: string): Promise<ReconcileResult>`
    - Export `reconcileGitHubPRSnapshots(snapshots: GitHubPRSnapshotInput[], cursor: string): Promise<ReconcileResult>`
    - Integrate with `registerGitHubObject` and `recordGitHubRelation` (`closes` / `implements`) for native closing references.
    - Transactional guarantee: Update `tickets.github_sync_cursors` inside the snapshot ingestion transaction.
- [ ] **Implement PR Events Compatibility Layer**
  - Create `components/website/src/lib/tickets/github-pr-events-compat.ts`:
    - Export `projectSnapshotToPREvents(snapshot: GitHubPRSnapshotRecord): Promise<void>`
    - Ensure merged PR snapshots update `tickets.pr_events` seamlessly for metrics consumers.
