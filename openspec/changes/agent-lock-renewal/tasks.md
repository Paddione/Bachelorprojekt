---
title: "agent-lock-renewal — Implementation Plan"
ticket_id: T016417
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# agent-lock-renewal — Implementation Plan

_Ticket: T016417_

## Ausgangslage

Guards erneuern den Lock-Heartbeat nur bei Git-Hook-Läufen
(`scripts/agent-lock-guards.sh:21,47`). Zwischen zwei Commits — genau dort
laufen lange Testphasen — läuft die TTL (`AGENT_LOCK_TTL=1800`) ab und der
aktive Worktree wurde zweimal gelöscht (T016253). Bausteine existieren:
`_touch_heartbeat` (atomar, best-effort) und `cmd_refresh <scope> <id>`
(einzelner Lock). Es fehlt ein Kommando ohne Scope-Arguemt sowie die
Aufrufpunkte.

## File Structure

```
scripts/agent-lock.sh                                          (cmd_heartbeat + Dispatch + Usage)
scripts/agent-lock-activity.sh                                 (cmd_heartbeat-Helfer neben _touch_heartbeat)
.claude/skills/dev-flow-execute/SKILL.md                       (Aufrufpunkt: heartbeat vor/nach langen Phasen)
.claude/skills/references/dev-flow-execute-phases.md           (dito, Phasen-Detail)
Taskfile.yml                                                   (Langläufer-Ziele renewen bei Task-Start)
tests/spec/software-factory/agent-lock-heartbeat-renewal.bats  (neu)
```

Hinweis: `.opencode/skills/dev-flow-execute` ist ein Directory-Symlink auf die
Shared Sources (T014086) — keine Separate Änderung nötig; im Plan verifizieren.

## Tasks

- [ ] **1. (RED) BATS-Test schreiben.** Neue Datei
      `tests/spec/software-factory/agent-lock-heartbeat-renewal.bats`:
      a) Session claimed ticket+branch Locks → `agent-lock.sh heartbeat` →
      `heartbeat_at` beider Locks erneuert (Identitätsfelder unverändert).
      b) Fremder Lock bleibt unberührt.
      c) Fehlender/leerer Lock-Dir → rc=0 (fail-open).
      d) main-checkout-Lock der eigenen Session wird mit erneuert.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/agent-lock-heartbeat-renewal.bats
# expected: FAIL (red — cmd_heartbeat existiert noch nicht)
```

- [ ] **2. (GREEN) cmd_heartbeat implementieren.** In
      `scripts/agent-lock-activity.sh`: iteriert alle `*.json` im Lock-Dir,
      `_lock_is_mine "$f"` → `_touch_heartbeat "$f"`, zählt Erneuerungen;
      Ausgabe `heartbeat: renewed N lock(s)`; immer rc=0. Dispatch
      (`heartbeat)`) + Usage-Zeile in agent-lock.sh ergänzen. Kein
      Re-Claim-Ritual, keine Scope-/ID-Argumente.

- [ ] **3. Aufrufpunkt dev-flow-execute.** SKILL.md +
      dev-flow-execute-phases.md: Anweisung, vor dem Start und nach dem Ende
      langer Operationen (>~5 Min, insb. Testläufe ohne Zwischen-Commit)
      `bash scripts/agent-lock.sh heartbeat` auszuführen. Verifizieren, dass
      der opencode-Symlink die Änderung trägt.

- [ ] **4. Aufrufpunkt task-runner.** In `Taskfile.yml` die Langläufer-Ziele
      (test:suite-Familie) um einen best-effort ersten Step ergänzen:
      `bash scripts/agent-lock.sh heartbeat || true`. CI-sicher (fail-open).

- [ ] **5. Final Verification.** Drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate && task freshness:check
```

## Verification

- BATS deckt Multi-Scope-Erneuerung, Fremd-Lock-Schutz, Fail-open und
  main-checkout-Erneuerung ab.
- Manueller Smoke: in einer Session mit Ticket-Lock `heartbeat` aufrufen und
  per `list` den frischen `heartbeat_at`-Zeitstempel gegenprüfen.
