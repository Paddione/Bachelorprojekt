## ADDED Requirements

### Requirement: CFR trend measurement with a fixed 4-week window

The `cfr` command of `scripts/vda.sh` SHALL print, in addition to the
`CFR_WINDOW`-driven broad measurement, a second measurement line for a fixed
internal window of `4 weeks ago`, using the same algorithm (first-parent
`main`, `fix(`-subject proxy). `CFR_WINDOW` SHALL continue to affect only the
broad line, so the trend measurement stays comparable over time. When there
are no merges inside the 4-week window, the trend line SHALL report `n/a` and
the command SHALL still exit 0.

#### Scenario: Both measurement windows are printed

- **GIVEN** a repository whose `main` history contains merges in the last 4 weeks
- **WHEN** `bash scripts/vda.sh cfr` runs
- **THEN** the output contains the broad measurement line and a 4-week trend
  line, each carrying a percentage value

#### Scenario: Empty 4-week window reports n/a

- **GIVEN** a repository with merges in the broad window but no merges in the
  last 4 weeks
- **WHEN** `bash scripts/vda.sh cfr` runs
- **THEN** the trend line reports `n/a` and the command exits 0

### Requirement: fix()-commits carry a ticket ID

The commit-msg hook SHALL block commits whose subject uses the `fix(`
prefix without a ticket ID (`T[0-9]{6}`), by invoking
`scripts/check-fix-ticket-guard.sh` with the commit message file. A subject
with the `fix(` prefix AND a ticket ID SHALL pass, a subject without the
`fix(` prefix SHALL pass regardless of ticket ID, and setting
`SKIP_FIX_TICKET_GUARD=1` SHALL bypass the check (emergency only). A blocked
commit SHALL print a hint pointing the author at `bash scripts/ticket.sh
create --type fix ...` and SHALL abort the commit with the same
"No commit was created" convention as the other commit-msg checks.

#### Scenario: fix()-commit without ticket ID is blocked

- **GIVEN** a commit message whose subject is `fix(scripts): some fix without ticket`
- **WHEN** the commit-msg hook runs `scripts/check-fix-ticket-guard.sh`
- **THEN** the guard exits 1 and the commit is aborted with a hint to create a ticket

#### Scenario: fix()-commit with ticket ID passes

- **GIVEN** a commit message whose subject contains `fix(scripts): ... [T005307]`
- **WHEN** the commit-msg hook runs `scripts/check-fix-ticket-guard.sh`
- **THEN** the guard exits 0 and the commit proceeds

#### Scenario: Non-fix prefixes stay unblocked

- **GIVEN** a commit message whose subject uses a non-`fix(` prefix (e.g. `feat(website): ...`)
- **WHEN** the commit-msg hook runs `scripts/check-fix-ticket-guard.sh`
- **THEN** the guard exits 0

#### Scenario: Emergency bypass

- **GIVEN** `SKIP_FIX_TICKET_GUARD=1` in the environment and a `fix(`-subject
  without a ticket ID
- **WHEN** the commit-msg hook runs `scripts/check-fix-ticket-guard.sh`
- **THEN** the guard exits 0 and the commit proceeds
