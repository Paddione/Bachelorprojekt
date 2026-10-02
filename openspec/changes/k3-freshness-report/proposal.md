# Proposal: k3-freshness-report

## Why

The hourly refresh converts detect_changes failures to an empty object and then zero
changes, reporting fresh-skip despite unavailable graph evidence. Database mtime also
cannot identify the repository state of the last successful indexing operation.

## What

Add a read-only JSON freshness report with explicit fresh/stale/unknown outcomes, Git and
project identity, separate local-upstream comparison, graph metadata and atomic successful
index receipts. Keep indexing serialized and make cron consume the conservative result.
Include the prepared graph interpretation skill, registry entries and 20-case evaluation.
Use Python stdlib with thin shell integration, no new dependencies or required live refresh.

_Ticket: T900805_
