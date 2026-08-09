## ADDED Requirements

### Requirement: Agent-lock reap removes locks without parsable content

`scripts/agent-lock.sh` SHALL treat a lock file that carries no parsable content as dead and remove
it during `reap`. A lock file counts as unparsable when it is empty (zero bytes), when its content is
not valid JSON, or when it parses but carries none of the identity fields (`owner_sid`, `owner_pid`,
`worktree`, `branch`, `created_at`, `heartbeat_at`).

This check SHALL run before the existing field-based liveness evaluation, and SHALL record the reap
reason `unparsable` in `.git/agent-locks/.reap.log`.

This is safe without a grace period because `_write_lock()` writes to a temporary file and completes
with an atomic `mv -f`; a regular claim therefore never leaves an empty or partially written lock
file behind.

#### Scenario: Zero-byte lock file is reaped

- **GIVEN** a zero-byte file at `.git/agent-locks/main-checkout.json`
- **WHEN** `bash scripts/agent-lock.sh reap` runs
- **THEN** the file no longer exists
- **AND** `.git/agent-locks/.reap.log` contains an entry with reason `unparsable`

#### Scenario: Lock file with invalid JSON is reaped

- **GIVEN** a lock file whose content is `{not json`
- **WHEN** `bash scripts/agent-lock.sh reap` runs
- **THEN** the file no longer exists

#### Scenario: A valid lock held by a live session is not reaped

- **GIVEN** a lock file with a live `owner_pid` and a fresh `heartbeat_at`
- **WHEN** `bash scripts/agent-lock.sh reap` runs
- **THEN** the file still exists

### Requirement: Agent-lock guard reports a corrupted lock distinctly

When the pre-commit guard finds a lock file that exists but carries no parsable content, it SHALL
emit a message that names the lock as corrupted and names removing it as the resolution. It SHALL NOT
emit the standard collision message with empty holder fields, and SHALL NOT suggest creating a
worktree — no session holds a corrupted lock, so that advice sends the reader in the wrong direction.

#### Scenario: Guard message for a corrupted lock

- **GIVEN** a zero-byte lock file for the main checkout
- **WHEN** the pre-commit guard evaluates it
- **THEN** the message identifies the lock file as corrupted
- **AND** the message does not contain the worktree suggestion used for genuine collisions

### Requirement: Agent-lock list never reports a contentless lock as live

`bash scripts/agent-lock.sh list` SHALL NOT print `STATE=live` for a lock file without parsable
content. Such an entry SHALL be shown as `stale`, and the row SHALL carry the lock file's basename so
that an entry with empty scope and id remains attributable.

#### Scenario: Contentless lock is listed as stale

- **GIVEN** a zero-byte lock file at `.git/agent-locks/main-checkout.json`
- **WHEN** `bash scripts/agent-lock.sh list` runs
- **THEN** the row for that file shows state `stale`
- **AND** the row identifies the file as `main-checkout`
