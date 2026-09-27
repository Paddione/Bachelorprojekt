# Partials

| id | file | role | targetFiles | dependsOn |
|----|------|------|-------------|-----------|
| p1 | ctx-alignment.md | code-worker | tests/spec/ticket-system/areas-csv-trim.bats, tests/spec/ticket-system/backfill-id-sequence.bats | |
| p2 | anchor-test.md | code-worker | tests/spec/ticket-system/areas-csv-trim.bats | p1 |
| p3 | review.md | reviewer | tests/spec/ticket-system/areas-csv-trim.bats, tests/spec/ticket-system/backfill-id-sequence.bats | p2 |

## Reihenfolge
p1 richtet die Kontextaufloesung in beiden Dateien angleichen, p2 ergaenzt den Anker,
p3 prueft, dass kein Seed mitgeliefert wird. p1 allein ist die halbe Reparatur.
