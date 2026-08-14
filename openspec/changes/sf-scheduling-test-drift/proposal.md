---
title: Proposal: sf-scheduling-test-drift
ticket_id: T005029
domains: [infra, ops, test]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Proposal: sf-scheduling-test-drift

## Why

### Symptom (beobachtet, reproduzierbar)

`task test:changed` meldet 4 not-ok in `tests/spec/software-factory/scheduling.bats`
(FA-SF-24, FA-SF-25 "two disjoint", FA-SF-26 beide Live-DB-Tests). Auf `origin/main`
(975b3295a) gegen die lokale k3d-Dev-DB reproduziert:

```
not ok 1 FA-SF-24: a seeded backlog feature appears in the queue JSON     → jq any() = false
not ok 2 FA-SF-25: two disjoint backlog features both get scheduled       → jq any() = false
ok     3 FA-SF-25: global cap of 1 schedules at most one feature          (vakuos grün, s.u.)
not ok 4 FA-SF-26: stale in_progress → triage + slot freed                → jq parse error
not ok 5 FA-SF-26: stale WITH plan → backlog                              → jq parse error
```

Reproducer (Live-DB-Opt-in wie im Ticket T005029 dokumentiert):

```bash
tests/unit/lib/bats-core/bin/bats --jobs 2 --no-parallelize-within-files \
  --filter 'seeded backlog feature|two disjoint backlog|global cap of 1|stale in_progress feature' \
  tests/spec/software-factory/scheduling.bats
```

### Hypothese des Tickets vs. verifizierte Ursache (T002448-M5)

Das Ticket nannte eine Hypothese: *"queue.sh filtert seit T002830 `is_test_data = false`,
seed_test_feature seedet mit `--is-test-data` — die Test-Erwartungen bilden den Filter nicht ab."*
Die Verifikation bestätigt diese Hypothese für **FA-SF-24/25** — deckt aber **FA-SF-26 nicht ab**:
dort liegt eine zweite, eigenständige Fehlerklasse vor. Beide Ursachen sind mit
Command-Output-Evidenz belegt (kein Source-Grep als Beleg, T002448-M4).

#### Ursache 1 — Test-Drift: queue.sh-Filter (FA-SF-24, FA-SF-25; 2 not-ok)

