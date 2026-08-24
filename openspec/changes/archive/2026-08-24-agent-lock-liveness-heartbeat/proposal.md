# Proposal: agent-lock-liveness-heartbeat

## Why

`agent-lock.sh reap` meldet Locks **lebender** Sessions als stale und räumt sie
weg (Mishap 2026-08-23T23:36:47Z). Ursache ist eine Summe von drei Defekten:

1. `owner_pid` wird als `$$` des **kurzlebigen** aufrufenden Bash-Prozesses
   geschrieben (`scripts/lib/wt-hygiene-measure.sh:144–148` dokumentiert die
   Wertlosigkeit selbst) — `kill -0` fällt praktisch immer auf tot.
2. `heartbeat_at` wird nur durch Re-Claim desselben SIDs oder explizites
   `refresh` erneuert — und `refresh` hat **null Caller** in `scripts/`
   (verifiziert). Die TTL (`AGENT_LOCK_TTL=1800`, agent-lock.sh:12) läuft bei
   jeder längeren Arbeitsphase ab.
3. Die verlässliche Liveness-Probe `_worktree_has_active_process`
   (/proc-cwd-Scan, T014468) wird nur im SID-alive-Zweig ausgewertet
   (agent-lock.sh:202–213) — die pid-dead-Pfade (:239–244, :252–259, :260–269)
   ernten ohne diesen Blick.

Folge: `reap`/`list` deklariert frische Claims nach 120 s Grace für tot
(Grund `pid-dead`) und parallele Sessions laufen auf dasselbe Ticket.
Spiegelbild dazu ist T015823 (Arbeit ganz ohne Claim) — beide Decksblätter
derselben Zuverlässigkeitsschwäche; das Enforcement dort, die Liveness hier.

## What

1. **Aktivitäts-Herzschlag über die vorhandenen Guard-Hooks:** pre-commit /
   post-checkout erneuern `heartbeat_at` des passenden Locks
   (gleicher Worktree bzw. main-checkout.json) — best-effort, fail-open,
   atomar über den etablierten flock-Stil. Kein neuer Daemon, keine neue
   Infrastruktur; echte Git-Aktivität IST der Lebensbeweis.
2. **Probe vor Urteil:** in `_reapable` wird vor jedem pid-dead/sid-dead-Reap
   eines worktree-gematchten Locks `_worktree_has_active_process` ausgewertet;
   ein lebender Prozess im Worktree bewahrt den Lock unabhängig von PID/TTL.
3. Kein SID-Vergleich im Herzschlag-Match — Harness-SIDs wechseln je
   Tool-Call (live beobachtet), die Match-Regel bleibt flächendeckend
   worktree-/scope-basiert.

_Ticket: T015822_
