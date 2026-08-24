---
title: "watchdog-worktree-activity — Implementation Plan"
ticket_id: T016418
domains: [factory-watchdog]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# watchdog-worktree-activity — Implementation Plan

_Ticket: T016418_

## Ausgangslage

Der Zombie-Cleanup des Watchdogs (und die Cleanup-Pfade) löschen Worktrees nach
der /proc-cwd-Probe — die griff leer, als eine Session im Haupt-Checkout
arbeitete (T016253). Die Probe wird um Handle- und Recency-Signale erweitert,
Reap-Entscheidungen werden serialisiert.

## File Structure

```
scripts/agent-lock-activity.sh                       (geändert — _worktree_recently_active: cwd + fd + mtime-Probe)
scripts/factory/watchdog.sh                          (geändert — _wd_cleanup_worktree mit Aktivitäts-Gate + factory_excluded-Respekt)
scripts/agent-lock.sh                                (geändert — Reap/Purge-Serialisierung über gemeinsamen flock)
tests/spec/factory-watchdog/worktree-activity-shield.bats   (neu)
```

## Tasks

- [ ] 1. `scripts/agent-lock-activity.sh`: neue Funktion `_worktree_recently_active <wt>` —
  true wenn (a) Prozess-cwd im Worktree (bestehende `_worktree_has_active_process`),
  (b) ein `/proc/*/fd/*`-Symlink unter dem Worktree-Pfad liegt oder (c) Dateien im
  Worktree jünger als `FACTORY_WORKTREE_ACTIVE_MIN` (Default 10) sind.
  Bestehende Aufrufer unverändert lassen.
- [ ] 2. `scripts/factory/watchdog.sh`: `_wd_cleanup_worktree` ruft vor dem
  force-remove `_worktree_recently_active` auf; positiv ⇒ Schonung mit
  Audit-Kommentar statt Löschung. Skip weiterhin bei uncommitteten Änderungen.
  Ticket-ID-Claim gegen `readiness.factory_excluded` prüfen (T006364).
- [ ] 3. Serialisierung: gemeinsamer flock (Registry-Stil aus agent-lock.sh
  `_with_lock`) um Heartbeat-TTL-Reap-Entscheid und Watchdog-Purge;
  Purge wiederholt die Liveness-Probe direkt vor `git worktree remove`.
- [ ] 4. BATS `tests/spec/factory-watchdog/worktree-activity-shield.bats`:
  Szenarien aus der Delta-Spec (Handle geschont, Recency geschont, ruhiger
  Zombie gelöscht, Reap/Purge-Fenster, factory_excluded).
- [ ] 5. Gates: `task test:changed`, `task freshness:check`; Verifikation am
  echten Watchdog-Aufruf mit FACTORY_STALE_EXCLUDE_TEST_SEEDS-Isolation.

## Verification

- BATS deckt alle fünf Szenarien ab; bestehende
  `tests/spec/factory-watchdog/*.bats` und `tests/spec/agent-lock-liveness-heartbeat.bats`
  bleiben grün (kein Verhaltensbruch für alte Aufrufer).
- Manuelle Gegenprobe: während ein Sleep-Prozess cwd im Worktree hält, darf
  `_wd_cleanup_worktree` nicht löschen.
