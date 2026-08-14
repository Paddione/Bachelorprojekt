---
title: "factory-trace-collector-pass-done — Implementation Plan"
ticket_id: T006282
domains: [scripts, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-trace-collector-pass-done — Implementation Plan

_Ticket: T006282_

## File Structure

| Datei | Ist | Budget | Änderung |
|-------|-----|--------|----------|
| `scripts/finetune/collect_factory_traces.py` | 136 | 664 (Limit 800, nicht-baselined) | `is_successful()` auf `state == "done"`, Docstring korrigieren |
| `tests/spec/unsloth-training-env/factory-traces.bats` | 70 | — (S1-ignored, `tests/**/*.bats` in gates.yaml) | Fixture + Header auf Aufnahme-Mechanik (`entered|done|blocked`) umgestellt |

## Kontext

Der Erfolgsfilter `is_successful()` prüft `phase == 'verify' AND state == 'pass'` —
ein State, den die Aufnahme-Mechanik (`record_phase_event`: `entered|done|blocked`,
software-factory REQ-SF-EXECUTOR-002) nie schreibt. Messung (2026-08-15,
mcp-postgres, Live-DB): verify = 408×done, 266×entered, 0×pass. Der Korpus wäre
heute leer. Entscheidung (design.md): Option A — Predicate auf `state == "done"`,
Referenz bleibt die Aufnahme-Mechanik. Kein toleranter 'pass'-Pfad (toter Code).

Der RED-Test ist bereits angepasst (Fixture: `verify/done` = Erfolg,
`verify/entered` = kein Erfolg) und im Stage-Commit enthalten.

## Tasks

### Task 1: RED — angepassten BATS-Test als failing nachweisen

Prüfmodus: command output verification (T002448-M4) — der Test führt den
Kollektor aus und prüft Ergebnis/Exit-Code, kein Source-Grep.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/unsloth-training-env/factory-traces.bats
# expected: FAIL — der Positiv-Anker (verify/done im Fixture) wird vom heutigen
# 'pass'-Predicate verworfen, grep -c "Erfolgreicher Lauf" liefert 0 statt 1
```

Der Test ist mit dem heutigen Code rot (verifiziert am 2026-08-15: alle drei
@test-Blöcke scheitern, Positiv-Anker zuerst). Positiv-Anker-Pflicht
(T002356-M1) bleibt im Test erhalten.

### Task 2: GREEN — Erfolgsfilter auf `state == "done"` umstellen

In `scripts/finetune/collect_factory_traces.py`:

1. `is_successful()` (Z. 83): `e.get("state") == "pass"` → `e.get("state") == "done"`.
2. Docstring (Z. 23–27) korrigieren: die Behauptung einer 'pass'-Konvention mit
   Verweis auf CLAUDE.md "Merge = Abschluss" ist falsch (CLAUDE.md nennt 'pass'
   nicht). Neu formulieren: Erfolg = mindestens ein Event mit
   `phase == 'verify'` und `state == 'done'`; State-Werte folgen der
   Aufnahme-Mechanik `record_phase_event` (`entered|done|blocked`, vgl.
   software-factory REQ-SF-EXECUTOR-002); `verify/entered` gilt als nicht
   abgeschlossen und wird verworfen.

Keine weiteren Stellen referenzieren 'pass' (geprüft per
`grep -rn "'pass'|\"pass\"" scripts/finetune/` — nur Docstring + Predicate).

S1-Budget: `collect_factory_traces.py` Ist 136, Limit 800, nicht-baselined →
Budget 664. Die Änderung bleibt weit unter der Schwelle (keine
Split-/Shrink-Notwendigkeit).

### Task 3: GREEN — BATS-Test grün nachweisen

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/unsloth-training-env/factory-traces.bats
# expected: PASS — alle drei @test-Blöcke (Positiv-Anker, Secret-Redaktion, measure_corpus-Format)
```

### Task 4: Finale Verifikation (CI-Gates)

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Keine neuen Testdateien angelegt (bestehender Test angepasst) — falls
`freshness:regenerate` das Test-Inventar (`website/src/data/test-inventory.json`)
aktualisiert, wird die Änderung mitcommittet. Keine Baseline-Einträge werden
hinzugefügt (keine neuen Dateien).
