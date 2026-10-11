---
title: assert-phase-chain Order-Check unterscheidet auto- vs reale Events
ticket_id: T901881
domains: [ticket-system, gates]
status: staged
---

# assert-phase-order — Implementation Plan

Single-Plan (ein Skript + Tests). Ursache belegt: `update-status in_progress`
emittiert auto `implement:entered`, `stage-plan` emittiert auto `plan:done`
(das Gate filtert nur letzteres heraus). Reales `plan:done` entsteht erst per
Backfill nach dem Gate-Fail, weil dev-flow-plan keines emittiert und execute es
nur im touched_files-Ergänzungszweig tut. Der Order-Check sieht deshalb
implement-auto vor plan-real und meldet eine Violation — False Positive,
beobachtet an T901788 und T901750.

## File Structure

| Datei | Änderung |
|---|---|
| `scripts/vda/ticket/assert-phase-chain.sh` | Auto plan:done als Ordnungs-Anker, Vollständigkeit weiter nur real |
| `tests/py/spec/ticket-system/test_assert_phase_order.py` | RED-Tests (bereits im Branch, 114 Zeilen) |
| `components/website/src/data/test-inventory.json` | Regenerieren falls verändert |

`scripts/vda/ticket/assert-phase-chain.sh` hat Ist 91 bei Budget 709.
`tests/py/spec/ticket-system/test_assert_phase_order.py` hat Ist 114 bei Budget 686.
Beide Dateien liegen weit unter ihrer wirksamen Schwelle, kein Split nötig.

## Task 1 — RED-Bestätigung

- Step: `python3 -m pytest tests/py/spec/ticket-system/test_assert_phase_order.py -q` — expected: FAIL, die beiden Ordnungssemantik-Tests rot.
- Acceptance: `test_auto_vor_real_ist_keine_order_violation` und
  `test_fehlendes_reales_plan_done_bleibt_luecke` scheitern;
  `test_echte_verletzung_bleibt_violation` und
  `test_saubere_reale_kette_bleibt_gruen` bleiben grün.

## Task 2 — Order-Check unterscheidet auto- vs reale Events

- In `scripts/vda/ticket/assert-phase-chain.sh` die SQL-`WHERE`-Klausel
  `AND NOT (e.phase IN ('scout', 'design', 'plan') AND e.detail = 'auto: stage-plan')`
  entfernen, sodass alle Phasen-Events in chronologischer Folge ankommen.
- In der Auswerte-Schleife auto `plan:done`-Zeilen (`detail` beginnt mit
  `auto:`) als Ordnungs-Anker `has_plan_auto` verbuchen, ohne `has_plan` zu
  setzen. `missing[]` verlangt dadurch weiterhin reale Evidenz.
- `order_error` bei `implement:entered` nur setzen, wenn weder reales noch
  auto `plan:done` vorausgeht. Die `verify:done`-Regel bleibt unverändert.
- Header-Kommentar um die gültige Reihenfolge ergänzen: auto-Anker zählen für
  die Ordnung, reale Events für die Vollständigkeit.
- Meldungstexte und JSON-Schlüssel unverändert lassen (Aufrufer und Tests
  pinnen `OK: phase chain complete and ordered`, `order violation`,
  `missing real evidence`, `ok`, `missing`, `order_error`).
- Acceptance: `bash -n scripts/vda/ticket/assert-phase-chain.sh` ist grün und
  `python3 -m pytest tests/py/spec/ticket-system/test_assert_phase_order.py -q`
  meldet 4/4 grün.

## Task 3 — Verifikation und Inventar

- Step: `task test:changed`
- Step: `task test:inventory` nach der Test-Änderung, danach
  `components/website/src/data/test-inventory.json` mitcommitten.
- Step: `task freshness:regenerate`
- Step: `task freshness:check`
- Acceptance: alle drei Verify-Kommandos grün, Inventar committet.
