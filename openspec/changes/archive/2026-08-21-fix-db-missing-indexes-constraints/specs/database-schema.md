## ADDED Requirements

### Requirement: Single-Column FK Index Coverage & Brand Constraints

The database schema SHALL provide B-tree indexes for all single-column foreign key references and enforce `brand` check constraints on base tables with brand tenancy.

#### Scenario: Migration application

- **GIVEN** a deployed platform database
- **WHEN** database migrations run
- **THEN** missing FK indexes and brand check constraints are created idempotently