- `scripts/factory/queue.sh:56` filtert seit T002830 (`f8e6c2aab`, PR #3957, Intent: *"filter
  is_test_data in all queue read paths"*) `AND is_test_data = false`.
- `seed_test_feature` (`tests/lib/factory-test-fixtures.sh`) seedet **immer** mit `--is-test-data`
  (hart verdrahtet) — die Fixtures sind also per Design nie dispatchbar.
- Die Tests erwarten das SF-TEST-Feature in der Queue-JSON → `jq any()` liefert `false`.
- `schedule.sh:42` leitet seine Kandidaten aus `queue.sh` ab → dieselbe Lücke bei FA-SF-25.
- FA-SF-25 "global cap" ist nur scheinbar grün: bei leerer Kandidatenliste gilt `0 ≤ 1` —
  vakuos (Positiv-Anker fehlt, T002356-M1).
- **Der Filter selbst ist korrektes, gewolltes Verhalten** (SF-TEST-Fixtures dürfen nie im
  Dispatch-Pfad landen; derselbe Guard in `list.sh` ist durch `tests/spec/ticket-system/
  list-test-data-filter.bats` abgesichert). Der Drift sitzt in den **Test-Erwartungen**.

#### Ursache 2 — watchdog.sh schreibt stderr-Warnungen in den gemischten Stream (FA-SF-26; 2 not-ok)

- `watchdog.sh` klassifiziert stale Tickets ohne `factory_phase_events` als INFRA-Failure und
  schreibt zwei **stderr**-Warnungen (eingeführt mit T002389 `6ddb80921` und T002361
  `0269e403f`): `watchdog: INFRA failure for <id> (no phase events) — separate counter` und
  `watchdog: <class> attempt counter for <id> unreadable — falling back to plain reset`.
- BATS 1.x merged stderr in `$output`; die Tests füttern den gemischten Stream an `jq -e` →
  `jq: parse error: Invalid numeric literal at line 1, column 9` (repliziert, Exit 5).
- Das Watchdog-Verhalten selbst ist korrekt: Warnungen gehören auf stderr (prod-Logs),
  das Ergebnis-JSON auf stdout.
- Beide Fehlerklassen sind **vorbestehend** (keine Regression durch PR #4423): Die Warnungen
  existieren seit T002361/T002389, die Tests liefen bis zum Live-DB-Opt-in (T003810) nie
  gegen eine echte DB — erst der Opt-in machte das Rot sichtbar.

## What

### Lösungsrichtung: Fix in den Test-Erwartungen + Spec-Lücke schließen — kein Produktionscode-Fix

Der Produktionscode (Filter in queue.sh, stderr-Warnungen im watchdog) ist korrekt.
Die Fix-Richtung ist deshalb: **Test-Erwartungen auf den realen Vertrag umschreiben** und den
Vertrag in der SSOT-Spec verankern.

1. **FA-SF-24/25** — Tests umschreiben auf Positiv-/Negativ-Anker (T002356-M1):
   - Positiv-Anker: ein frisch angelegtes `is_test_data=false`-Backlog-Feature erscheint in der
     Queue-JSON (FA-SF-24) bzw. wird von schedule.sh berücksichtigt (FA-SF-25, inkl. global-cap:
     count ≥ 1 mit einem echten Feature, damit der Test nicht vakuos grün ist).
   - Negativ-Anker: das SF-TEST-Fixture erscheint **nicht** in der Queue-JSON — das ist die
     Filter-Garantie, die den T002830-Schutz testbar absichert (bisher fehlte dafür ein Guard).
   - Neue Fixture-Helferin `seed_real_feature` (Name im Plan finalisieren) in
     `tests/lib/factory-test-fixtures.sh`: legt ein `is_test_data=false`-Feature an **und**
     räumt es hart per `external_id`-DELETE ab (der bestehende `purge_factory_test_data` löscht
     nur `is_test_data=true`-Zeilen). Sie ist die **fehlende Implementierung**: der
     umgeschriebene Test ist im Stage-Commit ROT (`command not found`, status 127) und wird
     erst durch den Helfer grün — Rot-Grün des Fix-Pfads bleibt wörtlich erfüllt.
   - Dispatch-Race bewusst akzeptiert: ein echtes Backlog-Feature könnte theoretisch vom
     Factory-Timer gegriffen werden; das Fenster ist auf Sekunden begrenzt (Test-Dauer) und
     betrifft nur die Dev-DB.
2. **FA-SF-26** — Watchdog-Aufruf im Test isoliert stderr (`2>/dev/null`): `$output` bleibt
   reines JSON, `jq -e` parst wieder; geprüft wird unverändert Reset-Verhalten + Slot-Freigabe.
3. **Spec-Delta (MODIFIED `openspec/specs/software-factory.md`)** — neues Scenario im
   Queue-Abschnitt: SF-TEST-/`is_test_data=true`-Tickets erscheinen **nie** in der
   Kandidaten-JSON (die bestehenden Szenarien ab Zeile ~1284 kennen den Ausschluss nicht —
   dort sitzt die eigentliche Drift-Quelle: Spec und Code sind auseinandergelaufen).

### Bewusst verworfen (im Brainstorming entschieden)

- **queue.sh-Filter entfernen oder abschwächen** — würde T002830 (SF-TEST nie im Dispatch)
  umkehren und den Produktionsschutz aufheben. Nicht der Fix.
- **`seed_test_feature` ohne `--is-test-data` seeden lassen** — dasselbe Sicherheitsrisiko:
  SF-TEST-Fixtures würden dispatchbar. Nicht der Fix.
- **stderr-Warnungen aus watchdog.sh entfernen oder auf stdout verlagern** — sie sind
  gewolltes Observability-Verhalten für prod-Logs (INFRA- vs. MODEL-Zähler). Nicht der Fix.
- **jq-Parsing über den gemischten Stream robust machen** (z. B. letzte Zeile extrahieren) —
  fragiler als die stderr-Isolation, prüft Nebensächliches. Nicht gewählt.

### Offene Fragen

- Exakter Name der Fixture-Helferin (`seed_real_feature` vs. `seed_queue_visible_feature`) —
  im Plan finalisieren (Plan-Subagent).
- Ob der Negativ-Anker zusätzlich auf `queue.sh`-Ausgabezeile `is_test_data = false` in der
  SQL greppt — **nein**: Output-Verifikation statt Source-Grep (T002448-M4), die Negativ-Aussage
  wird über das tatsächliche JSON-Ergebnis belegt.

## Out of Scope

- Andere is_test_data-Lesepfade (`mcp-server.mjs`, `mcp-go/main.go`, `auto-triage.sh`) — deren
  Filterverhalten ist nicht Teil dieses Tickets (kein gemeldeter Drift dort).
- `FA-SF-25 global cap` erhält nur den Positiv-Anker, kein neues Verhalten.
- Kein Produktionscode-Fix in `scripts/factory/*`.
