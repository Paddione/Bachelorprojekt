# Factory Dispatch Branch-Lock-Gate

## Purpose (Deutsch)

Verhindert den Doppel-Dispatch von Factory-Orchestratoren: `dispatcher-bridge.sh` bzw.
`opencode-exec.sh` dürfen keinen Pipeline-Orchestrator für ein Ticket starten, dessen
Ziel-Branch bereits branch-scoped durch eine andere Session geclaimt ist (z. B. ein
manuell laufendes `dev-flow-execute`). Beobachtet am 2026-08-14 bei T004295: die Factory
startete einen zweiten Orchestrator (PID 3869086, 41% CPU) für dasselbe Ticket im selben
Worktree, überschrieb Testdateien des Executors und erzeugte leere Subagent-Returns
(T004610, T004611).

## Problem / Auslöser

`check_ticket_readiness` (T003773) prüft vor dem Launch nur zwei Dinge: Branch existiert
auf `origin` und die Plan-Datei liegt auf dem Branch. Einen **agent-lock** prüft es nicht.
Ein parallel laufender Executor, der den Branch-Lock per `agent-lock.sh claim branch`
hält (genau der Lock-Typ, den die dev-flow-Skills setzen, T002498-M6), wird nicht erkannt
— der Launch geht trotzdem raus.

Zwei Einstiegspunkte, zwei Verteidigungslinien:
1. `dispatcher-bridge.sh` (Zeile ~75, nach `check_ticket_readiness`): hier entscheidet die
   Bridge, ob ein Launch für die Prep-Zeile rausgeht.
2. `opencode-exec.sh` (vor dem `opencode run --agent orchestrator`-Start, Zeile ~130):
   letzte Chance vor dem Prozess-Spawn; fängt auch direkte Aufrufe ab.

## Fix-Richtung

- **Guard-Funktion** `check_branch_lock()` in `scripts/factory/readiness-check.sh`
  (neben `check_ticket_readiness`, gleiche Datei — eine einzige Implementierung der
  Lock-Regel): ruft `agent-lock.sh check branch <branch>` auf und emittiert
  `{"ready":false,"reason":"branch_locked"}` bei Exit 1. Exit 0 → `{"ready":true,"reason":"ok"}`.
  Lock-Dir-/SID-Overrides (`AGENT_LOCK_DIR`, `AGENT_LOCK_SID`) kommen aus der Umgebung —
  offline testbar, ohne echte Session.
- **dispatcher-bridge.sh**: nach `check_ticket_readiness` zusätzlich
  `check_branch_lock "$branch"` aufrufen; bei `branch_locked` Zeile skippen mit
  `dispatcher-bridge: <id> not ready (readiness=branch_locked) — skipping launch`.
- **opencode-exec.sh**: vor dem Orchestrator-Start denselben Guard aufrufen; bei
  `branch_locked` mit Exit 7 abbrechen (belegte Exit-Codes: 6 = lief/blocked, 7 =
  fehlender Branch/Plan — 7 passt semantisch: "gar nicht erst gestartet").
- **Kein Ticket-Status-Wechsel** beim Lock-Skip: das Ticket bleibt `plan_staged`/`backlog`
  und wird vom nächsten Tick erneut geprüft, wenn der Lock frei ist (kein blocked, kein
  Slot-Release — der Executor arbeitet ja aktiv).

## Out of Scope

- Keine Änderung an `conflict-check.sh` (Datei-Overlap-Gate, Implementierungsphase).
- Kein neuer Lock-Typ; keine Änderung an `agent-lock.sh` selbst.
- Kein Retry-/Backoff-Verhalten für den Lock-Skip.
