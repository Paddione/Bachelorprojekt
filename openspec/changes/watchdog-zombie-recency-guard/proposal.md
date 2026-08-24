# Proposal: watchdog-zombie-recency-guard

## Why

Im Incident T016253 löschte der Watchdog zweimal einen **aktiven** Execute-Worktree
(`.worktrees/agent-lock-liveness-T015822`), während die Session arbeitete. Kausalkette:

1. Langer Testlauf (>30 Min) ohne Commit → `heartbeat_at` des Branch-Locks lief über
   `AGENT_LOCK_TTL=1800s`; Guards erneuern den Heartbeat nur bei Git-Hook-Läufen.
2. Der heartbeat-ttl-Reap (`agent-lock.sh`, `_reapable`) erntete den Lock — die
   `_worktree_has_active_process`-Probe griff nicht, weil die Session in diesem Fenster im
   MAIN-Checkout arbeitete und der Worktree prozesslos war.
3. Der Watchdog (`_wd_cleanup_worktree`) stufte den nun unclaimed Worktree als Zombie ein
   und löschte ihn — seine einzige Prüfung ist uncommitted-changes, nicht Aktivität.

Beobachtetes Symptom: aktiver Worktree weg, Recovery nur über lokalen Branch
(Fortsetzungs-Kontrakt T002327). Ursachen-Verifikation: `bash -x` im Incident zeigte die
Probe als einzigen Schutz vor dem heartbeat-ttl-Urteil; `_wd_cleanup_worktree`
(scripts/factory/watchdog.sh:126) hat keine Prozess-/Aktivitätsprüfung.

## What

1. **Recency-Spare vor dem Zombie-Urteil:** Bevor der Watchdog einen unclaimed
   sf-*-Worktree als Zombie löscht, prüft er, ob kürzlich (< Schwelle, Default 10 Min)
   Aktivität mit diesem Worktree assoziiert war:
   - lebender `/proc/*/cwd`-Prozess im Worktree (bestehende Probe), ODER
   - Aktivitäts-Ledger-Eintrag innerhalb der Schwelle, ODER
   - Lock-`heartbeat_at` innerhalb der Schwelle für einen Lock, dessen `worktree`-Feld
     auf den Worktree zeigt (auch wenn der Lock selbst schon reapable ist).
   Positiv ⇒ schonen statt löschen; statt dessen Bounce-Kommentar mit Grund.
   Persistenz über Ledger-Dateien (`agent-locks/activity/`), geschrieben von den
   bestehenden Hook-/Refresh-Pfaden (`_touch_own_worktree_heartbeats`,
   `_touch_heartbeat`).
2. **Serialisierung der Reap-Pfade:** heartbeat-ttl-Reap (`agent-lock.sh reap`) und
   Zombie-Purge (`watchdog.sh _wd_cleanup_worktree`) dürfen im selben Fenster nicht doppelt
   auf dasselbe Ticket/Worktree zuschlagen — gemeinsamer flock-geschützter kritischer
   Abschnitt; der zweite Akteur sieht den Zustand nach dem ersten und bricht ab.

Randbedingung: Watchdog-eigene Tickets nicht selbst reappen — Test-Isolation über den
factory-test-Marker (T015983) beachten.

_Ticket: T016418_
