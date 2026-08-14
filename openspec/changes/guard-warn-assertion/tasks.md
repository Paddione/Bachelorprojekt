---
title: Line-scoped WARN assertions and fail-closed pool pre-check
ticket_id: T006031
domains: [test]
status: planning
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Line-scoped WARN assertions and fail-closed pool pre-check — Implementation Plan

Die WARN-Assertion in `schedule-blocker-gate-hardening.bats` nutzt zwei unqualifizierte
Greps (die `$a`-Hälfte ist via Plan-JSON erfüllbar, die „WARN"-Hälfte matcht jede künftige
WARN-Zeile); `_skip_if_pool_busy` ist fail-open bei `slots.sh count`-Fehlern (T006031,
Review PR #4497).

## File Structure

- `tests/spec/software-factory/schedule-blocker-gate-hardening.bats` — Assertion + Pre-Check (Task 2)
- `tests/spec/software-factory/schedule-blocker-gate.bats` — gleicher Pre-Check-Fix (Task 2)

## Task 1 — Gegenprobe (RED-Äquivalent)

Der präzisierte Test ist heute grün (die WARN existiert) — ein maschinelles RED vor dem
Fix gibt es nicht. Nachweisweg in zwei Schritten:

1. Schwachpunkt-Smoke (vor dem Fix): die heutige weite Assertion ist ohne WARN-Zeile
   erfüllbar — `printf 'T000123\n' | grep -q 'WARN' || printf 'T000123\n' | grep -q 'T000123'`
   → Exit 0, obwohl keine WARN-Zeile existiert (die `$a`-Hälfte matchen das Plan-JSON).
   Beleg im Plan-Update notieren.
2. Failing-Test-Step (nach dem Fix): WARN-Zeile temporär in `scripts/factory/schedule.sh`
   auskommentieren, dann
   `tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/schedule-blocker-gate-hardening.bats`
   — expected: FAIL (die präzisierte Assertion findet „open blockers:" nicht). WARN-Zeile
   wiederherstellen, erneuter Lauf — expected: PASS (3/3 bzw. bedingter Pool-Skip).

## Task 2 — GREEN: Assertion präzisieren, Pre-Check fail-closed

1. `schedule-blocker-gate-hardening.bats` Z. 97-98:
   `echo "$output" | grep "open blockers:" | grep -qF "$a"` (eine Zeile, ein Match;
   zusätzlich die dangling-WARN-Assertion analog zeilengebunden, falls vorhanden).
2. `_skip_if_pool_busy`: `[[ "$used" =~ ^[0-9]+$ ]] || skip "slot count unavailable"` —
   nicht-numerisches Ergebnis → skip (fail-closed).
3. Denselben Pre-Check-Fix in `schedule-blocker-gate.bats` (T005306) spiegeln.
4. Zeilennummern-Verweise in den Guard-Kommentaren auf Content-Anker umstellen
   (Review-Minor 2).
5. Guard-Suiten laufen lassen (Pool-bedingt skip ist ok — T003548: bedingt, nicht
   dauerhaft); Gegenprobe (b) ausführen und dokumentieren.

## Task 3 — Verifikation

- `task test:changed` + `task freshness:regenerate` + `task freshness:check`
- `bash scripts/openspec.sh validate guard-warn-assertion`
