---
ticket: T001830
health_goal: G-DB01
---

# Tasks: G-DB01 FK-Indizes ergänzen

## Task 1: Fehlende FK-Indize identifizieren

**Datei:** — (SQL-Abfrage)

Die Abfrage aus der Ticket-Beschreibung ausführen:
```sql
WITH fk AS (
  SELECT c.conrelid AS relid, c.conkey[1] AS col, t.relname AS tbl,
         a.attname AS col_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid=c.conrelid
  JOIN pg_namespace n ON n.oid=t.relnamespace
  JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
  WHERE c.contype='f' AND n.nspname NOT IN ('pg_catalog','information_schema')
),
idx AS (
  SELECT ic.indrelid, ic.indkey[1] AS col
  FROM pg_index ic
)
SELECT f.tbl, f.col_name
FROM fk f
LEFT JOIN idx i ON i.indrelid=f.relid AND i.col=f.col
WHERE i.col IS NULL;
```

**Verify:**
1. Ergebnis zeigt max. 4 Zeilen (Tabellen + Spalten)

## Task 2: Indizes erstellen

**Datei:** — (SQL-Migration)

Für jede fehlende FK-Spalte:
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_<table>_<col> ON <table>(<col>);
```

**Verify:**
1. `SELECT indexname FROM pg_indexes WHERE indexname LIKE 'idx_%'` zeigt neue Indizes
2. Kein Table-Lock während Erstellung (CONCURRENTLY)

## Task 3: Baseline in goals.md aktualisieren

**Datei:** `.claude/lib/goals.md`

G-DB01 Current Value auf 0 setzen.

**Verify:**
1. `grep -A2 'G-DB01' .claude/lib/goals.md` zeigt 0
