---
ticket: T001947
status: planning
---

# Tasks for T001947 — brand-Spalten CHECK-Constraints

## Task 1: Audit existing brand columns
Query all tables with `brand` columns and identify which ones lack CHECK constraints. Categorize by schema: bachelorprojekt, brett, bugs, coaching, knowledge, public, tickets.

## Task 2: Create migration SQL
Write an idempotent SQL migration that adds CHECK constraints to all identified tables. Use `DO $$ ... $$` blocks with exception handling for idempotency. Constraint pattern:
- `chk_brand_<table_name>` naming convention
- Single-brand: `CHECK (brand = 'mentolder')`
- Multi-brand: `CHECK (brand IN ('mentolder', 'korczewski'))`

## Task 3: Create OpenSpec delta spec
Write the delta spec file under `specs/database.md` documenting the ADDED requirements.

## Task 4: Test migration on dev cluster
Apply the migration against the dev cluster (`workspace` namespace) and verify:
- Constraints are created
- Existing data passes validation
- Invalid inserts are rejected

## Task 5: Stage for prod deployment
Once validated, the migration is ready for `task workspace:deploy` to both mentolder and korczewski namespaces.
