## ADDED Requirements

### Requirement: preflight-pr-scope prüft ALLE Ticket-IDs des PR-Titels gegen den Branch
<!-- bats: preflight-multi-ticket-id.bats -->

`scripts/preflight-pr-scope.sh` SHALL collect **every** ticket ID matching `[T######]` or
`T######` from the PR title and SHALL exit 0 when **at least one** of them is contained in the
current branch name (case-insensitive). It SHALL exit non-zero only when the title contains at
least one ticket ID and **none** of them matches the branch; in that case the FATAL message SHALL
name all ticket IDs found in the title.

#### Scenario: Zweite Ticket-ID im Titel passt zum Branch *(BATS)*
- **GIVEN** der aktuelle Branch heißt `work-t003103`
- **WHEN** `scripts/preflight-pr-scope.sh "fix(ops): loest T003180 mit [T003103]"` aufgerufen wird
- **THEN** endet der Befehl mit Exit-Code 0

#### Scenario: Erste Ticket-ID im Titel passt zum Branch *(BATS)*
- **GIVEN** der aktuelle Branch heißt `work-t003103`
- **WHEN** `scripts/preflight-pr-scope.sh "fix(ops): [T003103] loest nebenbei T003180"` aufgerufen wird
- **THEN** endet der Befehl mit Exit-Code 0

#### Scenario: Keine der Titel-IDs passt zum Branch *(BATS)*
- **GIVEN** der aktuelle Branch heißt `work-t003103`
- **WHEN** `scripts/preflight-pr-scope.sh "fix(ops): loest T003180 und [T003074]"` aufgerufen wird
- **THEN** endet der Befehl mit Exit-Code ungleich 0
- **AND** die FATAL-Zeile enthält sowohl `T003180` als auch `T003074`

#### Scenario: Einzelne passende Ticket-ID bleibt unverändert gültig *(BATS)*
- **GIVEN** der aktuelle Branch heißt `work-t003103`
- **WHEN** `scripts/preflight-pr-scope.sh "fix(ops): einzelnes Ticket [T003103]"` aufgerufen wird
- **THEN** endet der Befehl mit Exit-Code 0

#### Scenario: Einzelne fremde Ticket-ID fällt weiterhin durch *(BATS)*
- **GIVEN** der aktuelle Branch heißt `work-t003103`
- **WHEN** `scripts/preflight-pr-scope.sh "fix(ops): fremdes Ticket [T003180]"` aufgerufen wird
- **THEN** endet der Befehl mit Exit-Code ungleich 0
- **AND** die Ausgabe enthält `does not match current branch`
