## ADDED Requirements

### Requirement: Brain-Ingest-Delivery-Integrität

Der Brain-Ingest SHALL jeden Lauf vom aktuellen `origin/main` des Ziel-Repos starten und SHALL die Auslieferung verhindern, wenn der Base des generierten Commits beim Delivery-Zeitpunkt nicht mehr dem aktuellen `origin/main` entspricht, es sei denn, der generierte Commit lässt sich sauber auf den neuen Main rebasen.

#### Scenario: Run starts from current main even when delivery branch exists

- **GIVEN** der Remote-Branch `feature/brain-initial-ingest` existiert im Ziel-Repo und liegt N Commits hinter `origin/main`
- **WHEN** ein Ingest-Lauf die Branch-Preparation durchführt
- **THEN** wird der Arbeitsbranch von `origin/main` (nicht von `origin/$BRANCH`) erzeugt

#### Scenario: Main moved during generation — rebase or abort

- **GIVEN** ein Ingest-Lauf hat generiert und `origin/main` ist währenddessen um mindestens einen Commit gewandert
- **WHEN** das Staleness-Gate vor dem Push prüft
- **THEN** wird der einzelne generierte Commit auf den neuen `origin/main` gerebased, sofern der Rebase konfliktfrei durchläuft
- **AND** schlägt der Rebase fehl, bricht der Lauf mit Exit-Code ungleich 0 ab, ohne zu pushen

#### Scenario: Rejected push fails loudly

- **GIVEN** der Remote-Branch divergiert vom lokalen Stand (Push würde nicht fast-forwarden)
- **WHEN** der Delivery-Push ausgeführt wird
- **THEN** endet der Skriptlauf mit Exit-Code ungleich 0 und einer Fehlermeldung
- **AND** der Lauf meldet keinen Erfolg (`exit 0` nach fehlgeschlagenem Push ist verboten)
