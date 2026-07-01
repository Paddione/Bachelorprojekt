---
title: "Proposal: agent-lock.sh claim persistiert Lock-Datei zuverlässig"
ticket_id: T001384
plan_ref: openspec/changes/agent-lock-claim-persist/tasks.md
status: planning
date: 2026-07-01
---

# Proposal: agent-lock.sh claim persistiert Lock-Datei zuverlässig (T001384)

> Quelle: `docs/superpowers/specs/2026-07-01-agent-lock-claim-persist-design.md`
> (Root-Cause-Analyse, drei zusammenwirkende Defekte in
> `scripts/agent-lock.sh`).
> Reine Skript-Korrektur — keine API-/Schema-Änderung, keine neuen Module.
> Verifizierbar per BATS-Suite `tests/spec/agent-lock-claim-persist.bats`.

## Why

`bash scripts/agent-lock.sh claim …` liefert `exit=0`, aber die Lock-Datei
`$GIT_COMMON_DIR/agent-locks/<scope>__<id>.json` existiert nicht. Erst ein
zweiter Claim-Aufruf legt sie an. Direkt betroffen: Wave-1-Sessions
(T001404, T001387) — die `.reap.log` zeigt für beide Tickets
`worktree-missing`-Drops innerhalb der ersten Sekunden nach dem Claim.
Herkunft: Mishap T001380 M3.

Drei zusammenwirkende Defekte in `scripts/agent-lock.sh`:

1. `_reapable` prüft `worktree-missing` **vor** `sid-alive` — ein lebender
   Owner schützt die Datei nicht davor, vom Reaper gelöscht zu werden.
2. `cmd_reap` greift **keinen** Registry-Lock, während `cmd_claim`/`refresh`
   über `_with_lock` serialisieren — klassischer TOCTOU-Race.
3. `_lock_dir` resolvet `git-common-dir` per `cd "$cd" && pwd` in einer
   Subshell, abhängig vom `cwd` des rufenden Skripts.

## What

- `scripts/agent-lock.sh` `_reapable()` — Reihenfolge der Reapability-Checks
   umdrehen: zuerst `sid-alive` (→ return 1 = nicht reapable), dann
   `worktree-missing`, `sid-dead`-Grace, `heartbeat-ttl`.
- `scripts/agent-lock.sh` `cmd_reap()` — vor dem `for f in "$d"/*.json; …
   rm -f "$f"` `_with_lock` aufrufen, damit Reap und Claim sich nicht
   überholen können. Schritte 1–2c (Prozesse killen, Worktree prunen,
   Branch-Cleanup) bleiben außerhalb des Locks, weil sie keine
   `agent-locks/*.json` berühren.
- `scripts/agent-lock.sh` `_lock_dir()` — `cd "$(git rev-parse
   --show-toplevel)"` davor, damit der relative `git-common-dir` (`.git`)
   unabhängig vom `cwd` des Aufrufers korrekt resolvet. Fallback
   `/tmp/agent-locks` bleibt bei echtem `git rev-parse`-Fehler.
- `tests/spec/agent-lock-claim-persist.bats` — neu, BATS-Regression-Tests
   für alle drei Defekte.
- `openspec/specs/active-sessions-hub.md` — neue Requirement
   `Claim-Persistenz gegen reap-Race` (siehe specs/active-sessions-hub.md).

**Non-breaking:** keine JSON-Schema-Änderung an bestehenden Lock-Dateien,
kein CLI-Argument-Change, keine Verhaltensänderung für produktive
Reap-Pfade (tote SIDs werden weiterhin nach Grace+Heartbeat-TTL
aufgeräumt).

## Akzeptanzkriterien

- `tests/spec/agent-lock-claim-persist.bats` läuft grün (5 neue Tests + 1
  Regression-Schutz für T001268).
- `tests/spec/agent-lock-session-identity.bats` läuft unverändert grün
  (kein Bruch der T001268-Fixes).
- `task test:changed` und `task freshness:check` sind grün.
- `bash scripts/openspec.sh validate` ist grün für diesen Change.

## Out of scope

- Wechsel auf SQLite/etcd/Consul für die Lock-Registry (bleibt datei-basiert
  im `git-common-dir`).
- Wechsel auf Lease-basierte Lock-Semantik.
- Auto-Recovery beim Reap (Owner bleibt selbst verantwortlich für
  `cmd_refresh`/`cmd_claim`).
- Root-Cause für die T001380-M3-Auslöser-Kette upstream (separates Ticket).

## Capabilities

### Modified Capabilities

- `active-sessions-hub` — neue Requirement zur Reihenfolge der
  Reapability-Checks und zum Lock-Verhalten von `cmd_reap`. Bestehende
  Requirements (Session-Registry SSOT, Harness-Stable Session Identity,
  Pre-Commit Guards, Push-Verification) bleiben unverändert.
