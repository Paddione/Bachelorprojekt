# Plan: f1-umlaut-guard / clean

Zweck: `@test`-Namen auf Nicht-ASCII bereinigen, ohne Guard oder Fixture-Daten zu
aendern.

## Partials

| id | file | role | targetFiles | dependsOn |
|----|------|------|-------------|-----------|
| p1 | p1-umlaut-testname.md | code-worker | tests/unit/brain-ingest-prune.bats | |
