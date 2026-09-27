# Plan: f2-offline-render-check / faulty-worker

Zweck: den gelandeten Worker-Stand belegen und auf den korrekten Doppelfix bringen.

## Partials

| id | file | role | targetFiles | dependsOn |
|----|------|------|-------------|-----------|
| p1 | p1-audit-incoming.md | reviewer | tests/spec/plan-partials-embedding/k1-embeds.bats, k3d/k1-embed-job.yaml | |
| p2 | p1-offline-render-test.md | code-worker | tests/spec/plan-partials-embedding/k1-embeds.bats | p1 |
| p3 | p1-reachability-guard.md | reviewer | tests/spec/plan-partials-embedding/k1-embeds.bats | p2 |
