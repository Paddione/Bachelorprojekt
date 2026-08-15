## ADDED Requirements

### Requirement: Merged Pull Requests Are a Positive Reaping Signal

In sweep mode and single-ticket mode alike, the branch reaper SHALL treat a merged pull request
as a positive reaping signal for a candidate branch whose name carries a `T######` ticket
identifier: when `gh pr list --head <branch> --state merged` resolves to a pull request whose
`headRefOid` equals the candidate branch's remote tip SHA, the branch SHALL be reported as a
`REAP` candidate without the blob divergence check, provided no open pull request exists for
the branch and the ticket status is `done` or `archived`. For such branches the path allowlist
is not consulted: main evolution of any file that the branch touched does not turn a merged
branch into a keeper.

A candidate branch without a verifiable own merged pull request (no merged pull request, or a
merged pull request whose `headRefOid` differs from the branch's remote tip SHA — post-merge
work was pushed) SHALL be reported as a `REAP` candidate when a successor branch that itself
has a merged pull request carries identical blob content for every file in which the candidate
diverges from `<remote>/main`. Only branches whose pull request is `MERGED` SHALL count as
successors.

An unverifiable criterion SHALL preserve the branch: a failing `gh` query, the absence of a
merged pull request, a `headRefOid` mismatch without an identical-blob successor, or a
divergence outside the path allowlist SHALL keep the existing `KEEP` behavior with its reason.
The blob divergence check against the path allowlist SHALL remain the fallback for branches
without a positive signal.

The `chore/freshness-regen-*` branch class SHALL keep its existing PR-status rule and blob
divergence check unchanged. The deletion mechanics (archive tag `refs/tags/reaped/<branch>`
before any delete, local ref reaping, output contract `REAP`/`KEEP`/`DELETED`) SHALL remain
unchanged.

#### Scenario: A merged branch with non-allowlisted divergence is reaped

- **GIVEN** a remote branch named `fix/<slug>-T009010` whose pull request is `MERGED` and whose
  `headRefOid` equals the branch's remote tip SHA, whose ticket status is `done`, and whose only
  differing file from `<remote>/main` is `scripts/echt.sh` (outside the path allowlist)
- **WHEN** the sweep runs in dry-run mode
- **THEN** the branch is reported as a `REAP` candidate

#### Scenario: A merged branch with post-merge pushes is preserved

- **GIVEN** a remote branch whose merged pull request has a `headRefOid` different from the
  branch's remote tip SHA (commits pushed after the merge)
- **WHEN** the sweep runs in dry-run mode
- **THEN** the branch is preserved with a `KEEP` line when its divergence falls outside the
  path allowlist

#### Scenario: Content merged via a successor branch is reaped

- **GIVEN** a remote branch with ticket status `done`, no own merged pull request, diverging
  from `<remote>/main` only in `scripts/echt.sh`, and a successor branch with a `MERGED` pull
  request carrying the identical blob for `scripts/echt.sh`
- **WHEN** the sweep runs in dry-run mode
- **THEN** the branch is reported as a `REAP` candidate

#### Scenario: A failing gh query keeps the branch preserved

- **GIVEN** a remote branch with ticket status `done` whose merged-pull-request query fails
- **WHEN** the sweep runs in dry-run mode
- **THEN** the branch is preserved with a `KEEP` line and a reason
