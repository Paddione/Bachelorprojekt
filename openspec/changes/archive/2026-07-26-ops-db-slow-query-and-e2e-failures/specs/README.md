# Spec: DB09 + E2E01

## Acceptance Criteria

1. **G-DB09:** `db_scalar "SELECT count(*) FROM pg_stat_statements WHERE mean_exec_time > 1000 AND query NOT ILIKE 'COPY %' AND query NOT ILIKE 'CREATE INDEX%'"` → 0
2. **G-E2E01:** `gh run list --workflow e2e.yml --limit 14 --json conclusion | python3 -c "..."` → ≥90

## Nicht-Scope

- Kein großer E2E-Testumbau (nur Root-Cause-Analyse)
- Kein DB-Tuning außer der identifizierten Slow Query
