# T005561 — task test:changed strukturell rot: Watchdog-Tests kollidieren über die geteilte k3d-Dev-DB

## Problem

`task test:changed` ist lokal bei **jedem** Lauf rot mit 8 Fehlschlägen:
FA-SF-04/34, T002610 ×2, T003810 ×2, FA-SF-25 ×2. Betroffen sind auch Dateien ohne Bezug zum
Change. Alle 8 Tests isoliert grün; seriell 184/184 grün. CI ist nicht betroffen
(Cluster-lose Runner, `_skip_if_no_db` skippt — T002375-p4).

**Root-Cause (strukturell):** `scripts/factory/watchdog.sh::_stale_query` selektiert **global**
über die eine geteilte SDLC-DB:

```sql
SELECT external_id, type FROM tickets.tickets
 WHERE type NOT IN ('project','incident')
   AND status='in_progress'
   AND updated_at < now() - make_interval(mins => <STALE_MIN>)
```

Mehrere Watchdog-Testvarianten laufen mit `FACTORY_STALE_MIN=0` (scheduling.bats FA-SF-25/26,
orphan-slot-reap.bats T002610, retry-limit.bats T003810). Bei parallelen Läufen
(`task test:changed` dispatched Tests parallel, `-j`) trifft jeder dieser Läufe auch die
**in_progress-Seeds der anderen Läufe** — er setzt deren Status/Slots zurück und bricht die
Assertions der anderen Dateien. Reproduktion: zweimal `task test:changed` parallel bzw.
`bats scheduling.bats` während ein anderer Lauf aktiv ist.

## Lösung

Zwei komplementäre Schritte:

1. **Test-Seeds gegen den globalen Stale-Sweep isolieren:** Die Watchdog-Tests markieren ihre
   Seeds so, dass sie nur vom eigenen Lauf angefasst werden. Konkret: Die Seed-Funktion
   (`seed_test_feature` in `tests/lib/factory-test-fixtures.sh`) setzt einen eindeutigen
   Test-Marker (z.B. einen `notes`/Metadaten-Eintrag oder ein eindeutiges `areas`/`component`-
   Tag mit Test-Suffix), und `_stale_query` erhält einen optionalen Ausschluss-Filter
   (`FACTORY_STALE_EXCLUDE_TEST_SEEDS=1` → `notes NOT LIKE 'sf-test-%'` o.ä.), den die
   STALE_MIN=0-Testläufe setzen. Damit greift kein Testlauf die Seeds des anderen an.

2. **Rot-Tests (bereits committet):** `tests/spec/software-factory/watchdog-parallel-isolation.bats`
   erzwingt (a) Isolation bei jedem `FACTORY_STALE_MIN=0`-Aufruf und (b) einen kapselbaren
   Test-Ausschluss im Watchdog.

## Scope

- **In Scope:** `scripts/factory/watchdog.sh` (Test-Seed-Ausschluss in `_stale_query`),
  `tests/lib/factory-test-fixtures.sh` (Seed-Marker), die drei betroffenen Testdateien
  (Marker setzen + `FACTORY_STALE_EXCLUDE_TEST_SEEDS=1` bei STALE_MIN=0-Läufen), Rot-Tests.
- **Nicht in Scope:** Keine Änderung am Watchdog-Produktionsverhalten ohne den Test-Filter
  (Default bleibt unverändert); kein DB-Schema-Change (Marker kommt in bestehende Spalte);
  keine CI-Änderung.

## Offene Fragen

Keine — Befund aus T005561 ist durch die 8 Fehlschläge belegt; die Isolations-Richtung ist
durch den Rot-Test vorgegeben. Der Implementer kann die konkrete Marker-Spalte wählen
(notes vs. areas-Tag), solange der Ausschluss deterministisch und Test-typisch ist.
