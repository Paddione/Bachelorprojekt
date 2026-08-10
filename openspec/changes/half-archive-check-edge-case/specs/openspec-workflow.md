## ADDED Requirements

### Requirement: Half-archive detection runs before a commit lands and during session hygiene, not only in CI

The repository SHALL invoke the half-archive check (see "Half-archived changes are
detectable and fail the gate") from two additional points beyond the
`test:openspec` CI gate, both operating on the live working tree rather than a
committed ref:

1. The pre-commit hook SHALL run the check unconditionally and refuse the commit
   (fail-closed, non-zero exit) if it reports a half-archived slug.
2. `scripts/agent-lock.sh reap` SHALL run the check and print an advisory warning to
   stderr if it reports a half-archived slug, without failing the reap itself.

Rationale: the check's detection logic is correct against an uncommitted working
tree — verified by direct reproduction — but was wired only into `task test:openspec`,
which nothing calls automatically against a live session's working tree. A half state
produced by an interrupted `openspec.sh archive` run (dead session, no commit ever
attempted) went unnoticed until found by chance via `git status`. The pre-commit hook
closes the path where such a state gets committed piecemeal; the `reap` advisory
surfaces the drift proactively during the session-hygiene audit that already targets
dead-session residue, without requiring a commit attempt first.

#### Scenario: A commit that would leave a half-archived slug is refused

- **GIVEN** a working tree where a slug exists both under `openspec/changes/<slug>/`
  and `openspec/changes/archive/<date>-<slug>/`
- **WHEN** `git commit` runs with the repository's pre-commit hook installed
- **THEN** the commit is refused
- **AND** the half-archive check's output naming the slug is visible to the user

#### Scenario: A commit against a clean tree is not blocked by the half-archive check

- **GIVEN** a working tree where every slug is either open or archived, never both
- **WHEN** `git commit` runs with the repository's pre-commit hook installed
- **THEN** the half-archive check does not refuse the commit

#### Scenario: Session hygiene reap warns on a half-archived slug without failing

- **GIVEN** a working tree where a slug exists both under `openspec/changes/<slug>/`
  and `openspec/changes/archive/<date>-<slug>/`
- **WHEN** `scripts/agent-lock.sh reap` runs
- **THEN** it prints a warning naming the slug to stderr
- **AND** it still exits zero
