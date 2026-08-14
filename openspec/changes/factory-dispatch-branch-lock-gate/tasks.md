---
title: "factory-dispatch-branch-lock-gate — Implementation Plan"
ticket_id: T004610
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-dispatch-branch-lock-gate — Implementation Plan

_Ticket: T004610_

## Why

`dispatcher-bridge.sh` bzw. `opencode-exec.sh` starteten am 2026-08-14 bei T004295 einen
ZWEITEN Pipeline-Orchestrator (PID 3869086, 41% CPU) für dasselbe `plan_staged`-Ticket,
während `dev-flow-execute` es im selben Worktree bereits branch-scoped geclaimt hatte.
Der zweite Prozess überschrieb Testdateien des Executors und verursachte leere
Subagent-Returns (T004610, T004611).

`check_ticket_readiness` (T003773) prüft vor dem Launch nur Branch-Existenz + Plan-Datei,
aber **keinen agent-lock**. Ein parallel laufender Executor, der den Branch-Lock hält
(T002498-M6: dev-flow-Skills locken branch-scoped), wird nicht erkannt.

Fix: `check_branch_lock()`-Guard in `readiness-check.sh`, aufgerufen in
`dispatcher-bridge.sh` (nach `check_ticket_readiness`) und in `opencode-exec.sh`
(vor dem Orchestrator-Spawn). Kein Ticket-Status-Wechsel beim Lock-Skip.

## File Structure

```
scripts/factory/readiness-check.sh        — +check_branch_lock() (eine Implementierung der Lock-Regel)
scripts/factory/dispatcher-bridge.sh      — Aufruf nach check_ticket_readiness, Skip mit Grund
scripts/factory/opencode-exec.sh          — Aufruf vor Orchestrator-Spawn, Exit 7 bei Lock
tests/spec/software-factory/dispatch-branch-lock-gate.bats — BATS (RED, liegt bereits vor)
openspec/changes/factory-dispatch-branch-lock-gate/        — proposal + delta (dieses Ticket)
```

## Tasks

### Task 1: Rot-Phase verifizieren (failing Test) [x]

`tests/spec/software-factory/dispatch-branch-lock-gate.bats` liegt bereits vor (4 Tests).
Rot-Status bestätigen — der Defekt MUSS nachweisbar sein, bevor der Fix gebaut wird
(Symptom-vs-Hypothese, T002448-M5):

1. `bash tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/dispatch-branch-lock-gate.bats`
2. Verify Test 2 ("branch-scoped geclaimter Branch wird NICHT gelauncht") fails —
   `would launch pipeline for T-LOCKED` erscheint trotz Claim.
3. Verify Test 3 ("opencode-exec startet NICHT bei Claim") fails — Exit != 7.
4. Beide Positiv-Anker (Test 1, Test 4) sind GRÜN — das Gate ist grundsätzlich durchlässig,
   der Test misst also den fehlenden Lock-Check, nicht ein kaputtes Skript.

### Task 2: `check_branch_lock()` in readiness-check.sh ergänzen [x]

`scripts/factory/readiness-check.sh`, neben `check_ticket_readiness`:

1. Funktion `check_branch_lock()` implementieren, Signatur `check_branch_lock <branch>`:
   - Leerer oder Literal-`"null"`-Branch → `printf '{"ready":false,"reason":"missing_args"}\n'` + Exit 1
   - Sonst: `agent-lock.sh check branch "$branch"` aufrufen — Pfad relativ zur Skript-Lage
     (`"$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/agent-lock.sh"`), NICHT zum CWD
     (die Bridge läuft mit `cd <worktree>`, T002357)
   - agent-lock Exit 0 (free) → `printf '{"ready":true,"reason":"ok"}\n'` + Exit 0
   - agent-lock Exit 1 (held) → `printf '{"ready":false,"reason":"branch_locked"}\n'` + Exit 1
2. Lock-Dir-/SID-Overrides (`AGENT_LOCK_DIR`, `AGENT_LOCK_SID`, `AGENT_LOCK_FAKE_ALIVE`)
   aus der Umgebung erben — kein eigenes Setzen (Test-Override-Pfad, agent-lock.sh Kopf).
3. **Kein** Ticket-Status-Wechsel, **kein** Slot-Release im Guard — reiner Gate-Check.

### Task 3: dispatcher-bridge.sh — Guard nach check_ticket_readiness [x]

`scripts/factory/dispatcher-bridge.sh`, direkt nach dem `check_ticket_readiness`-Block
(Zeile ~75, VOR dem Budget-Guard):

1. `check_branch_lock "$branch"` aufrufen (Funktion wird über das bestehende
   `source "$HERE/readiness-check.sh"` bereits geladen).
2. Bei Exit != 0: `dispatcher-bridge: <id> not ready (readiness=<reason>) — skipping launch`
   auf stderr + `continue` — konsistent mit dem bestehenden Readiness-Skip-Muster.
3. Kein `update-status blocked`, kein Slot-Release — das Ticket bleibt `plan_staged` und
   wird vom nächsten Tick erneut geprüft, sobald der Lock frei ist.

### Task 4: opencode-exec.sh — Guard vor dem Orchestrator-Spawn [x]

`scripts/factory/opencode-exec.sh`, VOR dem `opencode run --agent orchestrator`-Spawn
(Zeile ~130):

1. `check_branch_lock` sourcen (gleiche Quelle: `readiness-check.sh`).
2. Bei `branch_locked`: `opencode-exec: <id> Branch <branch> ist geclaimt — kein Launch` auf
   stderr und `exit 7` (belegter Exit-Code "gar nicht erst gestartet", semantisch passend
   zu T003773-Exit 7 für fehlenden Branch/Plan).
3. **Kein** `phase_event blocked` beim Lock-Skip (das Ticket ist nicht blockiert — es läuft
   ja parallel; kein Rauschen im Factory-Journal). Nur die stderr-Zeile.

### Task 5: Grün-Phase — eigenen Testlauf bestehen [x]

1. `bash tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/dispatch-branch-lock-gate.bats`
2. Erwartung: ALLE 4 Tests grün (Test 2 + 3 jetzt grün durch Task 2–4, Positiv-Anker bleiben grün).
3. Regression benachbarter Suites:
   - `bash tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/readiness-gate-before-launch.bats`
   - `bash tests/unit/lib/bats-core/bin/bats tests/unit/factory-readiness.bats`
4. `task test:changed` — Smart-Selektion, keine neuen Rot-Zustände.

### Task 6: Lint + Freshness + Finale

1. `bash scripts/plan-lint.sh openspec/changes/factory-dispatch-branch-lock-gate/tasks.md`
2. `bash scripts/openspec.sh validate`
3. `task freshness:check` (generierte Artefakte committed)
4. Stage-Commit mit `chore(plans):`-Präfix (T001434 — NIEMALS `fix()`/`feat()` im Plan-Commit).
5. Push `fix/factory-doppel-dispatch-T004610`.

## Verify

1. `task test:changed` — Smart-Selektion grün (kein neuer Rot-Zustand).
2. `task freshness:regenerate` — generierte Artefakte neu erzeugen.
3. `task freshness:check` — keine uncommitteten generierten Artefakte.
4. `bash scripts/plan-lint.sh openspec/changes/factory-dispatch-branch-lock-gate/tasks.md` — FAIL = 0.
5. `bash tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/dispatch-branch-lock-gate.bats` — 4/4 grün.
6. `stage-plan --hold` erfolgreich (Fix-Pfad: Factory-Dispatch zurückhalten, bis execute freigibt).
7. Kein PR aus dem Plan-Stand (T002816).
