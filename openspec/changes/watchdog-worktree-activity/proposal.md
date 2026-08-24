# Proposal: watchdog-worktree-activity

## Why

Im Watchdog-Incident T016253 löschte der Zombie-Cleanup zweimal einen aktiven
Execute-Worktree, weil die `_worktree_has_active_process`-Probe (/proc-cwd) leer
griff: die Session arbeitete in diesem Fenster im Haupt-Checkout, kein Prozess
hatte seine cwd im Worktree — der Worktree galt als prozesslos und wurde als
Zombie eingestuft. Follow-up (b) aus T016253, Klärungsentscheid 2026-08-24.

_Ticket: T016418_

## What

- **Erweiterte Aktivitätsprobe:** Vor jedem Zombie-Urteil über einen unclaimed
  Worktree prüft der Watchdog neben der cwd-Probe zusätzlich
  (a) offene Datei-Handles (`/proc/*/fd/*`) unter dem Worktree-Pfad und
  (b) letzte Schreibaktivität (Dateien jünger als ein Schwellwert, Default
  10 Min, parametrierbar über `FACTORY_WORKTREE_ACTIVE_MIN`). Jedes positive
  Signal schont den Worktree statt ihn zu löschen.
- **Reap-Pfad-Serialisierung:** Heartbeat-TTL-Reap (agent-lock) und
  Zombie-Purge (Watchdog/Cleanup) serialisieren ihre Entscheidungen über einen
  gemeinsamen Lock, sodass beide nicht im selben Fenster zuschlagen; der Purge
  wiederholt die Liveness-Probe unmittelbar vor dem `git worktree remove`.
- **factory_excluded-Kontext (T006364):** Der Watchdog reappt weiterhin keine
  Worktrees eigener factory_excluded-Tickets.

## Impact

- Betroffen: `scripts/factory/watchdog.sh` (`_wd_cleanup_worktree`),
  `scripts/agent-lock-activity.sh` (Probe-Erweiterung), ggf.
  `scripts/agent-lock.sh` (Reap-Serialisierung).
- Risiko: ältere Worktrees mit aktuellen Zeitstempeln (z. B. nach `git checkout`)
  könnten kurzfristig geschont werden — akzeptabel gegenüber Datenverlust.
- Keine Änderung am Dispatch-/Reset-Verhalten des Stale-Sweeps selbst.
