## ADDED Requirements

### Requirement: Declared paths in `.dockerignore` exist

The test suite SHALL fail when `.dockerignore` declares a literal path that does not exist in the
working tree.

A line is in scope only when all of the following hold. It is neither blank nor a comment. It does
not begin with `!` — a negation pattern, whose target is legitimately allowed to be absent. It
contains none of the glob metacharacters `*`, `?` or `[`. And it does not carry the trailing marker
`# runtime`.

The `# runtime` marker exists because a path may be both glob-free and legitimately absent from a
fresh checkout: `website/dist`, `mentolder-web/node_modules` and `tests/e2e/test-results` are
produced by a build, an install and a test run respectively. Marking them in the file itself keeps
the justification next to the entry rather than in a separate allowlist that drifts from it. The
marker SHALL name the producing step, so that a future reader can tell an artefact from a
leftover.

The check SHALL verify that the set of in-scope lines is non-empty before asserting that none of
them is missing, so that an extraction returning nothing fails loudly instead of passing
vacuously.

#### Scenario: Every declared literal path exists

- **GIVEN** every non-negation, glob-free line in `.dockerignore` names an existing path
- **WHEN** the test suite runs
- **THEN** the check passes

#### Scenario: A declared path was deleted

- **GIVEN** `.dockerignore` names `billing-bot`, which does not exist in the working tree
- **WHEN** the test suite runs
- **THEN** the check fails and the failure message names `billing-bot`

#### Scenario: A negation pattern is not treated as a missing path

- **GIVEN** `.dockerignore` contains `!website/.env.example` and that file does not exist
- **WHEN** the test suite runs
- **THEN** the check passes, because negation patterns are out of scope

#### Scenario: A marked runtime artefact is not treated as a missing path

- **GIVEN** `.dockerignore` contains `website/dist  # runtime: astro build` and that directory does
  not exist in a fresh checkout
- **WHEN** the test suite runs
- **THEN** the check passes, because the entry carries the `# runtime` marker

#### Scenario: An unmarked runtime artefact still fails

- **GIVEN** `.dockerignore` contains a glob-free path that does not exist and carries no `# runtime`
  marker
- **WHEN** the test suite runs
- **THEN** the check fails, so that adding an artefact requires stating why it may be absent

#### Scenario: The extraction returning nothing fails

- **GIVEN** the extraction of in-scope lines yields an empty set
- **WHEN** the test suite runs
- **THEN** the check fails, rather than reporting success over an empty candidate set

### Requirement: Service-registry entries point at existing manifests

The test suite SHALL fail when a manifest key in `scripts/factory/service-registry.sh` names a path
that does not exist in the working tree.

Keys are the bracketed array subscripts of the registry map, of the form `[<path>]=`. The check
SHALL verify that at least one key was extracted before asserting that none is missing.

#### Scenario: Every registry key resolves

- **GIVEN** every manifest key in the registry names an existing path
- **WHEN** the test suite runs
- **THEN** the check passes

#### Scenario: A registry entry outlived its manifest

- **GIVEN** the registry contains the key `[k3d/claude-code-mcp-browser.yaml]` and that file does
  not exist
- **WHEN** the test suite runs
- **THEN** the check fails and the failure message names the offending key

#### Scenario: The extraction returning nothing fails

- **GIVEN** the extraction of registry keys yields an empty set
- **WHEN** the test suite runs
- **THEN** the check fails, rather than reporting success over an empty candidate set

### Requirement: No tracked symlink dangles

The test suite SHALL fail when a symlink tracked in git cannot be resolved from the working tree.

Tracked symlinks are the entries reported by `git ls-files -s` with mode `120000`. A symlink is
considered dangling when `test -e` on its path is false. This catches the class of file that
`git ls-files` reports but `cat` cannot open — in particular a link committed against an absolute
path on one contributor's machine.

The check SHALL verify that at least one tracked symlink exists before asserting that none
dangles.

#### Scenario: Every tracked symlink resolves

- **GIVEN** every tracked symlink resolves within the working tree
- **WHEN** the test suite runs
- **THEN** the check passes

#### Scenario: A symlink points outside the repository

- **GIVEN** a tracked symlink points at an absolute path under a contributor's home directory that
  does not exist in this checkout
- **WHEN** the test suite runs
- **THEN** the check fails and the failure message names the symlink and its target

#### Scenario: The repository-internal relative symlinks are recognised

- **GIVEN** `.agents/agents` is a tracked symlink to `../.claude/agents`, which exists
- **WHEN** the test suite runs
- **THEN** the check passes for that entry, so that the repository's deliberate compatibility
  symlinks are not reported as drift
