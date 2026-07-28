# Proposal: test-inventory-coverage

## Why

`website/src/data/test-inventory.json` ist das Requirement→Test-Mapping, aus dem die
Rückverfolgbarkeits-Ansicht gespeist wird (Konsument:
`website/src/pages/api/admin/tests/traceability.ts`). Der Erzeuger
`scripts/build-test-inventory.sh` erkennt den Anforderungsbezug einer Testdatei über zwei Wege:
ein ID-Muster im Dateinamen (`FA-SF-04.bats`, `MCP-TASK-RUNNER-001.bats`) oder eine strukturierte
Großbuchstaben-ID im `@test`-Titel. Findet er keinen von beiden, überspringt er die Datei still.

T002416 hat die Art des Bezugs gewechselt: Neue Testdateien tragen ihn seither über den
**Verzeichnisnamen** (`tests/spec/<ssot-spec-slug>/<kurz-slug>.bats`), nicht mehr im Dateinamen.
Diese Bezugsart kennt der Erzeuger nicht.

Gemessen am 2026-07-28 auf `main`: **144 von 149** Dateien unter `tests/spec/` erzeugen keinen
einzigen Inventar-Eintrag. Die 80 vorhandenen `tests/spec`-Einträge stammen aus nur fünf Dateien,
allein 54 davon aus `software-factory.bats`. Betroffen sind auch drei Dateien in `tests/local/`
(`admin-actions-schema.bats`, `e2e-skill-selfpatch.bats`, `mandatory-sequences.bats`) — dieselbe
Ursache, nicht an das Verzeichnis gebunden.

Der Fehler ist selbstverdeckend. `task test:inventory` hängt in `freshness:regenerate`, und
`freshness:check` vergleicht ausschließlich regeneriert gegen committed. Ein Erzeuger, der
deterministisch dieselbe unvollständige Liste produziert, besteht diesen Vergleich perfekt. Der
CI-Gate prüft Konsistenz, nicht Vollständigkeit — und wird nie rot.

Erschwerend prüft der bestehende Test `spec-dir: Test-Inventar erfasst Unterverzeichnisse` in
`tests/spec/ci-cd/spec-dir-convention.bats` das Vorhandensein von `maxdepth 2` im Skripttext statt
das Ergebnis. Er hat korrekte Positiv-Anker nach T002356-M1 und ist trotzdem grün, während die
Aussage seines Titels falsch ist: der `find` **findet** die Dateien, sie fallen erst bei der
ID-Extraktion durch. Ein Positiv-Anker schützt gegen vakuose Behauptungen, nicht gegen die
Verwechslung von Implementierungsdetail und Ergebnis.

## What

Der Erzeuger bekommt einen dritten Erkennungsweg: Findet er weder ein ID-Muster im Dateinamen noch
eine strukturierte ID in den `@test`-Titeln, bildet er die Kennung aus dem Pfad relativ zum
Tier-Verzeichnis, ohne Endung. `tests/spec/software-factory/collision-window.bats` wird damit zu
`id: software-factory/collision-window`, `category: software-factory` — dem SSOT-Spec-Slug. Bei
Dateien auf oberster Ebene fallen `id` und `category` zusammen (`ci-cd`).

Der Fallback greift ausschließlich dort, wo die beiden bestehenden Wege leer ausgehen. Dateien mit
strukturierten IDs bleiben unverändert; `software-factory.bats` liefert weiterhin exakt seine 54
`FA-SF-*`-Einträge. Das JSON-Schema (`id`, `file`, `category`, `kind`) ändert sich nicht, die
Website braucht keine Anpassung. Die Zahl der Einträge steigt von 339 auf rund 480.

Zusätzlich:

- **Fail-closed-Guard**: Der Erzeuger bricht ab, wenn eine gefundene Shell-Testdatei keinen
  Eintrag erzeugt, und nennt die betroffenen Pfade. Nach dem Fallback kann dieser Fall per
  Konstruktion nicht mehr eintreten — der Guard ist bewusst reiner Regressionsschutz für künftige
  Änderungen an der Erfassungslogik und wird deshalb **nicht** durch einen eigenen Test
  abgesichert. Ein solcher Test wäre vakuos und würde genau den Fehler wiederholen, den dieser
  Change behebt.
- **Umlenkbarer Ausgabepfad** über `TEST_INVENTORY_OUT`, damit Tests den Erzeuger ausführen können,
  ohne das committete Inventar zu mutieren.
- **Korrektur von `spec-dir-convention.bats`**: Der Test wird von Skripttext-Prüfung auf
  Ergebnisprüfung umgestellt.

Nicht Teil dieses Changes: Die Slugs einiger Bestandsdateien (`t001586.bats`,
`mishap-bundle-*.bats`, `g-cq02-any-types.bats`) haben kein Gegenstück unter `openspec/specs/`;
ihre `category` zeigt dann auf keinen existierenden Spec. Das ist bestehende Unordnung im
Testbestand, keine Eigenschaft des Erzeugers, und wird hier nicht bereinigt.

_Ticket: T002445_
