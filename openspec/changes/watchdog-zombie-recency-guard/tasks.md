---
title: "watchdog-zombie-recency-guard — Implementation Plan"
ticket_id: T016418
domains: [factory-watchdog]
status: active
file_locks: [scripts/agent-lock.sh, scripts/agent-lock-activity.sh, scripts/factory/watchdog.sh]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# watchdog-zombie-recency-guard — Implementation Plan

_Ticket: T016418_ · Proposal: `openspec/changes/watchdog-zombie-recency-guard/proposal.md`
Delta-Spec: `openspec/changes/watchdog-zombie-recency-guard/specs/factory-watchdog.md`

## Root Cause (verifiziert)

Incident T016253: heartbeat-ttl-Reap erntete den Branch-Lock eines aktiven Worktrees,
weil die `_worktree_has_active_process`-Probe (scripts/agent-lock-activity.sh:67) nur
AKTUELLE `/proc/*/cwd`-Einträge kennt — die Session arbeitete im Fenster im
Main-Checkout. Danach löschte `_wd_cleanup_worktree` (scripts/factory/watchdog.sh:126)
den unclaimed Worktree als Zombie; seine einzige Prüfung ist uncommitted-changes
(watchdog.sh:142), keine Aktivitätsprüfung.

## File Structure

```
scripts/agent-lock-activity.sh          # Ledger-Writer + Recency-Lesehilfe (177 → ~260)
scripts/factory/watchdog-recency.sh     # NEU — Recency-Probe, von BATS direkt sourbar (~90)
scripts/factory/watchdog.sh             # Spare-Gate in _wd_cleanup_worktree (446 → ~530)
scripts/agent-lock-reap.sh              # NEU — cmd_reap/cmd_refresh extrahiert + flock (~190)
scripts/agent-lock.sh                   # Extraktion, Zeilen MUSSEN sinken (800 → ~620)
tests/spec/factory-watchdog/zombie-recency-guard.bats   # NEU — RED-Tests
tests/spec/agent-lock-reap-serialize.bats               # NEU — Serialisierungstest
```

## S1-Budgets (wirksame Schwelle: `.sh` = 800, docs/code-quality/gates.yaml)

| Datei | Ist | Ziel | Reserve |
|---|---|---|---|
| scripts/agent-lock-activity.sh | 177 | ~260 | ~540 |
| scripts/factory/watchdog-recency.sh | neu | ~90 | ~710 |
| scripts/factory/watchdog.sh | 446 | ~530 | ~270 |
| scripts/agent-lock-reap.sh | neu | ~190 | ~610 |
| scripts/agent-lock.sh | **800 (AM LIMIT)** | ~620 | +180 |

**Harte Randbedingung:** `scripts/agent-lock.sh` sitzt exakt auf dem S1-Limit von 800
Zeilen — JEDE Addition bricht `task test:code-quality`. Deshalb werden `cmd_reap()`
(Z. 694) und `cmd_refresh()` (Z. 508) samt ihrer privaten Helfer in das neue Fragment
`scripts/agent-lock-reap.sh` extrahiert und über den bestehenden Loader-Loop
(agent-lock.sh:772) eingebunden — dasselbe Muster wie agent-lock-guards.sh [T002375-p1].
Die Extraktion ist genehmigt als Teil dieses Plans; der Netto-Effekt auf agent-lock.sh
ist negativ. Die Reihenfolge im Loader-Loop muss erhalten bleiben (identity → guards →
merged → activity → reap), da `_reapable` Fragmente vor reap referenziert.

## Verify (RED → GREEN)

- [ ] **Step 1 — Failing tests schreiben (RED).** Zwei neue BATS-Dateien:

      a) `tests/spec/factory-watchdog/zombie-recency-guard.bats` — sourced
      `scripts/factory/watchdog-recency.sh` direkt (kein DB-Setup nötig):
      - Probe positiv bei lebendem Prozess mit cwd im Worktree (`sleep`-Kindprozess
        mit `cd` ins Temp-Worktree)
      - Probe positiv bei Ledger-Datei jünger als Schwelle
      - Probe negativ bei silent Worktree ohne Lock-Herzschlag
      - Lock-Herzschlag innerhalb der Schwelle macht Probe positiv (Lock-JSON mit
        `heartbeat_at=now`, `worktree=<pfad>`)
      - `WATCHDOG_RECENCY_MIN` überschreibt die 10-Minuten-Default

      b) `tests/spec/agent-lock-reap-serialize.bats` — prüft, dass während eines
      gehaltenen Reap-flocks ein paralleler zweiter Reap-Aufruf sich sauber zurückzieht
      (rc/log-Muster), und dass `bash scripts/agent-lock.sh reap` nach der Extraktion
      weiterhin alle bisherigen Untertests besteht:
      ```bash
      tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-liveness-heartbeat.bats tests/spec/agent-lock-branch-reap-T002785.bats
      # expected: FAIL (red — watchdog-recency.sh existiert nicht, flock fehlt)
      ```

