## ADDED Requirements

### Requirement: claim --force uebernimmt verwaiste Locks mit toter owner_pid

The system SHALL support a `--force` flag on `agent-lock.sh claim` that takes over a lock file when the `owner_pid` is no longer alive (verified via `kill -0`). A dead-PID takeover SHALL be logged to `.reap.log` with reason `claim-force`. If the `owner_pid` is still alive, `--force` SHALL refuse with a diagnostic message and exit code 1.

#### Scenario: claim --force uebernimmt Lock mit toter PID

- **GIVEN** a lock file exists with `owner_pid=999999` (a non-existent process)
- **WHEN** `bash scripts/agent-lock.sh claim ticket T000123 --force --label new-session` is executed from a different SID
- **THEN** the lock file is taken over with `owner_sid` set to the new session and a `claim-force` entry appears in `.reap.log`

#### Scenario: claim --force lehnt ab bei lebender PID

- **GIVEN** a lock file exists with `owner_pid=1` (an alive process)
- **WHEN** `bash scripts/agent-lock.sh claim ticket T000123 --force --label new-session` is executed from a different SID
- **THEN** the claim fails with exit 1 and a diagnostic message containing "claim --force abgelehnt"
- **AND** the lock file remains unchanged

### Requirement: agent-collision vermeidet False Positives bei nicht-existierenden Peer-Dateien

The collision guard SHALL skip the blob comparison for files that do not exist in a peer worktree. Only files confirmed present in both the current and the peer worktree SHALL trigger a collision warning.

#### Scenario: Brandneue Datei loest keinen Alarm aus

- **GIVEN** a new file `docs/new-feature.md` was just created and does not exist in any peer worktree
- **WHEN** the collision guard checks for conflicts
- **THEN** the guard reports no collision for this file
