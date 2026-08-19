## MODIFIED Requirements

### Requirement: Sweep überlebt leere ticket.sh-Antwort

The system SHALL continue the sweep in `scripts/branch-reaper.sh` when the ticket status lookup
for a branch's ticket id returns an empty answer (`ticket.sh get --id <id>` with exit code 0 and
empty stdout, i.e. the ticket does not exist in the database), instead of terminating the whole
run silently with a non-zero exit code.

An empty answer SHALL be treated as a **missing measurement**, not as a negative verdict: the
sweep SHALL evaluate the merged-PR positive signals for that branch. The branch SHALL be reaped
only when a positive signal holds, and SHALL otherwise be kept with the "Ticket-Status nicht
ermittelbar" reason.

A ticket status that was successfully read but is not terminal (e.g. `in_progress`) SHALL remain
a hard keep — it is a read statement, not a missing measurement, and SHALL NOT reach the positive
signals.

#### Scenario: Branch mit nicht-existenter Ticket-ID verschont den Sweep

- **GIVEN** a remote branch whose name carries a ticket id that is not present in the ticket
  database (the lookup answers rc=0 with empty stdout) and that has no merged pull request
- **WHEN** `scripts/branch-reaper.sh --sweep --dry-run` runs
- **THEN** the run completes with exit code 0
- **AND** the branch is listed with a `KEEP` line
- **AND** the branches following it are still evaluated (the run does not stop at the
  problematic branch)

#### Scenario: Einzel-Ticket-Lauf mit unbekannter ID bricht nicht ab

- **GIVEN** a ticket id that is not present in the ticket database
- **WHEN** `scripts/branch-reaper.sh --ticket <id> --dry-run` runs
- **THEN** the run completes with exit code 0 instead of dying at the status extraction

#### Scenario: Unbekannter Ticket-Status mit eigenem MERGED-PR wird gereapt

- **GIVEN** a remote branch whose ticket id is not present in the ticket database
- **AND** the branch has its own merged pull request whose `headRefOid` equals the remote tip
- **AND** the branch diverges from `main` outside the allowlist
- **WHEN** `scripts/branch-reaper.sh --sweep --dry-run` runs
- **THEN** the branch is listed with a `REAP` line

#### Scenario: Unbekannter Ticket-Status mit gemergtem Nachfolger wird gereapt

- **GIVEN** a remote branch whose ticket id is not present in the ticket database
- **AND** the branch has no merged pull request of its own
- **AND** another remote branch with a merged pull request carries an identical blob for every
  file in the candidate's divergence set
- **WHEN** `scripts/branch-reaper.sh --sweep --dry-run` runs
- **THEN** the branch is listed with a `REAP` line

#### Scenario: Unbekannter Ticket-Status ohne Positiv-Signal umgeht den Allowlist-Check nicht

- **GIVEN** a remote branch whose ticket id is not present in the ticket database
- **AND** the branch has no merged pull request and no merged successor
- **AND** every file in its divergence set lies inside the allowlist
- **WHEN** `scripts/branch-reaper.sh --sweep --dry-run` runs
- **THEN** the branch is listed with a `KEEP` line
- **AND** it is not reaped, because "ticket done" and "blob diff inside the allowlist" are two
  separately required signals and the allowlist alone must not release a branch

#### Scenario: Gelesener nicht-terminaler Status bleibt ein hartes KEEP

- **GIVEN** a remote branch whose ticket is present in the database with status `in_progress`
- **AND** the branch has a merged pull request whose `headRefOid` equals the remote tip
- **WHEN** `scripts/branch-reaper.sh --sweep --dry-run` runs
- **THEN** the branch is listed with a `KEEP` line
