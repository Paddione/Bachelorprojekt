# G-DB09 Slow-Query Measurement: DDL Exclusion — Design Spec

**Ticket:** T002095
**Date:** 2026-07-23
**Autonomous session note:** no interactive user was available in this subagent
context; scoping decisions below were made using best judgment from the live
investigation and documented as explicit assumptions rather than left open.

## Root cause (confirmed via live investigation)

Live query against `pg_stat_statements` (namespace `workspace`, context `fleet`,
identical to `scripts/health-goals-check.sh`'s G-DB09 `db_scalar` call):

```sql
SELECT query, calls, mean_exec_time, total_exec_time, rows
FROM pg_stat_statements
WHERE mean_exec_time > 1000 AND query NOT ILIKE 'COPY %'
ORDER BY mean_exec_time DESC;
```

Result — exactly one row:

| query | calls | mean_exec_time | total_exec_time | rows |
|---|---|---|---|---|
| `CREATE INDEX chunks_embedding_hnsw ON knowledge.chunks USING hnsw (embedding public.vector_cosine_ops)` | 1 | 13123.135566 ms | 13123.135566 ms | 0 |

This is a **one-time DDL statement** (HNSW vector index build on `knowledge.chunks`,
part of the brain-llm-wiki ingest pipeline), not a repeated application query.
`EXPLAIN ANALYZE` does not apply — the flagged statement is DDL, not a repeatable
SELECT/DML with a query plan to optimize. There is no missing index, N+1 pattern,
or bad plan to fix; a `pg_stat_statements` planner-count sanity check (`calls=1`)
confirms it ran exactly once, consistent with a maintenance-time index build.

`pg_stat_statements` records DDL execution time on the same footing as DML/SELECT.
A single legitimate (if expensive) `CREATE INDEX` maintenance operation therefore
pollutes an application-query-latency metric — the same class of measurement gap
that T001926 already fixed once for `COPY` (backup) statements.

## Fix approach

Extend the existing `NOT ILIKE 'COPY %'` exclusion in the G-DB09 measurement query
with a second, narrowly-scoped exclusion for `CREATE INDEX` DDL:

```sql
SELECT count(*) FROM pg_stat_statements
WHERE mean_exec_time > 1000
  AND query NOT ILIKE 'COPY %'
  AND query NOT ILIKE 'CREATE INDEX%'
```

Applied in:
1. `scripts/health-goals-check.sh` — the `db_scalar` call for `G-DB09` (~line 413).
2. `.claude/lib/goals.md` — update the G-DB09 "Measurement" line to match, and add
   a short baseline note (analogous to the T001926 COPY note) documenting the DDL
   exclusion and pointing at this ticket.
3. `website/src/lib/goals-data.generated.json` — regenerated via
   `node scripts/gen-goals-data.mjs` so the website's goal dashboard reflects the
   corrected measurement (generated artifact, not hand-edited).

## Scope decision: `CREATE INDEX%` specifically, not a broad DDL keyword list

**Assumption (no user available to confirm interactively):** exclude only
`CREATE INDEX%`, not a broad DDL blocklist (`CREATE %`, `ALTER %`, `DROP %`, etc.).

Rationale:
- Narrow scope keeps the exclusion auditable and matches exactly the observed
  false positive; a blanket DDL exclusion could silently mask a genuinely slow
  DDL-adjacent statement in the future (e.g. a slow `ALTER TABLE ... ADD COLUMN`
  with a default-value rewrite, which *is* something the team would want flagged).
- `CREATE INDEX` (including `CREATE INDEX CONCURRENTLY`) is the one DDL class this
  repo runs periodically for legitimate, expected-to-be-slow maintenance (vector
  index builds for `knowledge.chunks`, per the brain-llm-wiki ingest pipeline) —
  narrowing to it mirrors the precedent of the COPY exclusion, which also targeted
  one specific, understood, recurring maintenance pattern rather than blocking all
  bulk-data statements.
- If a second DDL class starts tripping this goal in the future, it should get its
  own explicit exclusion + baseline note (same pattern as this ticket and T001926),
  keeping the measurement's exclusion list self-documenting via git history.

## Affected subsystems

- `scripts/health-goals-check.sh` — measurement query (source of truth).
- `.claude/lib/goals.md` — human-readable goal doc + measurement line.
- `website/src/lib/goals-data.generated.json` — regenerated artifact (not hand-edited).

## Testing

This is a live-DB state check, not a static-file assertion — there is no fixture
data locally that reproduces `pg_stat_statements` DDL rows. Per the existing
pattern for live-state health goals (e.g. G-E2E02), no BATS test can meaningfully
assert against live prod `pg_stat_statements` content in CI (no local Postgres
instance carries this exact query history, and seeding it would be artificial).
Verification is the measurement command itself, run manually pre/post-fix against
the live `shared-db` instance — documented explicitly as the verification step in
the implementation plan rather than a faked red/green CI test.

The implementation plan does add a narrow **unit-level regression test** for the
*query text itself* (that the exclusion clause literally appears in
`scripts/health-goals-check.sh`), which is a legitimate static-file assertion and
prevents someone silently reverting the exclusion — this is the closest CI-safe
proxy available and is called out as such in the plan (not presented as validating
live DB behavior).

## Edge cases considered

- **CREATE INDEX CONCURRENTLY**: `ILIKE 'CREATE INDEX%'` also matches
  `CREATE INDEX CONCURRENTLY ...` since both start with `CREATE INDEX`. No
  separate clause needed.
- **Case sensitivity**: `ILIKE` is case-insensitive by definition, consistent with
  the existing `COPY %` clause's use of `ILIKE`.
- **Future masking risk**: documented above under Scope decision — narrow by design.
