---
ticket: T001947
status: planning
---

## Purpose

17 Tabellen haben `brand`-Spalten ohne CHECK-Constraint. Tabellen ohne FK-Constraints auf `brands(id)` können beliebige, ungültige Brand-Werte aufnehmen. Selbst mit FK ist ein expliziter CHECK eine Verteidigungsschicht gegen Tippfehler und Migration-Fehler.

Health-Goal G-DB03: 16 → 0 brand-Spalten ohne CHECK-Constraint.

## Requirements

### ADDED Requirements

### Requirement: CHECK constraints on all brand columns
Every table with a `brand` column SHALL have a CHECK constraint that restricts values to the set of valid brands. For single-brand tables: `CHECK (brand = 'mentolder')`. For multi-brand tables: `CHECK (brand IN ('mentolder', 'korczewski'))`. Views are excluded.

### Requirement: Constraint naming convention
All new CHECK constraints SHALL follow the naming pattern `chk_brand_<table_name>` for consistency with existing constraints.

### Requirement: Idempotent migration
The migration SHALL use `IF NOT EXISTS` logic or equivalent to be safely re-runnable. The migration SHALL NOT lock tables or cause downtime.

## Scenarios

### GIVEN a table with a brand column and no CHECK constraint
WHEN the migration runs
THEN a CHECK constraint is added restricting brand to valid values

### GIVEN a table already has a CHECK constraint on brand
WHEN the migration runs
THEN the existing constraint is preserved (no-op)

### GIVEN an INSERT with an invalid brand value
WHEN the CHECK constraint is active
THEN the INSERT fails with a constraint violation error
