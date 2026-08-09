## ADDED Requirements

### Requirement: wakeup.sh beantwortet --help mit Usage ohne Seiteneffekte

The system SHALL make `scripts/factory/wakeup.sh --help` (and `-h`) print the
usage to stdout, exit 0, and perform NO factory side effect (no env sourcing,
no flock, no git pull, no force-tick consumption, no dispatcher tick).

#### Scenario: Help-Aufruf bleibt wirkungslos

- **GIVEN** the factory wrapper `scripts/factory/wakeup.sh`
- **WHEN** it is invoked as `bash scripts/factory/wakeup.sh --help`
- **THEN** it prints the usage text and exits 0
- **AND** the dispatcher-bridge stub is never invoked

### Requirement: wakeup.sh weist unbekannte Argumente ab

The system SHALL reject any argument other than `--help`/`-h` in
`scripts/factory/wakeup.sh` with an error message on stderr and a non-zero exit
code, WITHOUT performing any factory side effect.

#### Scenario: Unbekanntes Argument wird abgewiesen

- **GIVEN** the factory wrapper `scripts/factory/wakeup.sh`
- **WHEN** it is invoked with an unknown argument (e.g. `--bogus`)
- **THEN** it prints an error naming the argument to stderr and exits non-zero
- **AND** the dispatcher-bridge stub is never invoked
