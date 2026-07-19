## Purpose

Ensures data integrity by adding CHECK constraints to all brand columns across the database schema.

## Requirements

### Requirement: brand column CHECK constraint coverage
Every table with a `brand` column SHALL have a CHECK constraint that restricts the column to valid brand values. The constraint SHALL use the naming convention `chk_brand_<table_name>`. Tables that already have CHECK constraints are excluded.

### Requirement: constraint value set
For tables that serve only mentolder: `CHECK (brand = 'mentolder')`. For tables that serve both brands: `CHECK (brand IN ('mentolder', 'korczewski'))`. The valid brand set is determined by examining existing data and the table's FK relationship to `brands(id)`.
