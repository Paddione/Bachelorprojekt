---
ticket: T001839
health_goal: G-DB10
---

# Tasks: G-DB10 Unused Indexes

## Task 1: Ungenutzte Indize identifizieren

**Datei:** — (SQL-Abfrage)

```sql
SELECT schemaname, relname AS table, indexrelname AS index,
       pg_size_pretty(pg_relation_size(i.indexrelid)) AS size
FROM pg_stat_user_indexes i
JOIN pg_index USING (indexrelid)
WHERE idx_scan = 0
  AND schemaname NOT IN ('pg_catalog','information_schema')
ORDER BY pg_relation_size(i.indexrelid) DESC;
```

**Verify:**
1. Ergebnis zeigt Liste ungenutzter Indize mit Größen

## Task 2: Indize sicher entfernen

**Datei:** — (SQL-Migration)

Für jeden ungenutzten Index:
```sql
DROP INDEX CONCURRENTLY IF EXISTS <index_name>;
```

**Verify:**
1. `SELECT count(*) FROM pg_stat_user_indexes WHERE idx_scan = 0` zeigt 0 (nach ausreichend Laufzeit)
2. Kein Table-Lock während Entfernung

## Task 3: Baseline in goals.md aktualisieren

**Datei:** `.claude/lib/goals.md`

G-DB10 Current Value auf 0 setzen.

**Verify:**
1. `grep -A2 'G-DB10' .claude/lib/goals.md` zeigt 0
