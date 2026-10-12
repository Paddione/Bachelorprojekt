---
title: assert-phase-chain nimmt auto-implement aus der Ordnungsbasis
ticket_id: T901952
domains: [ticket-system, gates]
status: staged
---

# auto-implement-order — Implementation Plan

Single-Plan (ein Skript + Tests). Ursache belegt: `update-status in_progress`
emittiert auto `implement:entered` (update-status.sh:46); der Assert nimmt das
ERSTE `implement:entered` (auto oder real) als Ordnungsbasis und meldet
`order_error`, wenn kein `plan` (real oder T901881-Anker) vorausgeht. Im
Incident-Direct-Flow (kein `stage-plan`, also kein Anker) ist das permanent rot
und per Append irreparabel — live belegt an T901951
(`ok:false, missing:[], order_error:true`).

Fix-Richtung (Ticket-Option 1, minimaler Blast-Radius): auto `implement:entered`
zählt weiter für die Vollständigkeit, aber nie als Ordnungsbasis. Die Ordnung
bestimmt das erste REALE `implement:entered`. Dadurch strikt weniger
`order_error` (real kommt nie vor auto) und keine neue Fail-Möglichkeit.
Nicht-Ziel: Vollständigkeit für `implement` auf reale Events zu verengen —
das würde heute grüne Tickets ohne reales `implement:entered` neu rot machen.

## File Structure

| Datei | Änderung |
|---|---|
| `scripts/vda/ticket/assert-phase-chain.sh` | Ordnungsbasis nur aus realem `implement:entered` (`has_impl_real`), auto weiter Vollständigkeit |
| `tests/py/spec/ticket-system/test_assert_phase_order.py` | +3 Tests (Incident-Direct-RED, Real-Verletzung-mit-auto, Doku) |
| `components/website/src/data/test-inventory.json` | Regenerieren falls verändert |

`scripts/vda/ticket/assert-phase-chain.sh` hat Ist 101 bei Restbudget 698.
`tests/py/spec/ticket-system/test_assert_phase_order.py` hat Ist 114 (neu 165) bei Restbudget 635.
Beide Dateien liegen weit unter ihrer wirksamen Schwelle, kein Split nötig.

## Task 1 — RED-Bestätigung

- Step: `python3 -m pytest tests/py/spec/ticket-system/test_assert_phase_order.py -q` — expected: FAIL, genau ein Test rot.
- Acceptance: `test_incident_direct_flow_ohne_stage_plan_ist_gruen` scheitert
  mit `order violation`; alle 4 Bestandstests bleiben grün.

## Task 2 — Ordnungsbasis nur aus realem implement:entered

- In `scripts/vda/ticket/assert-phase-chain.sh` die `implement`/`entered`-Regel
  aufspalten: `auto:`-Detail setzt nur `has_impl` (Vollständigkeit, wie bisher);
  nur das erste reale Event setzt zusätzlich `impl_id` und prüft die Ordnung
  gegen `has_plan`/`has_plan_auto` (unverändert).
- Header-Kommentar um die T901952-Semantik ergänzen: auto-implement ist nie
  Ordnungsbasis.
- Meldungstexte und JSON-Schlüssel unverändert lassen (Aufrufer und Tests
  pinnen `OK: phase chain complete and ordered`, `order violation`,
  `missing real evidence`, `ok`, `missing`, `order_error`).
- Acceptance: `bash -n scripts/vda/ticket/assert-phase-chain.sh` ist grün und
  `python3 -m pytest tests/py/spec/ticket-system/test_assert_phase_order.py -q`
  meldet 7/7 grün.

## Task 3 — Verifikation und Inventar

- Step: `task test:changed`
- Step: `task test:inventory` nach der Test-Änderung, danach
  `components/website/src/data/test-inventory.json` mitcommitten.
- Step: `task freshness:regenerate`
- Step: `task freshness:check`
- Acceptance: alle Verify-Kommandos grün, Inventar committet.
