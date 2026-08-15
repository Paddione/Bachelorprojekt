## MODIFIED Requirements

### Requirement: The auto-stash restore resolves the stash by message, not by index

`scripts/worktree-create.sh` SHALL restore its automatically created stash
(`worktree-create-auto-stash`) by locating the entry through its message, never by the
positional index `stash@{0}`. The shared stash stack (`refs/stash` in the common git dir)
is mutated by every worktree in the repository, so a positional index is not stable.
`scripts/git-stash-net.sh` SHALL provide message-based operations (`find --by-ticket`,
`pop --by-message`) as the reference implementation and SHALL drop an entry only when the
pop applied completely.

`scripts/git-stash-net.sh` SHALL additionally provide a message-verified drop operation
(`drop --by-message <pattern>`) for removing a stash entry without applying it. The drop
SHALL resolve the entry by its message — never by a positional index — remove exactly one
entry per invocation, and verify both ends of the operation: if more than one entry
matches the pattern, the drop SHALL abort without removing anything; after the drop, the
disappearance of the entry SHALL be positively verified, and a remaining match is a
finding, not success. Multiple entries are removed by separate invocations that each
re-resolve by message — never by consecutive positional indices.

#### Scenario: A foreign push shifted the stash indices

- **GIVEN** a shared stash stack where a foreign session pushed new entries above `stash@{0}`
- **WHEN** `worktree-create.sh` restores its auto-stash
- **THEN** it locates the entry by the message `worktree-create-auto-stash`, not by `stash@{0}`

#### Scenario: A partial pop keeps the safety net entry

- **GIVEN** a stash whose pop applies only partially (a file was regenerated in between)
- **WHEN** `git-stash-net.sh pop --by-message` runs
- **THEN** it reports the partial pop as a finding and keeps the stash entry

#### Scenario: A message-verified drop removes only the matching entry

- **GIVEN** a stash stack with multiple entries carrying distinct ticket messages
- **WHEN** `git-stash-net.sh drop --by-message <ticket-id>` runs
- **THEN** exactly the entry whose message matches is removed, all other entries remain in
  the stack, and the command exits 0

#### Scenario: An ambiguous drop pattern aborts without removing anything

- **GIVEN** a stash stack where two entries match the same message pattern
- **WHEN** `git-stash-net.sh drop --by-message <pattern>` runs
- **THEN** it reports the ambiguity, removes no entry, and exits non-zero

#### Scenario: A drop whose pattern matches nothing fails closed

- **GIVEN** a stash stack without any entry matching the given message pattern
- **WHEN** `git-stash-net.sh drop --by-message <pattern>` runs
- **THEN** it reports that no entry was found and removes nothing

#### Scenario: A drop that did not remove its entry is reported as a finding

- **GIVEN** a stash entry that the drop command matched by message
- **WHEN** the entry is still present after the drop command completed
- **THEN** the command reports the remaining entry as a finding and exits non-zero
