---
title: "e3-sdlc-tickets-lokal — Implementation Plan"
ticket_id: T002626
domains: [db, infra, scripts]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: T002623
depends_on_plans: [T002625]
---

# e3-sdlc-tickets-lokal — Implementation Plan

_Ticket: T002626 (E3) · Epic T002623 (ADR-006) · E2 T002625 merging · E4 T002627 folgt_

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-schema.md | impl | migrations/, k3d/sdlc-stack/ | |
| p2 | tasks.d/p2-poller.md | impl | scripts/github-poller.sh, systemd/ | p1 |
| p3 | tasks.d/p3-outbox.md | impl | website/src/, migrations/ | p1 |
| p4 | tasks.d/p4-tests.md | tests | tests/spec/sdlc-isolation/e3-tickets-lokal.bats | p3 |

### p1 — schema: tickets-Schema lokal bootstrappen, fleet read-only

Schema-Migration von fleet in die lokale DB. `tickets`-Schema bootstrappt sich selbst (D7 aus E2), muss aber das fleet-Readonly-Archiv schaffen.

### p2 — poller: GitHub-Poller- CronJob lokal

GitHub-Events (PRs, Checks, Comments) via Poller in lokale DB schreiben. `babysit-prs.sh` + `auto-close-merged.sh` generalisieren.

### p3 — outbox: Bug-Report-Outbox auf fleet → Poller liest lokal ein

`public.bug_report_outbox`-Tabelle auf fleet. Poller liest und schreibt in lokale tickets.

### p4 — tests: BATS-Guard + Backup-Nachweis

## Verify

```bash
bash scripts/openspec.sh validate
task test:changed
task freshness:regenerate && task freshness:check
```
