---
title: "K3 freshness db-changed deadlock: allow refresh for re-baseline"
ticket_id: T900996
domains: [scripts]
status: active
---

# k3-freshness-db-changed — Implementation Plan

## File Structure

- `scripts/mcp/cbm-freshness.py`: `cmd_status` decision logic — `db-changed` aus der fatal-Liste nehmen, eigenen Recovery-Zweig fuer Re-Baseline via Refresh.
- `tests/spec/cbm-stampede-guard.bats`: T900996 RED-Test (db-changed meldet unknown MIT `refresh_allowed == true`).

## Root Cause (T002448-M5: Symptom vs. Ursache getrennt, per Reproducer belegt)

- **Symptome (Fakt):** `python3 scripts/mcp/cbm-freshness.py status ...` meldet `status unknown`,
  `reasons [db-changed]`, `receipt null`, `refresh_allowed false`, Exit 1 — live reproduziert
  (PRE=38899f9f7) sowie isoliert per Stub-CLI-Reproducer (Wrapper-Baseline, danach DB-Datei
  veraendern → exakt dieses Output-Bild).
- **Ursache (Hypothese → belegt):** `cmd_status` in `scripts/mcp/cbm-freshness.py` nullt bei
  DB-Stat-Abweichung das Receipt (`reasons += db-changed`, `receipt = None`, Zeilen ~391-395)
  UND `db-changed` steht in der `fatal`-Menge (~Zeile 414). Damit greift keiner der
  Recovery-Zweige (fresh/stale/initial-refresh verlangen `not has_fatal`); der else-Zweig
  liefert `unknown` + `refresh_allowed False`. Deadlock: Die einzige Heilung (Refresh via
  Single-Flight-Wrapper schreibt ein neues Receipt mit aktuellem DB-Stat) ist genau dann
  verboten, wenn sie noetig waere — der Hourly-Cron kann sich nicht selbst heilen.
- **Verstaerkend:** `same_db` vergleicht size/mtime_ns/ino/mode/path exakt; Hintergrund-Writer
  aendern mtime/Size ca. alle ~30 min (Ticket-Evidenz), sodass jedes Receipt schnell veraltet.

## Fix-Ansatz (entschieden, keine Alternative noetig — Ticket gibt Zielverhalten vor)

`db-changed` aus `fatal` entfernen und einen expliziten Recovery-Zweig einfuehren:
`receipt None` + nur `db-changed` (kein sonstiges fatales Reason, kein Probe-Failure) →
`status unknown`, Reason `db-changed` bleibt erhalten, `refresh_allowed True`. Receipt bleibt
`null` (veraltete Evidenz wird nicht wiederverwendet); der naechste Wrapper-Refresh schreibt
ein neues Receipt mit aktuellem DB-Stat (Re-Baseline). Fail-closed bleibt: `db-changed`
kombiniert mit anderen fatalen Reasons oder Probe-Failures → weiterhin `unknown` ohne
Refresh (bestehendes Verhalten unveraendert). Nicht-Ziel: `same_db`-Toleranzen lockern,
Cron-/Wrapper-Aenderungen, Umgebungs-Refactoring.

## S1-Budget

- `scripts/mcp/cbm-freshness.py` (Ist 649, Budget 151): Aenderung ist ein ~10-zeiliger
  Entscheidungszweig, netto deutlich unter Budget.
- `tests/spec/cbm-stampede-guard.bats`: nur ein angehaengter Test (~20 Zeilen), keine
  Produktionsdatei-Vergroesserung.

## Tasks

### Task 1 — RED-Test verifizieren (failing Test als Harte Voraussetzung)

- [ ] Step 1: RED-Test im Worktree ausfuehren und Rot bestaetigen — expected: FAIL
  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/cbm-stampede-guard.bats --filter T900996
  ```
  Erwartet: genau der neue Test scheitert an `.refresh_allowed == true`
  (alle frueheren Assertions — `unknown`, `db-changed`, `receipt == null` — bestehen und
  belegen die Isolation des Bugs).
- [ ] Gate: kein Produktionscode angefasst (`git status` zeigt nur `tests/`).

### Task 2 — Fix: `db-changed` re-baseline-faehig machen

- [ ] Step 1: In `cmd_status` (`scripts/mcp/cbm-freshness.py`) `db-changed` aus der
  `fatal`-Menge entfernen.
- [ ] Step 2: Neuen Zweig nach dem `initial-refresh`-Zweig einfuegen: `receipt is None`
  und `db-changed` in reasons und kein sonstiges fatales Reason und kein Probe-Failure →
  `status unknown`, `refresh_allowed True` (Reason-Liste unveraendert lassen, kein neues
  Reason erfinden; `receipt` bleibt `null`).
- [ ] Step 3: Kombinationsfaelle pruefen (Code-Review): `db-changed` + z. B.
  `probe-malformed`/`receipt-malformed`/`attempt-failed` → weiterhin `unknown` mit
  `refresh_allowed False`.
- [ ] Gate: Diff betrifft nur `scripts/mcp/cbm-freshness.py`, netto ~+10 Zeilen.

### Task 3 — Gruen + Guards (finaler Verify-Task)

- [ ] Step 1: T900996-Test einzeln gruen fahren:
  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/cbm-stampede-guard.bats --filter T900996
  ```
- [ ] Step 2: Volle Spec-Datei gruen (keine Regression der T900805-Faelle):
  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/cbm-stampede-guard.bats
  ```
- [ ] Step 3: Mandatory Verify-Commands:
  ```bash
  task test:changed
  task freshness:regenerate
  task freshness:check
  ```
- [ ] Gate: alle drei Commands Exit 0; `git status` zeigt nur `tests/`,
  `.agents/plans/` und ggf. `components/website/src/data/test-inventory.json`.
