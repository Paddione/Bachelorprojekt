---
title: "fa-sf-dedupe-T002427 — Implementation Plan"
ticket_id: T002427
domains: [software-factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fa-sf-dedupe-T002427 — Implementation Plan

_Ticket: T002427_

## File Structure

```
tests/local/FA-SF-*.bats                        (27 entfernt)
tests/spec/software-factory.bats                (geändert) — 3 Fälle portiert/verstärkt, Kopfhinweis
Taskfile.yml                                    (geändert) — test:factory auf die Sammeldatei
tests/factory-eval/fixtures/T000925/expected.json (geändert) — Pfad nachgezogen
website/src/data/test-inventory.json            (regeneriert)
```

## Verify (RED → GREEN)

- [x] **Deckungsnachweis.** Titelvergleich (163/166), normalisierter Rumpfvergleich
      (0 echte Abweichungen), Sammeldatei grün.
- [x] **Portierung.** FA-SF-26 (plan_ref → backlog), FA-SF-33 (Falsch-Positiv-Wache),
      FA-SF-70 (vorhandenen Test um WARNING/Usage-Assertions verstärkt).
- [x] **Entfernen + Umstellen.** 27 Dateien, `test:factory`, Fixture, Inventar.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats   # 487 ok
task test:factory                                                     # 503 ok
```

- [ ] **Final Verification.** Die drei verbindlichen CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
