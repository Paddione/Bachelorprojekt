---
title: "gitlab-ci-testserie-fixes — Implementation Plan"
ticket_id: T011907
domains: [testing, ci-cd]
status: active
file_locks: []
shared_changes: false
batch_id: T011907
parent_feature: null
depends_on_plans: []
---

# gitlab-ci-testserie-fixes — Implementation Plan

_Ticket: Batch T011907 — T011899, T011900, T011901, T011902, T011903, T011904, T011905, T011906 (8 Tickets, ein Branch)_

## File Structure

```
tests/unit/fleet-dns-cutover.bats                      (p1 · T011899)
tests/unit/scripts/stage-plan.bats                     (p2 · T011900)
tests/unit/coaching-json-ingest.bats                   (p3 · T011901)
tests/unit/recovery-browser-manifest.bats              (p4 · T011902)
tests/unit/test_art_library_manifest.bats              (p5 · T011903)
tests/unit/tickets-transition.bats                     (p6 · T011904)
tests/unit/newsletter-scheduled-publish.bats           (p7 · T011905)
tests/unit/backup-restore-recovery.bats                (p8 · T011906)
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | `tasks.d/p1-fleet-dns-cutover.md` | impl | `tests/unit/fleet-dns-cutover.bats` | |
| p2 | `tasks.d/p2-stage-plan-hold.md` | impl | `tests/unit/scripts/stage-plan.bats` | |
| p3 | `tasks.d/p3-coaching-json-ingest.md` | impl | `tests/unit/coaching-json-ingest.bats` | |
| p4 | `tasks.d/p4-recovery-browser-gate.md` | impl | `tests/unit/recovery-browser-manifest.bats` | |
| p5 | `tasks.d/p5-art-library-deps.md` | impl | `tests/unit/test_art_library_manifest.bats` | |
| p6 | `tasks.d/p6-tickets-transition-reexport.md` | impl | `tests/unit/tickets-transition.bats` | |
| p7 | `tasks.d/p7-scheduled-publish-errorresponse.md` | impl | `tests/unit/newsletter-scheduled-publish.bats` | |
| p8 | `tasks.d/p8-backup-restore-stub.md` | tests | `tests/unit/backup-restore-recovery.bats` | |

Alle 8 Partials sind disjunkt (eine Testdatei je Partial, D1); es gibt kein
depends_on (D2) — jede Testdatei ist unabhängig fixbar. Der STRUCT2-Failing-Test-
Step liegt im Tests-Partial p8.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** p8 reproduziert den Defekt des letzten Falls:
      der kubectl-Stub überschreibt $CAPTURE mit dem leeren create-Stream; der
      Testlauf auf dem aktuellen Stand schlägt fehl (siehe p8, `expected: FAIL`).
      Die Partials p1..p7 dokumentieren ihre eigenen RED-Läufe gegen den
      Vor-Fix-Stand ihrer jeweiligen Testdatei.

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/backup-restore-recovery.bats
# expected: FAIL (red — der Stub-Fix in p8 ist nicht umgesetzt)
```

- [ ] **Fix-Step (GREEN).** Alle acht Partials implementieren ihre Fixes; jede der
      acht Testdateien läuft einzeln grün.

- [ ] **Final Verification.** Die drei mandatory Verify-Commands plus
      Test-Inventar-Regenerierung (es kommen keine neuen Testdateien hinzu —
      das Inventar muss unverändert bleiben):

```bash
task test:changed
task test:inventory
task freshness:regenerate
task freshness:check
```

- [ ] **Diff-Integrität.** `git diff --stat` zeigt ausschließlich Pfade unter
      `tests/` und `openspec/changes/gitlab-ci-testserie-fixes/` — kein
      Produktcode (scripts/, components/website/, k3d/) wird angefasst.
