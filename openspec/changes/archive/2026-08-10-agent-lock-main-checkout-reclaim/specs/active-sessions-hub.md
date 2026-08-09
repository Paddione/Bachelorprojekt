## ADDED Requirements

### Requirement: Deliberate Main-Checkout Reclaim for Bookkeeping Locks

`scripts/agent-lock.sh` SHALL provide a `reclaim-main-checkout` command that lets the
current session deliberately take over the `main-checkout` lock when it is currently held
only as auto-claimed bookkeeping (label `auto: pre-commit self-claim`), so that a
subsequent branch checkout in the main checkout is not reverted by
`cmd_guard_postcheckout`'s SID-mismatch protection. The command SHALL refuse to take over
a lock carrying any other (deliberate) label, leaving the existing protection for a
genuinely active foreign holder unchanged.

Rationale: `cmd_guard_precommit` already treats a bookkeeping-labelled lock as "not a real
exclusive hold" for the purposes of blocking another session's commit. Before this change,
`cmd_guard_postcheckout` had no equivalent path for the CURRENT session to act on that same
distinction — its only escape was `AGENT_LOCK_POSTCHECKOUT_REVERT=0`, a global kill-switch
that also disables the revert against a genuinely different, deliberately-claiming session.

#### Scenario: A new session reclaims a bookkeeping lock left by an earlier session

- **GIVEN** the `main-checkout` lock is held with label `auto: pre-commit self-claim` and
  an `owner_sid` different from the current session's SID
- **WHEN** the current session runs `bash scripts/agent-lock.sh reclaim-main-checkout`
- **THEN** the command exits 0
- **AND** the lock's `owner_sid` is now the current session's SID

#### Scenario: A reclaimed session's subsequent checkout is not reverted

- **GIVEN** the current session has just reclaimed the `main-checkout` lock per the
  scenario above
- **WHEN** the current session checks out a different branch and
  `cmd_guard_postcheckout` runs (e.g. via `.githooks/post-checkout`)
- **THEN** the checkout is not reverted
- **AND** `HEAD` remains on the branch the session checked out

#### Scenario: Reclaim refuses a deliberate (non-bookkeeping) foreign claim

- **GIVEN** the `main-checkout` lock is held with a label other than
  `auto: pre-commit self-claim` (a deliberate claim, e.g. `dev-flow-chore`) and an
  `owner_sid` different from the current session's SID
- **WHEN** the current session runs `bash scripts/agent-lock.sh reclaim-main-checkout`
- **THEN** the command exits 1
- **AND** the lock file is unchanged — `owner_sid` still names the original holder

#### Scenario: Reclaim is a no-op when there is nothing to take over

- **GIVEN** either no `main-checkout` lock exists, or it is already owned by the current
  session's SID
- **WHEN** the current session runs `bash scripts/agent-lock.sh reclaim-main-checkout`
- **THEN** the command exits 0
- **AND** it does not modify a lock it does not own