- [ ] **Step 2 — Ledger-Writer (GREEN, Teil 1).** In
      `scripts/agent-lock-activity.sh`: `_activity_touch <worktree>` schreibt
      Epochensekunden nach `$(_lock_dir)/activity/$(_sanitize <worktree>)` (tmp+mv,
      best-effort wie `_touch_heartbeat`). Aufrufe: in `_touch_heartbeat` (nach dem
      Heartbeat-Update) und am Ende von `_touch_own_worktree_heartbeats` für den
      aktuellen cwd-Worktree. Verzeichnis `activity/` wird lazy angelegt (`mkdir -p`).

- [ ] **Step 3 — Recency-Probe (GREEN, Teil 2).** Neue Datei
      `scripts/factory/watchdog-recency.sh`, gesourct von watchdog.sh (Pfad über
      `"$(dirname "${BASH_SOURCE[0]}")/../watchdog-recency.sh"`, Fail-loud wie der
      Fragment-Loader): `_wd_worktree_recent_activity <wt> [min]` → rc 0 = schonen.
      Drei Signale, ODER-verknüpft:
      1. `/proc/*/cwd`-Scan auf den Worktree (Eigenbau-Scan wie
         `_worktree_has_active_process`, ohne die _my_pids-Ausnahme — der Watchdog ist
         fremd gegenüber jeder Session),
      2. Ledger-Datei `$(git rev-parse --git-common-dir)/agent-locks/activity/<slug>`
         mit Alter < min*60 (Default min=10, Env `WATCHDOG_RECENCY_MIN`),
      3. irgendeine Lock-JSON unter `agent-locks/` mit `worktree == wt` und
         `heartbeat_at` jünger als min*60 — auch wenn der Lock selbst reapable ist
         (genau die Incident-Lücke T016253).

- [ ] **Step 4 — Spare-Gate im Watchdog (GREEN, Teil 3).** In
      `scripts/factory/watchdog.sh` `_wd_cleanup_worktree`: VOR dem force-remove
      `_wd_worktree_recent_activity "$stale_wt"` fragen; rc 0 ⇒ kein Löschen,
      stattdessen Ticket-Kommentar "Watchdog: zombie worktree spared — recent activity
      within threshold". Negativ ⇒ bisheriger Pfad unverändert. Der gesamte
      Entscheide+Löschen-Block läuft unter dem gemeinsamen Reap-flock (siehe Step 5).

- [ ] **Step 5 — Serialisierung + Extract/Shrink (GREEN, Teil 4).** Neue Datei
      `scripts/agent-lock-reap.sh`: enthält `cmd_reap()` und `cmd_refresh()` aus
      agent-lock.sh unverändert in der Logik, aber beide wickeln ihre
      Entscheide-Schleife in einen flock auf
      `$(_lock_dir)/.reap.flock` (`exec 9>"$f"; flock 9`) mit Timeout 60s — bei
      Timeout nur Log-Zeile, kein Fehler. watchdog.sh belegt denselben flock um den
      purge-Block in `_wd_cleanup_worktree`. Damit kann heartbeat-ttl-Reap und
      Zombie-Purge nicht mehr gleichzeitig über denselben Zustand entscheiden.
      agent-lock.sh: Funktionskörper entfernen, Fragment in den Loader-Loop
      (Z. 772) einreihen, shellcheck-Source-Kommentar ergänzen. Kein anderes
      Verhalten von `reap`/`refresh` ändert sich — die Bestandstests aus Step 1b
      müssen grün bleiben.

- [ ] **Final Verification.** Alle drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich gezielt:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/factory-watchdog/
node --test scripts/code-quality/*.test.mjs   # S1: agent-lock.sh muss UNTER 800 fallen
```
