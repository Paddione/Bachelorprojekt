# Design: sf-scheduling-test-drift

Brainstorming-Ergebnis (schriftlich dokumentiert, keine interaktive Session):
Root-Cause-Analyse und Fix-Ansatz zu T005029.

## Root-Cause (verifiziert, T002448-M5)

Zwei eigenständige, vorbestehende Fehlerklassen — beide nur im Live-DB-Lauf sichtbar
(Opt-in T003810), deshalb lange unentdeckt:

1. **FA-SF-24/25 — Test-Erwartungen ≠ queue.sh-Vertrag.** queue.sh filtert seit T002830
   `is_test_data = false`; `seed_test_feature` seedet immer `is_test_data=true`. Die Tests
   erwarten SF-TEST-Features in der Kandidaten-JSON — der Filter macht sie unsichtbar.
   schedule.sh erbt die Lücke über seinen queue.sh-Aufruf. FA-SF-25 "global cap" ist
   zusätzlich vakuos (leere Liste ≤ 1).
2. **FA-SF-26 — stderr im `$output`.** watchdog.sh schreibt bei Tickets ohne phase events
   INFRA-/Counter-Warnungen auf stderr (T002361/T002389). BATS 1.x merged stderr in
   `$output`; die Tests parsen den gemischten Stream mit `jq -e` → parse error.

## Fix-Ansatz (Entscheidung)

**Kein Produktionscode-Fix** — Filter und stderr-Verhalten sind korrekt. Fix in den
Test-Erwartungen + SSOT-Spec-Lücke:

| Datei | Änderung |
|---|---|
| `tests/spec/software-factory/scheduling.bats` | FA-SF-24/25 auf Positiv-(echtes Feature)/Negativ-Anker (SF-TEST unsichtbar) umschreiben; FA-SF-26 watchdog-Aufrufe mit `2>/dev/null` |
| `tests/lib/factory-test-fixtures.sh` | Neue Helferin `seed_real_feature`: legt `is_test_data=false`-Feature an, hartes DELETE-Cleanup per external_id |
| `openspec/specs/software-factory.md` (Delta) | Scenario: `is_test_data=true`-Tickets erscheinen nie in der Kandidaten-JSON |

## Subsysteme

- `scripts/factory/queue.sh` — Filter (unverändert, nur Vertragsquelle)
- `scripts/factory/schedule.sh` — Kandidaten-Ableitung aus queue.sh (unverändert)
- `scripts/factory/watchdog.sh` — stderr-Warnungen (unverändert)
- `tests/lib/factory-test-fixtures.sh` — Seeder/Helfer (erweitert)
- `tests/spec/software-factory/scheduling.bats` — Erwartungen (umschrieben)

## Edge-Cases

- **Dispatch-Race:** echtes Backlog-Feature könnte vom Factory-Timer gegriffen werden
  (Dev-DB, Sekundenfenster) → akzeptiert; Cleanup hart per external_id-DELETE im teardown.
- **purge_factory_test_data löscht nur is_test_data=true** → echtes Feature braucht eigenen
  Cleanup-Pfad (in der Helferin gekapselt).
- **SF-TEST-Titel-Kollision:** Helferin nutzt eindeutigen Titel/`external_id` (wie
  seed_test_feature: `$$`-Suffix), damit parallele Läufe nicht kollidieren.
- **FA-SF-25 global cap:** mit echtem Feature (count ≥ 1) statt leerer Liste — sonst vakuos.
- **Negativ-Anker (T002356-M1):** immer erst Positiv (echtes Feature sichtbar), dann Negativ
  (SF-TEST unsichtbar) im selben Test.
