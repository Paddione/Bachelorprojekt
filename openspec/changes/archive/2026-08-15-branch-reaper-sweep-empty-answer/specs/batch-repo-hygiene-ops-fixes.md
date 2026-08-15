## ADDED Requirements

### Requirement: Sweep überlebt leere ticket.sh-Antwort

The system SHALL continue the sweep in `scripts/branch-reaper.sh` when the ticket status lookup
for a branch's ticket id returns an empty answer (`ticket.sh get --id <id>` with exit code 0 and
empty stdout, i.e. the ticket does not exist in the database). The branch SHALL be kept with the
"Ticket-Status nicht ermittelbar" reason instead of terminating the whole run silently with a
non-zero exit code.

#### Scenario: Branch mit nicht-existenter Ticket-ID verschont den Sweep

- **GIVEN** a remote branch whose name carries a ticket id that is not present in the ticket
  database (the lookup answers rc=0 with empty stdout)
- **WHEN** `scripts/branch-reaper.sh --sweep --dry-run` runs
- **THEN** the run completes with exit code 0
- **AND** the branch is listed with a `KEEP` line
- **AND** the branches following it are still evaluated (the run does not stop at the
  problematic branch)

#### Scenario: Einzel-Ticket-Lauf mit unbekannter ID bricht nicht ab

- **GIVEN** a ticket id that is not present in the ticket database
- **WHEN** `scripts/branch-reaper.sh --ticket <id> --dry-run` runs
- **THEN** the run completes with exit code 0 instead of dying at the status extraction
