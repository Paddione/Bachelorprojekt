# Proposal: scheduling-cleanup-teardown

## Purpose (deutsch)

Die seit T005029 genutzten Fixture-Helfer `seed_real_feature`/`purge_real_feature` räumen ihre
Seeds am **Ende der Test-Bodies** auf. BATS führt Bodies unter `set -eET` aus — eine
fehlgeschlagene Assertion bricht den Body vor dem Purge ab, der Seed bleibt als Ghost in der
k3d-Dev-DB zurück (`status=in_progress` via claim-gang, unsichtbar in der Queue) und belegt
dauerhaft Pool-Slots. FA-SF-25 zählt diese Slots global: jeder rote Lauf erzeugt neue Ghosts
und macht den nächsten Lauf wieder rot — eine selbstvergiftende Kaskade (im ersten
GREEN-Versuch von T005029 real getroffen, im Post-Merge-Review als Important-Befund bestätigt).

Dieser Change verlagert den Cleanup in den Teardown-Pfad: `seed_real_feature` registriert jede
erzeugte external_id in einer file-scoped Registry, `_sf_teardown` purgt alle registrierten IDs
(teardown läuft unabhängig vom Test-Ausgang). Zusätzlich bekommt `purge_real_feature` einen
Titel-Guard (`SF-REAL-`-Prefix), damit eine falsche ID nie ein echtes Ticket hart löscht, und
FA-SF-25-Assertions werden, wo semantisch möglich, auf die geseedeten IDs gefiltert.

## Goals

- Ghost-freie Dev-DB auch nach rotem Lauf: Cleanup im `_sf_teardown` statt im Test-Body
  (scheduling.bats: purge-Aufrufe in Bodies entfallen; der Negativ-Anker-`return 1`-Pfad in
  FA-SF-24 ist mit abgedeckt).
- `purge_real_feature` mit Fixture-Guard (`AND title LIKE 'SF-REAL-%'`) — Review-Befund 4 aus
  dem Post-Merge-Review von PR #4438.
- FA-SF-25-Assertions auf die geseedeten e1/e2 filtern; wo das semantisch nicht trägt, die
  Clean-DB-Vorbedingung als Kommentar dokumentieren (Review-Befund 3).
- Neuer BATS-Guard `scheduling-cleanup-guard.bats`, der die Teardown-Konvention und den
  purge-Guard dauerhaft absichert (rot vor dem Fix, grün danach).

## Non-Goals

- Kein Auto-Purge-Mechanismus für die Produktions-Factory (die Ghosts entstehen nur durch
  Test-Fixtures).
- Keine Änderung an queue.sh/slots.sh selbst — die Slot-Buchhaltung ist korrekt, die
  Fixtures hinterließen nur unaufgeräumte Zustände.
- Kein genereller Laufzeit-Isolationstest parallel laufender bats-Suites (die bekannte
  Dev-DB-Parallel-Kollision, Mishap 2026-08-14, ist ein separates Thema).

## Symptom vs. Ursache (T002448-M5)

- **Symptom:** Nach rotem `scheduling.bats`-Lauf bleiben `sf-real-*`-Zeilen in
  `tickets.tickets` (status=in_progress) zurück; FA-SF-25 schlägt dann mit „free < 2" fehl.
- **Ursache (belegt im Post-Merge-Review von PR #4438):** Purge-Aufrufe stehen am Body-Ende
  (scheduling.bats:150, 173-174, 190-191); BATS führt Bodies unter errexit aus
  (`tests/unit/lib/bats-core/lib/bats-core/test_functions.bash`), eine fehlgeschlagene
  Assertion bricht vor dem Purge ab. Der erste GREEN-Versuch von T005029 (fehlender
  lastenheft-Lock → Positiv-Anker rot) hat diesen Pfad real durchlaufen.

## Design-Entscheidungen

1. **File-scoped Registry** `$BATS_FILE_TMPDIR/sf-seeded-ids` statt globaler Variable:
   BATS-Instanzen isoliert, kein Shared-State über parallele Dateien, von
   `seed_real_feature` (tests/lib) und `_sf_teardown` (_sf_common.bash) gleichermaßen
   erreichbar.
2. **Purge-Loop in `_sf_teardown`**: Bestehendes Muster — viele software-factory-Testdateien
   rufen bereits `teardown() { _sf_teardown; }`; nur Dateien, die seeden, haben Einträge in
   der Registry (leere Liste = No-op).
3. **Titel-Guard im DELETE** statt separater Existenzprüfung: atomar, ein SQL-Roundtrip,
   deckt den falsche-ID-Fall strukturell ab.
