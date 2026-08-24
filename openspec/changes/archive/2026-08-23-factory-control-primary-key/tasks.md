---
title: "factory-control-primary-key — Implementation Plan"
ticket_id: T014545
domains: [database]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-control-primary-key — Implementation Plan

## File Structure

```
components/website/src/lib/tickets/tables/factory-control.ts   DDL + idempotente Migration (~Zeile 11-20)
components/website/src/lib/sdlc/factory-floor.test.ts          Test-DDL anpassen, falls Tests die Constraints brauchen
```

## Implementation Steps

### 1. Frisch-Install-DDL erweitern (`applyFactoryControlSchema`)

`CREATE TABLE IF NOT EXISTS tickets.factory_control` bekommt zusätzlich:

```sql
id BIGSERIAL PRIMARY KEY,
...
UNIQUE NULLS NOT DISTINCT (key, brand)
```

### 2. Idempotente Migration für den Live-Bestand (gleiche Funktion, nach dem CREATE)

```sql
-- 2a) Surrogate-PK nachrüsten (Spalte + PK je nur wenn fehlend)
ALTER TABLE tickets.factory_control ADD COLUMN IF NOT EXISTS id BIGSERIAL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'tickets.factory_control'::regclass AND conname = 'factory_control_pkey') THEN
    ALTER TABLE tickets.factory_control ADD CONSTRAINT factory_control_pkey PRIMARY KEY (id);
  END IF;
END $$;

-- 2b) Duplikate kollabieren: neueste updated_at-Zeile je (key, brand) behalten
DELETE FROM tickets.factory_control a
  USING tickets.factory_control b
  WHERE a.key IS NOT DISTINCT FROM b.key
    AND a.brand IS NOT DISTINCT FROM b.brand
    AND a.ctid < b.ctid;   -- Kollisionsfall gleicher Timestamp: beliebige Zeile gewinnt

-- 2c) UNIQUE auf NULLS NOT DISTINCT upgraden (PG16)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'tickets.factory_control'::regclass AND conname = 'factory_control_key_brand_key'
             AND NOT pg_get_constraintdef(oid) ILIKE '%NULLS NOT DISTINCT%') THEN
    ALTER TABLE tickets.factory_control DROP CONSTRAINT factory_control_key_brand_key;
  END IF;
END $$;
ALTER TABLE tickets.factory_control DROP CONSTRAINT IF EXISTS factory_control_key_brand_key;
ALTER TABLE tickets.factory_control ADD CONSTRAINT factory_control_key_brand_key UNIQUE NULLS NOT DISTINCT (key, brand);
```

Hinweise:
- `pg_get_constraintdef` gibt bei PG16 `UNIQUE NULLS NOT DISTINCT (key, brand)` zurück — der
  DO-Block macht das ADD idempotent; das vorangehende bedingte DROP verhindert Fehler bei
  bereits geupgradetem Constraint.
- Die DELETE-Form mit `ctid` ist transaktionssicher und braucht keine Sequenz.
- Alles läuft in `applyFactoryControlSchema` beim Website-Start — bestehende Aufrufreihenfolge
  und Fail-closed-Verhalten bleiben unverändert.

### 3. Writer unverändert lassen (Verifikation statt Änderung)

`scripts/factory/wakeup.sh:381` (`ON CONFLICT (key, brand)`) funktioniert mit dem
NULLS-NOT-DISTINCT-Constraint korrekt — bewusst NICHT anfassen. Nach dem nächsten Tick muss
`count(*) WHERE key='last-tick-at'` konstant bleiben (kein Wachstum mehr).

## Verification

1. Unit: `(cd components/website && pnpm test:unit)` — factory-floor-Tests grün.
2. Live-DB (nach Deploy oder manuell gegen k3d-Postgres):
   - `SELECT count(*) FROM tickets.factory_control;` → deutlich < 1000 (Dedup gegriffen)
   - `\d tickets.factory_control` → PK `factory_control_pkey (id)`, `UNIQUE NULLS NOT DISTINCT`
   - Doppel-INSERT desselben (key, NULL) → Unique-Verletzung statt zweiter Zeile
3. Nächster Factory-Tick: `last-tick-at` bleibt genau 1 Zeile (brand=NULL), `updated_at` frischt auf.
