# Proposal: agent-lock-renewal

## Why

Zweimal wurde am 2026-08-24 ein aktiver Execute-Worktree gelöscht, weil der
Branch-Lock-Heartbeat bei Testläufen >30 Min ohne Zwischen-Commit ablief
(`AGENT_LOCK_TTL=1800`, scripts/agent-lock.sh:12) — Watchdog-Incident T016253,
Klärungsentscheid Follow-up (a).

Die Lücke: Guards erneuern den Heartbeat bisher nur bei Git-Hook-Läufen
(`_touch_own_worktree_heartbeats` in `scripts/agent-lock-guards.sh:21,47`).
Die Zeitspanne zwischen zwei Commits — genau die, in der lange Testphasen
laufen — ist ungeschützt. Ein abgelaufener Heartbeat lässt `_reapable` den
Lock als tot einstufen; Worktree-Hygiene und Watchdog löschen daraufhin den
Worktree, während die Session noch arbeitet.

## What

1. **CLI-Renewal-Pfad:** `agent-lock.sh heartbeat` — erneuert die Heartbeats
   ALLER Locks der aufrufenden Session (owner_sid-Match via `_lock_is_mine`),
   unabhängig vom Scope (ticket/branch/worktree/main-checkout). Best-effort
   und atomar wie `_touch_heartbeat` [T015822]; fail-open (CI ohne Locks
   bleibt grün). Generalisiert `cmd_refresh` (einzelner Lock, Scope+ID nötig)
   zu einem Kommando ohne Re-Claim-Ritual.
2. **Aufrufpunkt dev-flow-execute:** SKILL.md + Phasen-Referenz instruieren
   die Session, `bash scripts/agent-lock.sh heartbeat` vor dem Start und nach
   dem Ende langer Operationen (Testläufe >~5 Min) auszuführen.
3. **Aufrufpunkt task-runner:** Die lokalen Langläufer-Taskfile-Ziele
   (`test:suite`-Familie) renewen den Heartbeat best-effort bei Task-Start,
   damit auch MCP-getriebene Läufe (mcp-task-runner) geschützt sind.

_Ticket: T016417_

## Impact

- **Affected specs:** `specs/factory-reclaim-lock-respect.md` (Delta:
  Renewal-Pfad + Aufrufpunkte als Requirement)
- **Affected code:**
  - `scripts/agent-lock.sh` (neues cmd_heartbeat + Dispatch/Usage)
  - `scripts/agent-lock-activity.sh` (Wiederverwendung `_touch_heartbeat`)
  - `.claude/skills/dev-flow-execute/SKILL.md` +
    `.claude/skills/references/dev-flow-execute-phases.md`
  - `.opencode/skills/dev-flow-execute/SKILL.md` (Shared-Sources-Symlink —
    prüfen ob Änderung automatisch mitläuft)
  - `Taskfile.yml` (Langläufer-Ziele)
  - Tests: `tests/spec/software-factory/agent-lock-heartbeat-renewal.bats`
- **Non-goals:** Keine TTL-Änderung, keine Watchdog-/Reap-Logik-Anpassung —
  ausschließlich die Erneuerungsseite.
