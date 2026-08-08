---
title: backfill-id zieht external_id aus der kanonischen Sequenz
ticket_id: T002732
domains: [bachelorprojekt-db, bachelorprojekt-test]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# backfill-id-sequence — Implementation Plan

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `scripts/vda/ticket/backfill-id.sh` | 30 | 770 |
| `tests/spec/ticket-system/backfill-id-sequence.bats` | 158 | kein S1-Limit für `.bats` |
| `openspec/changes/backfill-id-sequence/specs/ticket-system.md` | Delta-Spec | nicht metrikpflichtig |
| `website/src/data/test-inventory.json` | generiert | nicht metrikpflichtig |

`scripts/vda/ticket/backfill-id.sh` ist nicht gebaselinet; wirksame Schwelle ist das
Extension-Limit für `.sh` (800) aus `docs/code-quality/gates.yaml`. Die geplante Änderung fügt
etwa fünf Zeilen hinzu — kein Split nötig.

## Partials

| # | Rolle | Zieldateien |
|---|---|---|
| p1 | fix + tests | `scripts/vda/ticket/backfill-id.sh`, `tests/spec/ticket-system/backfill-id-sequence.bats`, `website/src/data/test-inventory.json` |

Ein einzelnes Partial: die Änderung umfasst zwei Zeilen Produktionscode in einer Datei. Eine
Aufteilung erzeugte mehr Koordinationsaufwand als Nutzen.

## Task 1 — RED bestätigen

Der Failing-Test liegt bereits im Branch (`tests/spec/ticket-system/backfill-id-sequence.bats`,
committet im Plan-Stage-Commit). Vor der Implementierung seinen roten Zustand bestätigen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system/backfill-id-sequence.bats
# expected: FAIL — 4 von 4 Tests rot
```

Erwartete Fehlerbilder, jeweils aus dem richtigen Grund:

1. Konsistenztest nennt `ticket_id_seq` als referenziert-aber-nicht-angelegt und zeigt
   `backfill-id.sh:20` als Fundstelle.
2. bis 4. `$status` ist 3 statt 0, weil `psql` mit
   `relation "tickets.ticket_id_seq" does not exist` abbricht.

Zeigt ein Test ein anderes Fehlerbild, vor dem Weitermachen klären — ein Test, der aus dem
falschen Grund rot ist, wird durch den Fix nicht verlässlich grün.

Läuft kein lokaler Cluster, überspringen die Tests 2 bis 4 mit `skip`; Test 1 muss auch dann
rot sein, da er offline arbeitet.

## Task 2 — Sequenzname korrigieren

In `scripts/vda/ticket/backfill-id.sh`, Zeile 20:

```sql
-- vorher
SET external_id = 'T' || LPAD(nextval('tickets.ticket_id_seq')::text, 6, '0'),
-- nachher
SET external_id = 'T' || LPAD(nextval('tickets.external_id_seq')::text, 6, '0'),
```

`tickets.external_id_seq` ist die Sequenz, aus der auch der BEFORE-INSERT-Trigger
`tickets.fn_assign_external_id()` zieht. Ein zweiter Zähler wäre inhaltlich falsch: er vergäbe
T-Nummern, die der Trigger später erneut vergibt.

Danach Test 1 erneut ausführen — er muss grün sein, Tests 2 bis 4 bleiben rot (die
Trefferzahl-Meldung aus Task 3 fehlt noch):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system/backfill-id-sequence.bats
```

## Task 3 — Trefferzahl melden

Das Kommando gibt aus, wie viele Zeilen es aktualisiert hat. Ein Lauf ohne Treffer ist der
Normalfall und kein Fehler, darf aber nicht wie geleistete Arbeit aussehen — genau dieser stille
Erfolg ließ die Kollision in T002731 unbemerkt.

Zwei Ausgabeformen, beide auf Zeilenanfang verankert, weil die Tests darauf prüfen:

```
backfill-id: 0 Zeilen ohne external_id - nichts zu tun
backfill-id: 3 Zeile(n) nachgetragen
```

Umsetzungshinweise:

- Exit-Code bleibt in beiden Fällen 0.
- Die Zeilen des `RETURNING`-Blocks weiterhin unverändert ausgeben — nachgelagerte Aufrufer
  könnten sie auswerten. Die Zählmeldung kommt zusätzlich, nicht anstelle.
- Trefferzahl aus dem tatsächlichen Ergebnis ableiten (Anzahl der `RETURNING`-Zeilen), nicht aus
  einer zweiten Abfrage — eine separate Zählabfrage sähe einen anderen Zeitpunkt und könnte eine
  andere Zahl melden als die, die das Kommando bewirkt hat.
- Keine ASCII-fremden Zeichen in den Meldungen; das Skript wird auch aus Kontexten aufgerufen,
  deren Locale nicht gesetzt ist.

Danach müssen alle vier Tests grün sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system/backfill-id-sequence.bats
```

## Task 4 — Aufräum-Nachweis

Die Verhaltenstests legen eine Zeile in `tickets.tickets` an und entfernen sie wieder. Nach dem
Testlauf prüfen, dass nichts zurückbleibt:

```bash
POD=$(kubectl get pod -n workspace --context k3d-mentolder-dev \
  -l 'app in (shared-db, shared-db-dev)' --field-selector status.phase=Running -o name | head -1)
kubectl exec -i "$POD" -n workspace --context k3d-mentolder-dev -c postgres -- \
  psql -U website -d website -qtA -c \
  "SELECT count(*) FROM tickets.tickets WHERE title = 'T002732 backfill-id testrow';"
# erwartet: 0
```

Ist die Zahl größer als 0, die Zeilen löschen und klären, warum das `teardown` nicht griff.

Erwartet und unbedenklich: der Testlauf zieht Werte aus `tickets.external_id_seq` und hinterlässt
Lücken in der T-Nummerierung. Die `UNIQUE`-Constraint schützt gegen Doppelvergabe, nicht gegen
Sprünge. Die Sequenz NICHT zurücksetzen — das kollidierte mit gleichzeitigen echten Inserts.

## Task 5 — Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich:

```bash
# Test-Inventar (neue Testdatei — CI vergleicht gegen den committeten Stand)
task test:inventory
git diff --exit-code website/src/data/test-inventory.json

# Guard: Pod-Selektion im neuen Test führt den status.phase-Filter
bash scripts/check-pod-phase-filter.sh

# Beide BATS-Formen der Spec erfassen (Sammeldatei UND Verzeichnis, T002696)
tests/unit/lib/bats-core/bin/bats -r tests/spec/ticket-system*
```

Der letzte Befehl ist bewusst so geschrieben: eine gezielte Suche nur nach
`tests/spec/ticket-system.bats` fände die neue Datei im Verzeichnis nicht, und der Befund fiele
erst in CI auf.
