## ADDED Requirements

### Requirement: A stash pop is verified by the stash-list delta, not by the exit code

The git-workflow skills (Claude Code and opencode variants) SHALL verify a `git stash pop`
by the positive signal that the caller's own entry is gone from `git stash list`. An entry
that remains after the pop is the finding of a partial pop — the pop applied only part of
the stash, usually because a hook or rebase regenerated one of the stashed files. A
partially applied pop SHALL NOT be treated as success even when `git status` looks like a
normal, single-file change. The recovery path (`git stash show --stat "stash@{0}"`,
`git checkout "stash@{0}" -- <path>`) SHALL be documented in the skills.

#### Scenario: A partial pop after a rebase keeps the stash entry

- **GIVEN** the sequence `git stash -u`, `git pull --rebase origin main`, and a post-rewrite hook that regenerates one of the stashed files
- **WHEN** `git stash pop` applies only the regenerated file and keeps the rest in the stash
- **THEN** the stash-list check reports that the caller's entry is still present
- **AND** the flow treats this as a finding, not as a successful pop
- **AND** the remaining content is recovered via `git checkout "stash@{0}" -- <path>`

### Requirement: Parallel-work safety nets bind to the branch instead of the shared stash stack

The git-workflow skills SHALL recommend a throwaway commit on the caller's own branch
(`git commit -m wip`, later `git reset --soft HEAD~1`) as the safety net for parallel work.
Where a stash is still required, it SHALL be named with the ticket ID in the message, and
SHALL be resolved by message lookup, never by the positional index `stash@{0}` — the stack
is shared across all worktrees of the repository and indices shift on every foreign push.
The stash inventory in repo-hygiene §0 SHALL state that listed entries may originate from
any worktree and that ownership can only be assigned through the stash message.

#### Scenario: A named stash is looked up by message after foreign entries appeared

- **GIVEN** a safety-net stash created with `git stash push -u -m "T002894 safety net"`
- **AND** a parallel session has since pushed its own entries onto the shared stack
- **WHEN** the stash is resolved by message
- **THEN** the lookup finds the T002894 entry regardless of its current index

### Requirement: A conflict-free rebase re-verifies freshness artifacts before push

The git-workflow skills SHALL re-run `task freshness:check` after every rebase and before
pushing, and SHALL state explicitly that the `merge=ours` driver in `.gitattributes`
resolves generated files without conflict markers: a rebase that reports no conflicts can
still have silently replaced locally committed freshness artifacts with the upstream
version. A failed freshness check after a rebase SHALL be handled by
`task freshness:regenerate`, staging the generated artifacts, and amending or extending the
commit before push. The cheap counter-check `git show --stat HEAD -- <artifact paths>`
SHALL be documented as an alternative.

#### Scenario: A conflict-free rebase drops a committed freshness artifact

- **GIVEN** a branch commit that carries regenerated `website/src/data/test-inventory.json` and `docs/code-quality/repo-index.json`
- **AND** `origin/main` has moved those files
- **WHEN** `git pull --rebase origin main` completes without conflicts
- **THEN** the skill requires `task freshness:check` before push
- **AND** a failed check triggers `task freshness:regenerate` and a follow-up commit instead of a push of the incomplete state

### Requirement: The worktree write guard identifies ownership claims by SID with a stated source

`scripts/hooks/worktree-write-guard.sh` SHALL resolve the caller's session ID with the same
environment precedence as `scripts/agent-lock.sh` (including `OPENCODE_SESSION_ID`), so
claims written by agent-lock in an opencode session are recognized as the caller's own. The
ownership message SHALL state where the ownership comes from — claims recorded with this
SID in `agent-locks/*.json`, which includes the caller's own session AND its subagents — so
the listing is not misread as exclusive personal ownership. Worktrees referenced by
multiple locks (different scopes on the same path) SHALL appear once in the listing.

#### Scenario: An opencode session recognizes its own claims

- **GIVEN** an opencode session that sets `OPENCODE_SESSION_ID` and claims a branch via `agent-lock.sh`
- **WHEN** the write guard runs inside that session
- **THEN** it resolves the same SID as agent-lock and treats the claimed worktree as its own

#### Scenario: The ownership message names its source

- **GIVEN** a write attempt outside all worktrees claimed with the caller's SID
- **WHEN** the guard rejects the write
- **THEN** the message states that the listed worktrees are claims of this SID (own session and its subagents), sourced from the lock files

#### Scenario: Multiple locks on one worktree are deduplicated

- **GIVEN** a worktree referenced by a branch-scoped and a worktree-scoped lock of the same SID
- **WHEN** the guard lists the caller's worktrees
- **THEN** the worktree appears exactly once
