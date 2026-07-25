# Spec Delta: website-db.ts Split Stage 2

## ADDED Requirements

### Requirement: website-db-split
Extracted domain modules for website-db.ts.

#### Scenario: Split website-db into domain modules
- GIVEN website-db.ts was monolithic
- WHEN domain functions are extracted into leaf modules
- THEN website-db.ts acts as re-exporter under 600 lines
