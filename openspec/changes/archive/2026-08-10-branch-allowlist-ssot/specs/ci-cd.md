## ADDED Requirements

### Requirement: Single source for ticketless branch exemptions

The system SHALL keep the list of branches exempt from the ticket-ID naming requirement in exactly
one file, `scripts/lib/branch-allowlist.sh`, and every guard enforcing that requirement SHALL read
its exemptions from that file rather than from a locally maintained list.

Membership SHALL be decided by exact branch-name comparison, not by glob or prefix matching, so a
typo cannot exempt an entire class of branches.

#### Scenario: A listed ticketless branch can commit

- **GIVEN** the branch `chore/mishap-incident-rollup` is listed in `TICKETLESS_BRANCHES`
- **WHEN** a commit is made on that branch with the `pre-commit` hook active
- **THEN** the hook exits 0 and the commit is created

#### Scenario: An unlisted ticketless branch is still blocked

- **GIVEN** a branch such as `chore/some-other-work` carrying no ticket ID and not listed in
  `TICKETLESS_BRANCHES`
- **WHEN** a commit is made on that branch with the `pre-commit` hook active
- **THEN** the hook exits non-zero and reports the missing ticket ID

#### Scenario: A listed branch produces no push warning

- **GIVEN** the branch `chore/mishap-incident-rollup`
- **WHEN** the `pre-push` hook runs its advisory branch-naming check
- **THEN** no missing-ticket-ID warning is emitted

#### Scenario: The allowlist file is absent

- **GIVEN** a checkout in which `scripts/lib/branch-allowlist.sh` does not exist
- **WHEN** the `pre-commit` hook runs on any branch
- **THEN** the hook behaves as it did before the shared source existed — the exemption list is
  empty and no branch is exempted, so a missing file can never permit an otherwise invalid branch

### Requirement: The mishap rollup driver fails loudly

The mishap rollup driver SHALL check the exit status of its `git commit` and `git push` calls and
SHALL terminate with a non-zero exit code and a diagnostic message when either fails, rather than
continuing and leaving generated plan files uncommitted.

#### Scenario: Commit is rejected by a hook

- **GIVEN** `scripts/factory/mishap-rollup.sh` has generated and linted a plan
- **WHEN** its `git commit` call is rejected by a git hook
- **THEN** the script prints the failing step and exits non-zero, instead of reporting success
