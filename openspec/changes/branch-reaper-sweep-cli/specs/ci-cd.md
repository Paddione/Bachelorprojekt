## ADDED Requirements

### Requirement: Ticketless Sweep Mode for the Branch Reaper

`scripts/branch-reaper.sh` SHALL offer a ticketless sweep mode that considers EVERY remote head as
a candidate, in addition to the existing single-ticket mode used by the post-merge path.

The invocation forms SHALL be:

1. `--ticket T######` — single-ticket mode. Candidate selection stays restricted to branches whose
   name carries that ticket ID. This form SHALL behave exactly as before.
2. `--dry-run` without `--ticket` — sweep mode, read-only. The script SHALL run and SHALL report
   one `REAP`/`KEEP` line per candidate. It SHALL NOT require a ticket ID, because a dry run
   writes nothing: no archive tag is pushed and no ref is modified.
3. `--sweep` — sweep mode explicitly requested. Combined with `--dry-run` it is read-only;
   without `--dry-run` it deletes, subject to the unchanged deletion criteria.
4. Neither `--ticket` nor `--dry-run` nor `--sweep` — the script SHALL exit non-zero without
   deleting any branch, so that an accidental bare invocation can never become a mass deletion.

`--ticket` and `--sweep` SHALL be mutually exclusive; supplying both SHALL exit non-zero.

In sweep mode the ticket ID SHALL be resolved PER BRANCH from the branch name, not taken from a
single command-line value. Deletion criterion 3 (ticket status is `done` or `archived`) SHALL
therefore remain in force during a sweep, evaluated against each branch's own ticket.

A branch whose name carries no `T######` identifier SHALL be preserved with a reason, because
criterion 3 cannot be evaluated for it. An unverifiable criterion SHALL preserve the branch, never
release it.

The deletion criteria, the path allowlist and the `refs/tags/reaped/<branch>` archive-tag safety
net SHALL remain unchanged in both modes. The output contract — `REAP <branch>` and
`KEEP <branch> — <reason>` — SHALL remain valid in both modes.

#### Scenario: Read-only inspection runs without a ticket ID

- **GIVEN** a repository with remote branches that meet the deletion criteria
- **WHEN** `bash scripts/branch-reaper.sh --dry-run` runs without `--ticket`
- **THEN** the command exits successfully
- **AND** it reports at least one `REAP` line
- **AND** no remote branch is deleted and no archive tag is pushed

#### Scenario: The sweep spans more than one ticket

- **GIVEN** two remote branches carrying two different ticket IDs, both tickets `done`, neither
  branch with an open pull request, and every differing file inside the allowlist
- **WHEN** the ticketless sweep runs in dry-run mode
- **THEN** both branches appear as `REAP` candidates in the same run

#### Scenario: The sweep resolves ticket status per branch

- **GIVEN** a sweep in which one candidate branch carries a ticket that is still open while other
  candidates carry tickets that are `done`
- **WHEN** the ticketless sweep runs
- **THEN** the branch with the open ticket is preserved with a reason
- **AND** the branches with `done` tickets are still reported as `REAP` candidates in that same run

#### Scenario: A branch without a ticket ID in its name is preserved

- **GIVEN** a remote branch whose name contains no `T######` identifier
- **WHEN** the ticketless sweep runs
- **THEN** the branch is NOT reported as a `REAP` candidate
- **AND** it is preserved with a reason naming the missing ticket attribution

#### Scenario: A bare invocation deletes nothing

- **GIVEN** a repository with remote branches that would meet the deletion criteria
- **WHEN** `bash scripts/branch-reaper.sh` runs with neither `--ticket` nor `--dry-run` nor
  `--sweep`
- **THEN** no remote branch is deleted
- **AND** the command exits non-zero

#### Scenario: Single-ticket mode is unaffected

- **GIVEN** remote branches carrying several different ticket IDs
- **WHEN** `bash scripts/branch-reaper.sh --ticket T###### --dry-run` runs
- **THEN** only branches whose name carries that ticket ID are considered
- **AND** branches belonging to other tickets appear in neither the `REAP` nor the `KEEP` lines
