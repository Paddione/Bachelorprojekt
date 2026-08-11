## ADDED Requirements

### Requirement: Pre-push validiert nur die tatsächlich neuen Commits

Der pre-push Hook SHALL nur Commits auf Conventional-Commit-Konformität prüfen, die weder von
`origin/main` noch vom Remote-Branch-Tip (`REMOTE_SHA`) erreichbar sind. Ein nach
`git rebase origin/main` gepushter Branch SHALL nicht an bereits gemergten main-Commits
scheitern, deren Scopes zwischenzeitlich konsolidiert wurden (T002328). Die
Range-Berechnung SHALL in einem testbaren Helfer-Skript liegen, das gegen ein temporäres
Git-Repo verifizierbar ist.

#### Scenario: Push nach Rebase auf main wird akzeptiert

- **GIVEN** ein Feature-Branch, der per `git rebase origin/main` auf einen neuen main-Stand
  gebracht wurde, dessen main-Commits Scopes tragen, die nach T002328 nicht mehr erlaubt sind
- **WHEN** der Branch gepusht wird
- **THEN** werden nur die eigenen, nicht von `origin/main` erreichbaren Commits validiert
- **AND** der Push wird nicht wegen der gemergten main-Commits abgelehnt

#### Scenario: Stale origin/main-Ref zieht keine fremden Commits in den Range

- **GIVEN** ein lokaler `origin/main`-Ref, der älter ist als das main, auf das der Branch
  rebased wurde
- **WHEN** der Branch gepusht wird
- **THEN** sind die rebased main-Commits zusätzlich über den Remote-Branch-Tip vom Range
  ausgeschlossen
- **AND** ein tatsächlich scope-fremder eigener Commit wird weiterhin abgelehnt

### Requirement: Cluster-abhängige Spec-Tests werden in CI mit echtem Cluster ausgeführt

Die CI SHALL die Untermenge cluster-abhängiger `tests/spec/*.bats`-Dateien in einem Job mit
erreichbarem Kubernetes-Cluster ausführen (ok/not-ok), statt sie still zu überspringen oder
diff-scoped gar nicht zu selektieren. Die Auswahl SHALL über ein dediziertes Skript laufen,
dessen Registry durch einen Spec-Test gegen stille Ausreißer abgesichert ist. Scheitert der
Cluster-Setup, SHALL der Job fehlschlagen (fail-closed), nie still grün sein.

#### Scenario: Nightly führt die Cluster-Specs mit echtem Cluster aus

- **GIVEN** ein CI-Lauf ohne vorherige Auswahl-Einschränkung (nightly)
- **WHEN** der Cluster-Spec-Job läuft
- **THEN** wird ein k3d-Cluster mit Kontext `k3d-mentolder-dev` erstellt
- **AND** alle Registry-Dateien werden mit BATS ausgeführt und als ok/not-ok berichtet
- **AND** der Job meldet die Anzahl ausgeführter und übersprungener Tests

#### Scenario: Cluster-Setup-Fehler ist laut

- **GIVEN** der Cluster-Setup-Schritt schlägt fehl (kein Docker, k3d-Installation kaputt)
- **WHEN** der Cluster-Spec-Job läuft
- **THEN** bricht der Job mit Fehlschlag ab
- **AND** kein Test wird still als grün gemeldet

#### Scenario: Registry-Ausreißer werden vom Spec-Test erkannt

- **GIVEN** eine neue `tests/spec/*.bats`-Datei, die `kubectl` oder `cluster_running()`
  verwendet
- **WHEN** der Registry-Paritäts-Test läuft
- **THEN** meldet er die Datei als nicht in der Cluster-Registry erfasst
- **AND** die Datei wird nicht still übersprungen

### Requirement: Reine Spec-Änderungen lösen keine Live-E2E-Läufe aus

Die Diff-Selektion von `task test:changed` SHALL `openspec/`-Pfade (Spec- und Delta-Dateien)
nicht als Website-/E2E-relevant werten — eine Spec-Datei ist kein Website-Code. Eine E2E-Gruppe
SHALL nur starten, wenn die Ziel-Umgebung tatsächlich erreichbar ist; ist sie es nicht, SHALL
ein sichtbarer Skip erscheinen statt eines Live-Laufs, der am Auth-Setup scheitert.

