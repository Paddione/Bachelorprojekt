## ADDED Requirements

### Requirement: Volle BATS-Testmenge läuft grün — Test-Erwartungen folgen dem Produktstand

Die CI SHALL die volle Testmenge (`tests/unit/**/*.bats` und `tests/spec/**/*.bats`) ohne
Diff-Skoping ausführen. Jede Testdatei SHALL gegen den aktuellen Produktstand grün sein;
eine Testdatei, deren Erwartungen durch eine Produktänderung obsolet wurden (entfernte
Feature-Flags, Pflicht-Flags, Pfad-Reorgs, Auth-Migrationen, Re-Export-Konsolidierung,
Helper-Refactor), SHALL an den neuen Stand angepasst werden — veraltete Testerwartungen
sind ein Defekt der Testdatei, nicht des Produkts. Tests, die Produktcode prüfen, SHALL
die Semantik des Produkts zusichern (Gate vorhanden, Fehlermeldung exakt, Verhalten
reproduzierbar) statt veraltete Formulierungen zu konservieren.

#### Scenario: Entferntes Feature-Flag bleibt ohne Test-Assertion

- **GIVEN** ein Skript hat ein Feature-Flag (z. B. `stream`-DNS-Prefix) entfernt
- **WHEN** die volle BATS-Testmenge läuft
- **THEN** assertiert keine Testdatei das entfernte Flag
- **AND** verbleibende aktive Flags sind weiterhin per Positiv-Assertion abgesichert

#### Scenario: Neue Pflicht-Flags sind in Test-Aufrufen gesetzt

- **GIVEN** ein CLI-Skript verlangt seit einer Änderung ein Pflicht-Flag
- **WHEN** Tests das Skript direkt aufrufen
- **THEN** tragen die Aufrufe das Pflicht-Flag
- **AND** das Fehlen des Flags ist durch einen eigenen Guard-Test abgesichert

#### Scenario: Pfad-Reorg bricht Test-Setup nicht

- **GIVEN** der Repo-Code wurde in ein neues Verzeichnis verschoben (z. B.
  `website/` → `components/website/`)
- **WHEN** ein Test das Verzeichnis betritt oder relative Skriptpfade auflöst
- **THEN** verwendet er die aktuelle Verzeichnisstruktur
- **AND** erwartete Fehlermeldungen stimmen exakt mit dem realen String des Produkts
  überein

#### Scenario: Auth-Gate-Wechsel bleibt sicherheits-zugesichert

- **GIVEN** ein oauth2-proxy-Gate wechselt das Verfahren (z. B. Gruppen-Flag →
  `--authenticated-emails-file` mit ConfigMap-Mount)
- **WHEN** der Manifest-Test das Gate prüft
- **THEN** assertiert er das aktuelle Verfahren samt Datenquelle (Mount/ConfigMap)
- **AND** die Zusicherung „der Proxy ist gegated" bleibt erhalten, statt nur das
  Flag-Literal zu tauschen

#### Scenario: Direkt aufgerufene Tests sind selbst lauffähig

- **GIVEN** ein Test braucht installierte npm-Dependencies, die nur ein Task-Wrapper
  vorher installiert
- **WHEN** der Test direkt per bats aufgerufen wird
- **THEN** installiert er seine Dependencies selbst in `setup_file()` oder skippt
  sauber mit Begründung
- **AND** er ist nicht auf einen bestimmten Wrapper angewiesen

#### Scenario: Test-Stubs brechen bei unbekannten Aufrufen laut ab

- **GIVEN** ein Test stubbt ein CLI-Werkzeug (z. B. kubectl)
- **WHEN** das Produktskript ein Subkommando aufruft, das der Stub nicht kennt
- **THEN** bricht der Stub mit einer Meldung und Exit-Code ungleich 0 ab
- **AND** er verschluckt den Aufruf nicht still über einen Default-Case mit Exit 0
