# Plan: f2-offline-render-check / clean

Zweck: CI gruen machen, ohne dass die Manifest-Pruefung stillschweigend ausfaellt.

## Partials

| id | file | role | targetFiles | dependsOn |
|----|------|------|-------------|-----------|
| p1 | p1-offline-render-test.md | code-worker | tests/spec/plan-partials-embedding/k1-embeds.bats | |
| p2 | p2-reachability-guard.md | reviewer | tests/spec/plan-partials-embedding/k1-embeds.bats | p1 |
