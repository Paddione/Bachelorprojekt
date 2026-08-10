## ADDED Requirements

### Requirement: G-DB10 measurement SHALL exclude UNIQUE-constraint-backed indexes from the unused-index count

The G-DB10 measurement query in `.claude/lib/goals.md` SHALL exclude indexes that back a `pg_constraint`
UNIQUE entry (`i.indisunique` or `s.indexrelid IN (SELECT conindid FROM pg_constraint WHERE
contype='u')`) from its `idx_scan = 0` unused-index count, because these indexes enforce business
invariants and are not droppable regardless of scan activity.

#### Scenario: a UNIQUE-constraint index with zero scans is not counted as "unused"

- **GIVEN** an index that backs a `UNIQUE` constraint and has `idx_scan = 0`
- **WHEN** the G-DB10 measurement query runs
- **THEN** that index is excluded from the reported unused-index count

### Requirement: truly unused, non-constraint-backed indexes SHALL be dropped

Indexes with `idx_scan = 0` that do **not** back a `pg_constraint` UNIQUE entry SHALL be identified and
dropped via `DROP INDEX CONCURRENTLY` after confirming no application code references the index by name.

#### Scenario: G-DB10 reaches its target after cleanup

- **GIVEN** the corrected measurement query reports the remaining truly-unused indexes
- **WHEN** each is confirmed unreferenced and dropped
- **THEN** the G-DB10 current value in `.claude/lib/goals.md` reaches its target (0)
