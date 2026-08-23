# Proposal: factory-control-primary-key

## Why

`tickets.factory_control` ist die einzige Tabelle im Schema `tickets` ohne Primary Key
(System-Audit 2026-08-23, SA-DB-03 / Ticket T014545). Der reale Schaden ist bereits eingetreten:
die Spalte `brand` ist nullable („brand NULL = global", T000413), und Postgres behandelt in
einem `UNIQUE`-Constraint NULL-Werte als verschieden — `UNIQUE (key, brand)` dedupliziert
Globaleinträge also nie. Folge: `wakeup.sh` schreibt bei jedem Factory-Tick
`INSERT … ON CONFLICT (key, brand)` für `last-tick-at` mit `brand=NULL`, der Conflict feuert
nie, und die Tabelle sammelt seit 2026-08-18 **990 Duplikatzeilen** (Stand 2026-08-23).
`parallel-status.ts` liest mit `… AND brand IS NULL LIMIT 1` zwar nur eine Zeile, aber die
Tabelle wächst ungebremst um ~2 Zeilen/Tick.

## What Changes

- **Surrogate-PK:** `id BIGSERIAL PRIMARY KEY` auf `tickets.factory_control` (Spalten müssen
  für einen PK NOT NULL sein; `brand` muss wegen der Global-Semantik nullable bleiben — ein
  natürlicher PK `(key, brand)` ist daher nicht möglich).
- **NULL-Duplikate schließen:** das bestehende `UNIQUE (key, brand)` wird zu
  `UNIQUE NULLS NOT DISTINCT (key, brand)` upgraded (PostgreSQL 16.14 läuft im Cluster).
  Danach greift auch das bestehende `ON CONFLICT (key, brand)` in `wakeup.sh` für
  `brand=NULL`-Zeilen — **keine Writer-Änderung nötig**.
- **Dedup-Migration:** vor dem Constraint-Upgrade werden Duplikatzeilen kollabiert
  (`max(updated_at)` je `(key, brand)` bleibt).
- DDL-Heimat ist `components/website/src/lib/tickets/tables/factory-control.ts`
  (`applyFactoryControlSchema`, idempotent beim Start).

## Impact

- Betroffen: `components/website/src/lib/tickets/tables/factory-control.ts` (DDL + Migration),
  Tests (`factory-floor.test.ts` legt die Tabelle ohne Constraints an — prüfen, ob die
  Test-DDL angepasst werden muss).
- Kein Leseverhalten ändert sich: `brand IS NULL`-Reads bleiben gültig, `ON CONFLICT`-Targets
  bleiben `(key, brand)`.
- Die Tabelle schrumpft von ~1000 auf ~10 Zeilen.
