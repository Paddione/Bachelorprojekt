# batch-ci-check-eval-fixes — Proposal

## Zweck

Batch-Gruppe aus 6 Tickets (CI/Check-Auswertung). Ein gemeinsamer Branch und
Plan decken alle Kinder ab.

## Kinder

- T003109: gh pr checks --jq all() vakuos true auf leerer Checkliste
- T002815: Abgelehnter Commit + erfolgreicher Push sieht aus wie Erfolg
- T002827: Pre-push rejects valid push (stale scope commits)
- T003136: Archive PR failed freshness gate (openspec-status.json)
- T003138: test:changed startet Live-E2E bei openspec/-only
- T002922: Cluster-abhängige Bats nie ausgeführt

## Nicht im Scope

- gh pr checks cancelled≠fail + headSha (Batch T003490, p4/p5)
- branch-reaper (Batch T003490)
- Factory-Dispatch-Mechanik (eigene Tickets)