#### Scenario: Reine openspec/-Änderung startet keine korczewski-E2E

- **GIVEN** ein Diff, der ausschließlich `openspec/`-Pfade (und generierte Artefakte) berührt
- **WHEN** `task test:changed` die E2E-Relevanz auswertet
- **THEN** wird keine E2E-Gruppe gestartet
- **AND** die Ausgabe nennt die Relevanz-Entscheidung

#### Scenario: Live-E2E ohne erreichbare Ziel-Site skippt sichtbar

- **GIVEN** ein Diff, der die korczewski-E2E-Gruppe relevant macht, und eine nicht
  erreichbare Ziel-Site
- **WHEN** `task test:changed` die Gruppe starten will
- **THEN** erscheint eine sichtbare Skip-Meldung
- **AND** kein Playwright-Lauf gegen die Live-Site beginnt

### Requirement: Archive-Commits enthalten das regenerierte Status-Artefakt

Der Archive-Vorgang SHALL nach dem Verschieben eines Changes nach
`openspec/changes/archive/` das regenerierte `website/src/data/openspec-status.json` stagen
und als Teil des Archive-Commits committen. Das Archiv-Skill SHALL vor dem Commit prüfen, dass
das Artefakt im Commit enthalten ist.

#### Scenario: Archive staged das Status-Artefakt

- **GIVEN** ein Change, dessen Verzeichnis nach `openspec/changes/archive/` verschoben wird
- **WHEN** `scripts/openspec.sh archive` den Vorgang abschließt
- **THEN** ist `website/src/data/openspec-status.json` im Git-Index staged
- **AND** der folgende Archive-Commit enthält das Artefakt

#### Scenario: Das Skill verlangt den Artefakt-Commmit

- **GIVEN** eine Agentin, die einen Change archiviert
- **WHEN** sie das Archiv-Skill befolgt
- **THEN** enthält die Anleitung einen Pflicht-Schritt, der `git status` auf das
  regenerierte Status-Artefakt prüft
- **AND** ein Fehlen des Artefakts im Commit wird vor dem Commit gemeldet

### Requirement: Abgelehnter Commit wird vor dem Push verifiziert

Die git-workflow-Dokumentation SHALL nach jedem `git commit` eine Verifikation verlangen,
dass der Commit tatsächlich gelandet ist — per `git log -1 --oneline` oder durch Verkettung
`git commit … && git push …`. Eine abgelehnte Commit-Message (commit-msg-Hook) SHALL nicht
hinter einer erfolgreichen Push-Ausgabe verschwinden, die einen älteren Commit überträgt.

#### Scenario: Commit-Verifikation deckt die Hook-Ablehnung ab

- **GIVEN** ein `git commit`, dessen Message vom commit-msg-Hook abgelehnt wird
- **WHEN** die Agentin die git-workflow-Anleitung befolgt
- **THEN** erkennt sie über `git log -1 --oneline`, dass der Commit nicht gelandet ist
- **AND** sie pusht nicht erst, nachdem die Ablehnung geprüft wurde

## MODIFIED Requirements

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
für `green` mit Exit-Code 0 terminieren. **Jede** CI-Warteschleife im Repo — einschließlich
`scripts/devflow-ci-watch.sh` — SHALL diese Funktion nutzen; ein eigenes
Check-Listen-Prädikat an einer Aufrufstelle ist nicht zulässig.

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

#### Scenario: devflow-ci-watch.sh nutzt die gemeinsame Funktion

- **GIVEN** `scripts/devflow-ci-watch.sh` bewertet den Zustand einer PR-Check-Liste
- **WHEN** die Bewertung stattfindet
- **THEN** verwendet das Skript `ci_checks_verdict` aus `scripts/lib/ci-checks.sh`
- **AND** eine leere Check-Liste terminiert weiterhin mit Exit-Code ungleich 0

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
