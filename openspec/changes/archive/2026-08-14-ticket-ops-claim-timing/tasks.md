---
title: "ticket-ops-claim-timing — Implementation Plan"
ticket_id: T004602
domains: [skills]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# ticket-ops-claim-timing — Implementation Plan

_Ticket: T004602_

## Why

ticket-ops Step 3.6 verlangt den branch-scoped Claim VOR der Worktree-Erstellung —
dev-flow-plan Phase A läuft aber im Haupt-Checkout. Mit aktivem Claim blockiert der
worktree-write-guard die Write-Tools im Haupt-Checkout (T002357-M1); beim T004295-Lauf
musste manuell released und später re-claimed werden. Der Doku-Hinweis fehlt (T004602).

Fix: Claim-Timing in procedures.md Step 3.6 + SKILL.md-Verweis dokumentieren.

## File Structure

```
.claude/skills/references/ticket-ops-procedures.md — Step 3.6: Claim-Timing-Hinweis
.claude/skills/ticket-ops/SKILL.md                   — Invarianten-Verweis auf die Timing-Regel
tests/spec/ticket-ops-claim-phase-a-T004602.bats     — BATS (RED, liegt bereits vor)
openspec/changes/ticket-ops-claim-timing/            — proposal + delta (dieses Ticket)
```

## Tasks

### Task 1: Rot-Phase verifizieren (failing Test)

`tests/spec/ticket-ops-claim-phase-a-T004602.bats` liegt vor (3 Guard-Greps). Rot
bestätigen:

1. `bash tests/unit/lib/bats-core/bin/bats tests/spec/ticket-ops-claim-phase-a-T004602.bats`
2. Verify test fails — M1 ("Step 3.6 nennt den Claim-Timing-Hinweis") matcht nicht.
3. Verify test fails — M2 ("Haupt-Checkout-Block") matcht nicht.
4. Verify test fails — M3 ("SKILL.md trägt den Hinweis") matcht nicht.

### Task 2: procedures.md Step 3.6 ergänzen

`.claude/skills/references/ticket-ops-procedures.md`, Step 3.6 (Dispatch wave 1):

1. Vor dem claim-Aufruf einen Absatz ergänzen: für unplanned Tickets (`ai_ready`, kein
   Plan) läuft zuerst die dev-flow-plan-Proposal-Phase (Phase A) im Haupt-Checkout OHNE
   Branch-Lock — der branch-scoped Claim wird erst NACH Phase A gehalten.
2. Die Sequenz explizit machen: Proposal-Phase (Haupt-Checkout, kein Claim) → Claim
   branch + Worktree anlegen (Phase B) → Plan/Execute-Dispatch im Worktree.
3. `[T004602]` als Referenz im Absatz nennen (Konvention wie bestehende T-Referenzen).

### Task 3: SKILL.md-Verweis ergänzen

`.claude/skills/ticket-ops/SKILL.md`, Invarianten-Sektion (nach M5):

1. Eine Zeile ergänzen: Claim-Timing-Regel — der branch-scoped Claim im Dispatch wird
   erst NACH der dev-flow-plan-Proposal-Phase (Phase A, Haupt-Checkout) gehalten;
   Details in procedures Step 3.6 `[T004602]`.
2. Keine weitere Änderung am Skill-Body.

### Task 4: Grün-Phase — eigenen Testlauf bestehen

1. `bash tests/unit/lib/bats-core/bin/bats tests/spec/ticket-ops-claim-phase-a-T004602.bats`
2. Erwartung: ALLE 3 Tests grün.
3. Regression benachbarter Guard-Suites:
   - `bash tests/unit/lib/bats-core/bin/bats tests/spec/mishap-t002422.bats`
   - `bash tests/unit/lib/bats-core/bin/bats tests/spec/mishap-t002424.bats`
4. `task test:changed` — kein neuer Rot-Zustand.

### Task 5: Lint + Freshness + Finale

1. `bash scripts/plan-lint.sh openspec/changes/ticket-ops-claim-timing/tasks.md`
2. `bash scripts/openspec.sh validate`
3. `task freshness:check`
4. Stage-Commit mit `chore(plans):`-Präfix (T001434).
5. Push `fix/ticket-ops-claim-phase-a-T004602`.

## Verify

1. `task test:changed` — Smart-Selektion grün.
2. `task freshness:regenerate` — generierte Artefakte neu erzeugen.
3. `task freshness:check` — keine uncommitteten generierten Artefakte.
4. `bash scripts/plan-lint.sh openspec/changes/ticket-ops-claim-timing/tasks.md` — FAIL = 0.
5. `bash tests/unit/lib/bats-core/bin/bats tests/spec/ticket-ops-claim-phase-a-T004602.bats` — 3/3 grün.
6. `stage-plan --hold` erfolgreich (Fix-Pfad).
7. Kein PR aus dem Plan-Stand (T002816).
