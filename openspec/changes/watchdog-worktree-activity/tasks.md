---
title: "watchdog-worktree-activity — Implementation Plan"
ticket_id: T900227
domains: [factory-watchdog, scripts]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# watchdog-worktree-activity — Implementation Plan

_Ticket: T900227_

## Ausgangslage

Der Zombie-Cleanup des Watchdogs (und die Cleanup-Pfade) löschten Worktrees bisher allein
nach der `/proc-cwd`-Probe. Diese griff leer, wenn eine Session im Haupt-Checkout arbeitete,
während ihr Worktree unberührt blieb (Incident T016253). Die Aktivitäts-Probe wird um offene
Datei-Handles (`/proc/*/fd/*`) und Schreibaktivität (`mtime` gegen `FACTORY_WORKTREE_ACTIVE_MIN`)
erweitert. Zudem werden Reap-Entscheidungen (agent-lock) und Purge-Entscheidungen (watchdog)
serialisiert und `readiness.factory_excluded` wird respektiert.

## File Structure

```
scripts/agent-lock-activity.sh                              (geändert — _worktree_recently_active: cwd + fd + mtime-Probe)
scripts/factory/watchdog.sh                                 (geändert — _wd_cleanup_worktree mit Aktivitäts-Gate + factory_excluded-Respekt)
scripts/agent-lock.sh                                       (geändert — Reap/Purge-Serialisierung über gemeinsamen flock)
tests/spec/factory-watchdog/worktree-activity-shield.bats    (neu)
```

Budget:
- `scripts/agent-lock-activity.sh`: 189 Zeilen, Limit 800 (Delta ~40 Zeilen, verbleibend ~570)
- `scripts/factory/watchdog.sh`: 448 Zeilen, Limit 800 (Delta ~30 Zeilen, verbleibend ~320)
- `scripts/agent-lock.sh`: 626 Zeilen, Limit 800 (Delta ~10 Zeilen, verbleibend ~160)
- `tests/spec/factory-watchdog/worktree-activity-shield.bats`: neu, keine S1-Begrenzung
Keine der Dateien ist in `docs/code-quality/baseline.json` gelistet.

## Task 1: Erweiterte Aktivitäts-Probe `_worktree_recently_active` (RED → GREEN)

**RED — Failing-Test-Step (erwartet FAIL):**

Lege `tests/spec/factory-watchdog/worktree-activity-shield.bats` an mit Tests für:
1. `_worktree_recently_active` erkennt einen Prozess mit cwd im Worktree (bestehende Semantik).
2. `_worktree_recently_active` erkennt einen Prozess, der ein offenes Datei-Handle (`/proc/*/fd/*`)
   auf eine Datei im Worktree hält, selbst wenn seine cwd außerhalb liegt.
3. `_worktree_recently_active` erkennt Dateien im Worktree mit `mtime` jünger als
   `FACTORY_WORKTREE_ACTIVE_MIN` (Default: 10 Minuten).
4. `_worktree_recently_active` liefert Exit 1 (false), wenn weder cwd, noch fd, noch kürzliche
   mtime vorhanden sind.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/factory-watchdog/worktree-activity-shield.bats
# expected: FAIL (Funktion _worktree_recently_active existiert noch nicht)
```

**GREEN — Fix-Step:**

In `scripts/agent-lock-activity.sh` die Funktion `_worktree_recently_active <wt>` implementieren:
- Prüft zuerst `_worktree_has_active_process "$wt"` (cwd-Match).
- Prüft danach `/proc/*/fd/*`: Symlinks auflösen (`readlink -f`), ausschließen der eigenen PIDs
  (`_my_pids`), prüfen ob das Target unterhalb von `$wt` liegt.
- Prüft danach Dateisystem-mtime: `find "$wt" -maxdepth 4 -not -path '*/.git*' -mmin "-${FACTORY_WORKTREE_ACTIVE_MIN:-10}"`
  (falls Treffer vorhanden, positiv).
- Gibt 0 zurück bei Aktivität, sonst 1.

Run des BATS-Tests aus dem RED-Step muss jetzt GREEN sein.

## Task 2: Watchdog Zombie-Cleanup Aktivitäts-Gate & factory_excluded (RED → GREEN)

**RED — Failing-Test-Step (erwartet FAIL):**

Erweitere `tests/spec/factory-watchdog/worktree-activity-shield.bats` um Szenarien:
1. `_wd_cleanup_worktree` schont einen Worktree, wenn `_worktree_recently_active` positiv meldet,
   und hinterlässt einen Audit-Kommentar am Ticket statt den Worktree zu löschen.
2. `_wd_cleanup_worktree` prüft `readiness.factory_excluded` des Tickets und überspringt die
   Löschung, wenn `factory_excluded=true` gesetzt ist (T006364).
3. `_wd_cleanup_worktree` löscht einen unberührten Zombie-Worktree ohne Aktivität wie bisher.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/factory-watchdog/worktree-activity-shield.bats
# expected: FAIL (_wd_cleanup_worktree ruft _worktree_recently_active noch nicht auf)
```

**GREEN — Fix-Step:**

In `scripts/factory/watchdog.sh`:
- In `_wd_cleanup_worktree`:
  - Prüfe `factory_excluded` über `ticket.sh get --id "$ext_id" | jq -r '.readiness.factory_excluded // false'`
    — falls true: Worktree schonen und Return 0.
  - Source `scripts/agent-lock-activity.sh` bzw. nutze `_worktree_recently_active "$stale_wt"`.
  - Falls positiv: `ticket.sh add-comment` mit Hinweis auf kürzliche Aktivität und Return 0.
  - Erst danach: `git worktree remove --force` ausführen.

Run des BATS-Tests aus dem RED-Step muss jetzt GREEN sein.

## Task 3: Reap/Purge-Serialisierung über Registry-flock (RED → GREEN)

**RED — Failing-Test-Step (erwartet FAIL):**

Erweitere `tests/spec/factory-watchdog/worktree-activity-shield.bats` um Serialisierungs-Tests:
1. Zombie-Purge in `watchdog.sh` und Reap in `agent-lock.sh` erwerben denselben Lock
   (`$(_lock_dir)/.registry.lock`), sodass Cleanup und Reap nicht parallel in denselben Pfad
   greifen.
2. `_wd_cleanup_worktree` wiederholt die Liveness-Probe unmittelbar vor dem `git worktree remove`
   unter dem Lock.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/factory-watchdog/worktree-activity-shield.bats
# expected: FAIL (flock-Serialisierung in _wd_cleanup_worktree fehlt noch)
```

**GREEN — Fix-Step:**

In `scripts/factory/watchdog.sh`:
- Vor dem Löschschritt in `_wd_cleanup_worktree` `_with_lock` aus `agent-lock.sh` aufrufen (oder
  denselben Registry-flock via fd 9 beziehen).
- Unter dem Lock unmittelbar vor `git worktree remove` erneut `_worktree_recently_active` und
  Worktree-Existenz prüfen.

Run des BATS-Tests aus dem RED-Step muss jetzt GREEN sein.

## Task 4: Finale Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich, weil neue Test-Dateien angelegt wurden:

```bash
task test:inventory   # components/website/src/data/test-inventory.json committen
```
