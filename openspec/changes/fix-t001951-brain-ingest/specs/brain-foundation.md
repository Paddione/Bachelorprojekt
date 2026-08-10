---
name: fix-t001951-brain-ingest
description: Close the Brain-Wiki curated ingest backlog (17→0 missing worklist pages)
---

# Capability: fix-t001951-brain-ingest

## Purpose

Run the full curated Brain-Wiki ingest so all worklist pages are present in the local ingest
state, closing the remaining 17-page backlog tracked by G-BRAIN14.

## ADDED Requirements

### Requirement: Ingest Worklist Backlog Reaches Zero

After running `scripts/brain-ingest.sh` against the GPU-host ingest pool, the ingest worklist
backlog (`scripts/brain-ingest-worklist.sh` `missing_count`) MUST be zero.

#### Scenario: Full ingest run completes

```gherkin
GIVEN 17 of 86 worklist pages are missing from the local ingest state
WHEN `scripts/brain-ingest.sh --brain-repo <path>` completes without fatal errors
THEN `scripts/brain-ingest-worklist.sh` reports missing_count = 0
```
