## ADDED Requirements

### Requirement: repo-hygiene covers the local working tree and stashes

The shared repo-hygiene mechanics reference `.claude/skills/references/repo-hygiene-ops.md`
SHALL contain a section covering uncommitted changes in the main checkout and the git stash
stack, and that section SHALL precede the stale-worktree section, because securing unsaved work
is a precondition of removing any worktree. The `repo-hygiene` skill body SHALL list this section
in its execution order.

#### Scenario: Skill is invoked for unsaved changes

- **GIVEN** the operator invokes `repo-hygiene` because the main checkout has uncommitted changes
- **WHEN** the operator follows the SSOT reference `repo-hygiene-ops.md`
- **THEN** the reference provides a section for the working tree and stashes
- **AND** that section appears before the stale-worktree section
- **AND** the operator does not have to improvise the mechanics

### Requirement: Path-filtered stash inspection uses a two-revision diff

The working-tree section SHALL document a path-filtered stash inspection command that actually
returns the change for the requested path. Retrieving the diff for a single path inside a stash
SHALL be documented as a two-revision diff against the stash's own parent, not as a
`git stash show` invocation with a pathspec.

#### Scenario: Inspecting one file inside a stash that touched several

- **GIVEN** a stash entry that contains changes to two different files
- **WHEN** the documented path-filtered inspection command is run for the first file
- **THEN** the command succeeds
- **AND** the resulting diff contains the change made to the first file
- **AND** the resulting diff does not contain the change made to the second file

### Requirement: Stash relevance is decided against today's main, not against the stash base

The working-tree section SHALL state that a stash's own diff is not evidence of relevance,
because that diff is computed against the stash's base commit and therefore looks unmerged
regardless of whether the content has since landed. Relevance SHALL be decided by searching for
the concrete markers taken from the stash diff in today's `main`. If the marker check cannot be
completed or its result is inconclusive, the documented outcome SHALL be to keep the stash
(fail-closed), never to drop it.

#### Scenario: Stash content has already landed in main

- **GIVEN** a stash entry whose content was subsequently committed to `main`
- **WHEN** the stash's own diff against its base commit is computed
- **THEN** that diff is unchanged from before the content landed, so it carries no relevance signal
- **WHEN** the documented marker check is run against `main` instead
- **THEN** the marker is found in `main`
- **AND** the stash is identified as droppable

#### Scenario: Stash content has not landed in main

- **GIVEN** a stash entry whose content is absent from `main`
- **WHEN** the documented marker check is run against `main`
- **THEN** the marker is not found
- **AND** the stash is kept
