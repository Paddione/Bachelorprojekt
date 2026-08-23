---
title: "closure-identity-guard — Implementation Plan"
ticket_id: T015670
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# closure-identity-guard — Implementation Plan

_Ticket: T015670_

**Chore-Hinweis:** Dokumentation des bereits auf main gelieferten Verhaltens —
kein Produktionscode-Change, daher kein RED→GREEN-Zyklus. Die neuen Tests
sichern bestehendes Verhalten und müssen sofort grün sein.

## File Structure

```
openspec/changes/closure-identity-guard/proposal.md           (Why/What)
openspec/changes/closure-identity-guard/specs/software-factory.md  (Delta: ADDED Requirements, Parent-SSOT software-factory)
openspec/changes/closure-identity-guard/tasks.md
tests/spec/software-factory/auto-close-uuid-guard.bats        (+2 @test-Blöcke)
```

## Tasks

- [x] **1. Delta-Spec ausfüllen.** Geliefertes Design beschreiben: Anker-Quellen,
      UUID-Konsens, fail-closed-Entscheidung, Platzierung, Skip-Meldung.
- [x] **2. Gap-Tests ergänzen.** Konsens-Kantfall (`identity_guard_blocks 0 t`)
      und Terminal-Status-Präzedenz (done/archived-Skip vor dem Guard).

## Verify

```bash
# Spec-Validierung
bash scripts/openspec.sh validate closure-identity-guard
# Guard-Tests gegen das reale main-Verhalten (alle 8 müssen grün sein)
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/auto-close-uuid-guard.bats
# CI-Gates vor PR
task test:changed
task freshness:regenerate && task freshness:check
```
