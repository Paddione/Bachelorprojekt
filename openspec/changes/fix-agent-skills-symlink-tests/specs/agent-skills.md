## ADDED Requirements

### Requirement: Symlink-Set entspricht den getrackten Skills

The system SHALL keep the set of symlinks directly under `.claude/skills/`
identical to the set of tracked skill directories under `.opencode/skills/`
(each directory containing a `SKILL.md`) plus `OVERVIEW.md`. Missing or
surplus symlinks SHALL fail the guard.

#### Scenario: Ein Skill-Symlink fehlt

- **GIVEN** a tracked skill directory `.opencode/skills/<name>/SKILL.md`
- **WHEN** the symlink `.claude/skills/<name>` does not exist
- **THEN** the guard reports the missing symlink and fails

#### Scenario: Ein ueberzaehliger Symlink existiert

- **GIVEN** a symlink `.claude/skills/<name>` whose target is not a tracked
  skill directory
- **WHEN** the guard compares the actual symlink set against the expected set
- **THEN** the guard reports the surplus symlink and fails

### Requirement: Nicht-Verzeichnis-Ziele nur fuer OVERVIEW.md

The system SHALL fail the guard when a symlink under `.claude/skills/` does
not resolve to a directory, unless the symlink name is `OVERVIEW.md`.

#### Scenario: Ein Skill-Symlink zeigt auf eine Datei

- **GIVEN** a symlink `.claude/skills/<name>` that resolves to a
  non-directory target
- **WHEN** the guard inspects the symlink target
- **THEN** the guard fails and lists the offending symlink with its target

#### Scenario: OVERVIEW.md zeigt auf eine Datei

- **GIVEN** the symlink `.claude/skills/OVERVIEW.md` resolving to a file
- **WHEN** the guard inspects the symlink target
- **THEN** the guard accepts the symlink (readability of the target is
  covered by the existing guard in `tests/spec/agent-skills.bats`)

### Requirement: Skip bei deaktivierten Symlinks

The system SHALL skip the symlink assertions when the repository is checked
out with `core.symlinks=false`; an unset `core.symlinks` SHALL be treated as
symlink-capable.

#### Scenario: Checkout ohne Symlink-Unterstuetzung

- **GIVEN** a repository with `git config core.symlinks` set to `false`
- **WHEN** the guard runs
- **THEN** the guard skips the symlink assertions instead of failing

#### Scenario: core.symlinks ist nicht gesetzt

- **GIVEN** a repository without a `core.symlinks` configuration
- **WHEN** the guard runs
- **THEN** the guard executes the symlink assertions normally
