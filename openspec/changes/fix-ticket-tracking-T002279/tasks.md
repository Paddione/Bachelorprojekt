---
title: "fix-ticket-tracking-T002279 — Implementation Plan"
ticket_id: T002279
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-ticket-tracking-T002279 — Implementation Plan

_Ticket: T002279_

## File Structure

```
NEW:
  scripts/devflow-post-merge-ticket-closure.sh  — post-merge hook für Ticket-Tracking
CHANGED:
  scripts/devflow-post-merge-deploy.sh          — Ticket-Closure-Aufruf integrieren
  tests/spec/fix-ticket-tracking-T002279.bats    — Test
```

## Tasks

### 1. Post-Merge-Ticket-Closure-Skript

Skript das nach einem Merge PR-Commits durchsucht, referenzierte Tickets identifiziert und auf done/fixed setzt.

```bash
tests/spec/fix-ticket-tracking-T002279.bats
# expected: FAIL — kein automatisches Schließen
```

### 2. In Post-Merge-Deploy integrieren

`devflow-post-merge-deploy.sh` ruft das Closure-Skript nach erfolgreichem Deploy auf.

### 3. CI-Gates

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
