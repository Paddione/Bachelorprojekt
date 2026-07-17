---
ticket: T001831
health_goal: G-DB03
---

# Tasks: G-DB03 CHECK-Constraints ergänzen

## Task 1: Fehlende Constraints identifizieren

**Datei:** — (SQL-Abfrage)

```sql
SELECT t.table_name
FROM information_schema.columns c
JOIN information_schema.tables t ON t.table_name = c.table_name
WHERE c.column_name = 'brand'
  AND t.table_schema = 'public'
  AND NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    WHERE con.conrelid = (t.table_name)::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%brand%'
  )
ORDER BY t.table_name;
```

**Verify:**
1. Ergebnis zeigt max. 44 Tabellen

## Task 2: Constraints erstellen (Batch)

**Datei:** — (SQL-Migration)

Für jede Tabelle:
```sql
ALTER TABLE <table>
  ADD CONSTRAINT chk_<table>_brand
  CHECK (brand IN ('mentolder','korczewski'));
```

Batch-Skript generieren und ausführen.

**Verify:**
1. `SELECT count(*) FROM information_schema.table_constraints WHERE constraint_name LIKE 'chk_%_brand'` zeigt ≥44
2. Kein Lock-Deadlock während Erstellung

## Task 3: Baseline in goals.md aktualisieren

**Datei:** `.claude/lib/goals.md`

G-DB03 Current Value auf 0 setzen.

**Verify:**
1. `grep -A2 'G-DB03' .claude/lib/goals.md` zeigt 0
