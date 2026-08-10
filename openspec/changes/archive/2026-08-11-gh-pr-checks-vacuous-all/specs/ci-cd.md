## ADDED Requirements

### Requirement: Jedes Prädikat über einer Check-Liste braucht einen Nichtleere-Guard

Jede CI-Warteschleife und jede Auswertung einer PR-Check-Liste im Repo SHALL ihr Urteil aus
**zwei** Bedingungen bilden: die Liste ist **nichtleer**, UND alle Einträge sind grün. Ein
jq-Prädikat der Form `all(...)` ist über der leeren Liste per Definition `true` — die
Auswertung liest daraus „keine Checks mehr pending" und hält einen nie geprüften Stand für
verifiziert. Ein leeres Ergebnis SHALL als eigener Zustand behandelt werden (`empty`), der
weder als Erfolg noch als Rot gilt.

Die Auswertung SHALL in einer gemeinsamen Bibliotheksfunktion liegen, damit die
Nichtleere-Bedingung nicht pro Aufrufstelle neu erfunden (und dabei vergessen) wird. Die
Funktion SHALL genau ein Verdict-Wort aus `empty | red | pending | green` ausgeben und nur
für `green` mit Exit-Code 0 terminieren.

`scripts/factory/pr-babysit-ticket.sh` SHALL diese Funktion nutzen und bei dauerhaft leerer
Check-Liste mit einer Diagnose und einem Exit-Code ungleich 0 terminieren, statt ohne
Fortschritt weiterzupollen.

Hintergrund: Beobachtet 2026-08-09 an PR #4050 während eines ticket-ops-Dispatch. Der PR stand
auf `mergeStateStatus=DIRTY`; ein konfligierender PR startet die CI gar nicht erst, die
Checkliste bleibt leer. Nach einem Rebase erschienen 15 Checks. Verwandt, aber nicht deckend:
T002822 beschreibt die *manuelle* Fehllesart einer leeren Checkliste — dort sieht man die
leere Liste wenigstens. Bei einem automatisierten Prädikat sieht man nur `true`. Strukturell
identisch zur Positiv-Anker-Pflicht bei Negativtests (T002356-M1), wo ein Test über einer
leeren Kandidatenliste ebenfalls vakuos besteht.

#### Scenario: Die leere Check-Liste gilt nicht als grün

- **GIVEN** eine Check-Liste, die als leeres JSON-Array `[]` vorliegt
- **WHEN** die gemeinsame Auswertungsfunktion sie bewertet
- **THEN** lautet das Verdict `empty` und nicht `green`
- **AND** der Exit-Code ist ungleich 0

#### Scenario: Eine nichtleere grüne Liste gilt als grün

- **GIVEN** eine Check-Liste mit mindestens einem Eintrag, alle mit `state = SUCCESS`
- **WHEN** die gemeinsame Auswertungsfunktion sie bewertet
- **THEN** lautet das Verdict `green`
- **AND** der Exit-Code ist 0

#### Scenario: Pending und rot werden von grün getrennt

- **GIVEN** eine nichtleere Check-Liste mit mindestens einem nicht-erfolgreichen Eintrag
- **WHEN** die gemeinsame Auswertungsfunktion sie bewertet
- **THEN** lautet das Verdict `red`, sofern ein Eintrag `FAILURE`, `ERROR` oder `CANCELLED`
  ist, sonst `pending`
- **AND** in keinem der beiden Fälle `green`

#### Scenario: Die Babysit-Schleife terminiert bei leerer Checkliste statt zu drehen

- **GIVEN** `gh pr checks` liefert für den beobachteten PR dauerhaft eine leere Liste
- **WHEN** `scripts/factory/pr-babysit-ticket.sh` seine Poll-Schleife durchläuft
- **THEN** terminiert das Skript mit einem Exit-Code ungleich 0
- **AND** die Ausgabe benennt die leere Checkliste als Ursache
- **AND** das Skript pollt nicht unbegrenzt ohne Fortschritt weiter

#### Scenario: Die Regel ist in der Warteschleifen-Referenz dokumentiert

- **GIVEN** `.claude/skills/references/repo-hygiene-ops.md` §3 („ein leeres Signal ist kein
  Urteil")
- **WHEN** eine Agentin dort nach dem Umgang mit leeren Check-Listen sucht
- **THEN** benennt der Abschnitt das vakuos wahre `all(...)` über der leeren Menge
- **AND** verlangt die vorgeschaltete Nichtleere-Prüfung
