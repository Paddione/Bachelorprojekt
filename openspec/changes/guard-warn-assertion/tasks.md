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

- [x] 1. Schwachpunkt-Smoke (vor dem Fix): die heutige weite Assertion ist ohne WARN-Zeile
  erfüllbar — `printf 'T000123\n' | grep -q 'WARN' || printf 'T000123\n' | grep -q 'T000123'`
  → Exit 0, obwohl keine WARN-Zeile existiert (die `$a`-Hälfte matchen das Plan-JSON).
- [x] 2. Failing-Test-Step (nach dem Fix): WARN-Zeile temporär in `scripts/factory/schedule.sh`
  auskommentieren, dann
  `tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/schedule-blocker-gate-hardening.bats`
  — siehe Notiz unten (Umgebungs-Kontention verhinderte den Live-Lauf bis zur Assertion;
  deterministischer Ersatzbeleg ausgeführt). WARN-Zeile wiederhergestellt (kein schedule.sh-Diff
  aus der Gegenprobe im Commit).

## Task 2 — GREEN: Assertion präzisieren, Pre-Check fail-closed

- [x] 1. `schedule-blocker-gate-hardening.bats`: Assertion auf
  `echo "$output" | grep "open blockers:" | grep -qF "$a"` präzisiert (eine Zeile, ein Match;
  keine dangling-WARN-Assertion im File vorhanden, die analog anzupassen wäre).
- [x] 2. `_skip_if_pool_busy`: `[[ "$used" =~ ^[0-9]+$ ]] || skip "slot count unavailable"` —
  nicht-numerisches Ergebnis → skip (fail-closed).
- [x] 3. Denselben Pre-Check-Fix in `schedule-blocker-gate.bats` (T005306) gespiegelt.
- [x] 4. Zeilennummern-Verweise in `scripts/factory/schedule.sh`-Guard-Kommentaren auf
  Content-Anker umgestellt („Z. 106-107" → „im Query-Aufruf unten"; `factory-blocked.bats:40`
  → @test-Name `static: schedule.sh claims slots`).
- [x] 5. Guard-Suiten gelaufen (Pool-bedingter Skip beobachtet — T003548: bedingt, nicht
  dauerhaft); Test 1 (archived blocker) lief live mit freiem Pool: PASS. Gegenprobe-Belege
  dokumentiert (siehe Notiz).

## Task 3 — Verifikation

- [x] `task test:changed` + `task test:spec:changed` (tests/spec-Berührung, T002291)
- [x] `task freshness:regenerate` + `task freshness:check` (Artefakte committet, Reihenfolge
  regenerate → commit → check)
- [x] `bash scripts/openspec.sh validate guard-warn-assertion`

## Plan-Update — Gegenproben-Belege (2026-08-15)

**Schwachpunkt-Smoke (Task 1.1, ausgeführt):**

```bash
printf 'T000123\n' | grep -q 'WARN' || printf 'T000123\n' | grep -q 'T000123'
# Exit 0 — die weite Assertion ist ohne jede WARN-Zeile grün (die $a-Hälfte matcht das Plan-JSON).
```

**Deterministischer Assertions-Semantik-Beleg (ersetzt den Live-Failing-Test-Step):**
Die lokale Dev-Factory (Autopilot) hielt den Slot-Pool über 30+ Minuten durchgehend belegt
(6/6 Slots, inkl. des T006031-eigenen Pipeline-Slots). Drei Live-Läufe mit auskommentierter
WARN-Zeile liefen im freien Fenster tatsächlich an und FAILten — aber am Positiv-Anker
(fremder Claim während des Laufs), nicht an der WARN-Assertion. Deshalb zusätzlich der
deterministische Beweis der Assertions-Semantik (dieselbe Klasse wie der Review-Befund):

```bash
# Fall 1 — Review-Befund: Output ohne "open blockers:"-Zeile, Blocker-ID nur im Plan-JSON,
# unverwandte WARN-Zeile vorhanden:
output=$'schedule: WARN slot claim failed for T999998 — skipping candidate: pool\n[{"brand":"korczewski","external_id":"T000111","slot":1}]'
# ALT:  grep -q "WARN" || grep -q "$a"      → PASSIERT (grün trotz fehlender Block-WARN)
# NEU:  grep "open blockers:" | grep -qF "$a" → schlägt an (rot — korrekt)
# Fall 2 — Positiv-Kontrolle: "open blockers: T000111" vorhanden → NEU passiert (grün).
# Fall 3 — "open blockers: T999998" (fremde ID) → NEU schlägt an (rot — korrekt).
```

Ausgeführtes Skript: `/tmp/t006031-assertion-proof.sh` (Fall 1-3, alle Erwartungen bestätigt).

**Live-Läufe (Pool-Fenster):** `every block emits a WARN` mit auskommentierter WARN-Zeile
dreimal am Positiv-Anker gefailt („unblocked candidate … not claimed", fremde Claims im Lauf);
mit restaurierter WARN-Zeile lief `archived blocker satisfies the gate` live grün durch
(Mechanik inkl. neuer Pre-Check-Assertion bestätigt); restliche Läufe Pool-conditional geskippt
(T003548). schedule.sh wurde nach der Gegenprobe auf den Kommentar-Diff (Task 2.4) zurückgerollt
— die WARN-Zeile selbst ist unverändert, kein Logik-Diff im Commit.
