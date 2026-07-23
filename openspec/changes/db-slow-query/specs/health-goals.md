## ADDED Requirements

### Requirement: G-DB09 measurement SHALL exclude one-time CREATE INDEX DDL statements from the slow-query count

The G-DB09 measurement query in `scripts/health-goals-check.sh` SHALL exclude `pg_stat_statements`
rows whose `query` text begins with `CREATE INDEX` (`query NOT ILIKE 'CREATE INDEX%'`), in addition
to the existing `COPY %` backup exclusion (T001926), because DDL maintenance statements — such as
one-time vector-index builds (`CREATE INDEX ... USING hnsw`) — are not repeated application queries
and their execution time is not a signal of application query performance.

#### Scenario: a one-time CREATE INDEX DDL statement with mean_exec_time > 1s is not counted as a "slow query"

- **GIVEN** `pg_stat_statements` contains a row for `CREATE INDEX chunks_embedding_hnsw ON knowledge.chunks USING hnsw (embedding public.vector_cosine_ops)` with `calls = 1` and `mean_exec_time > 1000`
- **WHEN** the G-DB09 measurement query runs
- **THEN** that row is excluded from the reported slow-query count

#### Scenario: a repeated application SELECT/DML statement with mean_exec_time > 1s is still counted

- **GIVEN** `pg_stat_statements` contains a row for an application `SELECT`/`INSERT`/`UPDATE`/`DELETE` statement with `mean_exec_time > 1000` and it is neither a `COPY` backup statement nor a `CREATE INDEX` DDL statement
- **WHEN** the G-DB09 measurement query runs
- **THEN** that row is still included in the reported slow-query count (the exclusion is narrowly scoped, not a broad DDL blocklist)
