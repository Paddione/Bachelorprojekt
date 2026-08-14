## ADDED Requirements

### Requirement: Include-namespaced Taskfile-Subcalls adressieren die Root-Taskfile per führendem Doppelpunkt

Tasks that call other tasks from an include-namespaced Taskfile SHALL address tasks
declared in the root Taskfile with a leading colon (`task: :dev:firewall:open`), because
go-task resolves an unqualified `task: dev:firewall:open` relative to the include
namespace (`brainstorm:dev:firewall:open`) and aborts with "does not exist".

The brainstorm include SHALL delegate `brainstorm:firewall:open` and `brainstorm:setup`
to the dev-stack firewall logic via root addressing; both dry-runs SHALL exit 0 and SHALL
show the delegated ufw commands (`ufw reload`).

#### Scenario: Dry-Run von brainstorm:firewall:open delegiert an die dev-stack-Firewall

- **GIVEN** der Fix `task: :dev:firewall:open` ist in `taskfiles/Taskfile.brainstorm.yml` angewendet
- **WHEN** `task brainstorm:firewall:open --dry` läuft
- **THEN** endet der Befehl mit Exit-Code 0
- **AND** die Ausgabe zeigt die ufw-Delegation (`ufw reload`)
- **AND** die Ausgabe enthält keine „does not exist"-Namespace-Fehlauflösung

#### Scenario: Dry-Run von brainstorm:setup erreicht dieselbe Delegation

- **GIVEN** `brainstorm:setup` ruft `firewall:open` im selben Include auf
- **WHEN** `task brainstorm:setup --dry` läuft
- **THEN** endet der Befehl mit Exit-Code 0
- **AND** die Ausgabe zeigt die ufw-Delegation (`ufw reload`)
- **AND** die Ausgabe enthält keine „does not exist"-Namespace-Fehlauflösung
