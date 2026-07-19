---
name: fix-t001948-unused-indexes
description: Corrected unused-index measurement query excluding UNIQUE business invariants (G-DB10)
---

# Capability: fix-t001948-unused-indexes

## Purpose

Correct the G-DB10 unused-index measurement query so it excludes UNIQUE-backing indexes (business
invariants that cannot be dropped), then classify and safely drop the remaining truly-unused
indexes with `idx_scan = 0`.

## ADDED Requirements

### Requirement: Unused-Index Measurement Excludes UNIQUE Business Invariants

The G-DB10 measurement query MUST exclude indexes that back a `UNIQUE` constraint
(`indisunique` or a `pg_constraint` entry with `contype='u'`), since these cannot be dropped
without removing the invariant they enforce.

#### Scenario: A UNIQUE-backing index with idx_scan = 0

```gherkin
GIVEN an index has idx_scan = 0 but backs a UNIQUE constraint
WHEN the G-DB10 measurement query runs
THEN the index is excluded from the "unused index" count
```

### Requirement: Remaining Truly-Unused Indexes Are Dropped Safely

Indexes confirmed unused (not backing any constraint, no application code reference) MUST be
dropped via `DROP INDEX CONCURRENTLY` to avoid locking production tables.

#### Scenario: A confirmed-unused index

```gherkin
GIVEN an index has idx_scan = 0 and does not back any constraint
WHEN it is dropped
THEN `DROP INDEX CONCURRENTLY <name>` is used, not a blocking `DROP INDEX`
```
