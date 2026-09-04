## ADDED Requirements

### Requirement: The worktree write guard treats Windows-absolute paths as absolute

`scripts/hooks/worktree-write-guard.sh` SHALL recognize Windows-absolute target paths
(drive-letter form `^[A-Za-z]:[\\/]`, UNC form `\\\\`) as absolute and SHALL NOT prepend
the hook working directory to them. Backslashes in the target SHALL be normalized to
slashes before any comparison. The drive letter SHALL be canonicalized case-insensitively
(`c:` and `C:` are equal). POSIX drive form (`/c/...`) SHALL be canonicalized to the same
form as the drive-letter form (`C:/...`) so both spellings of the same location compare
equal. `_abs_wt()` SHALL apply the same normalization so claim paths and targets stay
comparable, and `MAIN_ROOT` SHALL be compared in the same canonical form.

#### Scenario: Windows-absolute path inside the own claimed worktree is allowed

- **GIVEN** an active worktree claim held under the caller's SID
- **WHEN** a tool write targets a file inside that worktree given as a Windows-absolute
  path (`C:\...` with backslashes)
- **THEN** the write guard exits 0 (permitted) and does not mangle the path with a
  prepended working directory

#### Scenario: Lowercase drive letter matches the uppercase claim path

- **GIVEN** an active worktree claim held under the caller's SID
- **WHEN** a tool write targets a file inside that worktree with a lowercase drive
  letter (`c:/...`) while the resolved roots use uppercase (`C:/...`), or vice versa
- **THEN** the write guard exits 0 (permitted)

#### Scenario: POSIX drive path inside the own claimed worktree is allowed

- **GIVEN** an active worktree claim held under the caller's SID on a Git-Bash style
  host where `git rev-parse` reports Windows spelling
- **WHEN** a tool write targets a file inside that worktree given as a POSIX-absolute
  drive path (`/c/...`)
- **THEN** the write guard exits 0 (permitted)

#### Scenario: Relative paths still resolve against the hook working directory

- **GIVEN** an active worktree claim held under the caller's SID
- **WHEN** a tool write targets a relative path
- **THEN** the guard still resolves it against the hook working directory as before
