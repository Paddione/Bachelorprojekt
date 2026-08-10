# quickwins-script-fixes — Proposal

## Zweck

Quick-Win-Batch (Ad-hoc, ohne Batch-Parent-Ticket): 3 kleine, unabhängige Fixes
(effort=klein, keine Abhängigkeiten, disjunkte Dateimengen). Ein Branch, ein Plan,
3 Tickets schließen einzeln.

## Tickets

| Ticket | Titel | Area |
|--------|-------|------|
| T002765 | plan-touched-files nimmt nur erwähnte Pfade als berührte Dateien auf | scripts/plan-touched-files.sh |
| T002726 | preflight-pr-scope.bats Test 1 CI rot / lokal grün | test, ci |
| T002727 | backup-tickets restore-check: Download via kubectl-Attach beschädigt | database, scripts |

## Nicht im Scope

- Alle anderen Backlog-Fixes (eigene Tickets/Batches)
