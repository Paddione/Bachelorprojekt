---
ticket_id: T005560
plan_ref: openspec/changes/ticket-lock-stale-pass/tasks.md
status: active
date: 2026-08-14
---

# Design: ticket.sh — Stale-Holder-Pass-Through

## Root-Cause (empirisch, 2026-08-14)

Der ursprüngliche T005560-Befund („Reaper räumt toten ticket-Lock nicht") reproduziert sich nicht: Mit realistischer Fixture (quoted Timestamps) reapt `_reapable` den toten Lock korrekt als `heartbeat-ttl`. Der T005029-Lock war per Design nicht reapable (lebende SID, frischer Heartbeat) — die Reibung lag im **Write-Guard**: `ticket.sh` blockt eigene Status-Writes (Exit 7), sobald ein ticket-Lock gehalten wird, und `check` unterscheidet nicht, ob der Halter noch lebt.

## Fix

1. `scripts/agent-lock.sh` `cmd_check`: Nach der „held"-Entscheidung prüfen, ob `owner_pid` tot ist (nicht reapable, aber Halter nachweislich beendet) → Ausgabe `held-stale`, **rc=4** (advisory; der Lock wird NICHT entfernt).
2. `scripts/vda/ticket/_ticket-core.sh` `_ticket_lock_guard`: rc==4 → Warnung an stderr (Halter-Felder) + **return 0** — ein toter Halter schützt keine Doppelbearbeitung; lebende Halter (rc=3) bleiben voll geschützt.

Bewusst nicht angefasst: SID-Drift zwischen Bash-Claim und MCP-Write-Kontext (T002498-M10 — der Own-Session-Pass-Through existiert, der Residualfall bleibt über `TICKET_LOCK_OVERRIDE=1` abgedeckt).

## Teststrategie

Failing Test `tests/spec/scripts/agent-lock-stale-holder.bats` (rot verifiziert): Fixture = toter owner_pid, frische Heartbeat, existierender Worktree mit Branch-Match (wie T005029) → `check ticket` muss rc=4 + `held-stale` liefern. Positiv-Anker: Lock existiert und ist nicht „free".

## Betroffene Dateien

| Datei | Änderung |
|---|---|
| `scripts/agent-lock.sh` | cmd_check: held-stale-Zweig (rc=4) |
| `scripts/vda/ticket/_ticket-core.sh` | Guard: rc==4 → warn + pass |
| `tests/spec/scripts/agent-lock-stale-holder.bats` | neu (rot) |
| `openspec/changes/ticket-lock-stale-pass/specs/scripts.md` | Delta: check-Contract-Requirement |
