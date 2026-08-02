# openspec-embedding-T002334

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu openspec-embedding-T002334 ergänzen._

## Requirements

### Requirement: post-commit-hook-embedding

The post-commit hook SHALL invoke `bash scripts/openspec-embed-local.sh` after any commit touching `openspec/changes/`.

#### Scenario: post-commit-trigger happy path
GIVEN a commit that modifies files under `openspec/changes/`
WHEN the post-commit hook runs
THEN `scripts/openspec-embed-local.sh` is called once
AND the embedding is upserted (no duplicate rows)

#### Scenario: post-commit-idempotency
GIVEN the same slug was already embedded
WHEN `scripts/openspec-embed-local.sh` runs again for that slug
THEN no duplicate embedding entry is created
AND the existing entry is updated (upsert semantics)

<!-- merged from change delta openspec-embedding-T002334.md (3cb0d26c058d) -->