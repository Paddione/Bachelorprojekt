# Design: agent-lock-liveness-heartbeat

## Root Cause

Zwei unabhängige Schwächen summieren sich:

| Signal | Zustand heute | Wirkung |
|---|---|---|
| `owner_pid` | `$$` des kurzlebigen aufrufenden Bash | `kill -0` fast immer tot → pid-dead-Pfad |
| `heartbeat_at` | nur Re-Claim/`refresh`; refresh hat 0 Caller | TTL (1800s) läuft bei langer Arbeit ab |
| Aktivitätsprobe | nur im SID-alive-Zweig (:202–213) | pid/sid-dead-Pfade ignorieren lebenden Worktree |

Non-numerische Harness-SIDs gelten zwar per-se als alive (:97–101), aber der
TTL-Check greift dort ebenfalls — genau die beobachtete False-Stale-Lage.

## Entscheidungen

1. **Herzschlag über existierende Hooks statt neuem Daemon:** Guards laufen bei
   jeder echten Git-Aktivität. Kosten: ein best-effort JSON-Rewrite pro Hook.
   Atomar über den etablierten flock-Stil (`_with_lock`, :300–310).
   Match-Regel: Lock mit `worktree == aktueller Checkout` ODER
   main-checkout.json im Main-Checkout; kein SID-Vergleich (harness-übergreifend
   unzuverlässig — dieselbe Session wechselt SIDs je Tool-Call).
2. **Probe statt Heuristik:** `_worktree_has_active_process` existiert und wird
   getestet (T014468); wir verschieben nur die Aufrufstelle vor die dead-Pfade.
   Reihenfolge in `_reapable`: SID-alive-Zweig unverändert → NEU: für
   worktree-matched Locks Probe → erst danach pid-dead/sid-dead-Urteil.
3. **Fail-open überall:** Kaputter Store oder fehlendes /proc darf niemals einen
   Commit blockieren oder einen Reap einfrieren — Warnung genügt.
4. **Bewusst nicht Teil dieses Changes:** Claim-Enforcement (T015823,
   eigener Change gegen software-factory.md) und SID-Stabilität über Tool-Calls
   (Harness-Thema, außerhalb des Repo-Einflusses).

## Risiken

- /proc-cwd-Scan auf großen Maschinen: bereits produktiv (T014468), keine
  neue Kostenklasse.
- Herzschlag verlängert Locks von Zombies, die nur committen aber nie
  releasen: nein — ohne Prozess-cwd im Worktree bleibt der Reap scharf
  (Scenario 2), Herzschlag allein rettet keinen Toten.
