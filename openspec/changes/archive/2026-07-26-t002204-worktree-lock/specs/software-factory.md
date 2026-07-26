# software-factory — Delta (t002204-worktree-lock, T002204)

## MODIFIED Requirements

### Requirement: git-crypt-sicheres Worktree-Create

The system SHALL create Git worktrees via `scripts/worktree-create.sh` that bypass the `git-crypt` smudge/clean filter failure (which causes plain `git worktree add` to exit 128) by neutralizing `filter.git-crypt.clean=cat` und `filter.git-crypt.required=false` im per-Worktree-Config, sodass Commits und Follow-up-git-Ops gelingen. Bei vorhandenem Key werden Secrets entschlüsselt; ohne Key bleibt der Worktree benutzbar.

`node_modules` SHALL be provisioned by symlink from the base checkout — both the repository root and **every pnpm workspace package**, discovered by its `pnpm-workspace.yaml` marker (`website/`, `brett/`, `mentolder-web/`, …) rather than by a hardcoded package list. A hardcoded website-only symlink leaves every other pnpm-managed package without dependencies in the worktree, which breaks `task test:changed` with "module not found" whenever the touched package is not `website/`.

Because the linked `node_modules` reflect whatever the **source checkout** has installed for *its* currently checked-out branch, `worktree-create.sh` SHALL emit a warning when the source checkout sits on a different branch than the new worktree — a dependency mismatch must surface at creation time instead of failing opaquely in a later test run. A missing `node_modules` in the source checkout SHALL remain a non-error.

#### Scenario: Entschlüsselter Worktree im unlocked Repo
- **GIVEN** das Haupt-Checkout hat einen gültigen git-crypt Key unter `.git/git-crypt/keys/default`
- **WHEN** `worktree-create.sh feature/x <path> HEAD` ausgeführt wird
- **THEN** Exit 0; `<path>/secret/data.yaml` enthält den entschlüsselten Wert; `git status` im Worktree gibt Exit 0; `filter.git-crypt.clean=cat` und `filter.git-crypt.required=false` sind im Worktree-Config gesetzt

#### Scenario: Locked Repo und node_modules Provisioning
- **GIVEN** kein Key vorhanden (gesperrtes Repo); Basis-Checkout hat `node_modules/cheerio/`
- **WHEN** `worktree-create.sh fix/z <path> HEAD` ausgeführt wird
- **THEN** Exit 0; Worktree ist benutzbar (`git status` Exit 0); `node_modules/cheerio/package.json` ist über Symlink erreichbar; fehlendes `node_modules` im Basis-Checkout führt zu keinem Fehler

#### Scenario: Non-website workspace package gets its node_modules

- **GIVEN** the source checkout has `brett/pnpm-workspace.yaml` and `brett/node_modules/` installed
- **WHEN** `worktree-create.sh fix/y <path> HEAD` runs
- **THEN** Exit 0 and `<path>/brett/node_modules` resolves through a symlink to the source checkout's `brett/node_modules`, alongside the root `node_modules` symlink

#### Scenario: Branch mismatch between source checkout and new worktree

- **GIVEN** the source checkout is on branch `main` and a worktree is created for `fix/other`
- **WHEN** `worktree-create.sh fix/other <path>` runs
- **THEN** Exit 0 and a warning on stderr names both branches and states that the linked `node_modules` may diverge from this branch

### Requirement: Session-Start Reaper für Zombie-Locks

The system SHALL run `bash scripts/agent-lock.sh reap` at the start of every session or skill invocation to clean up stale locks from dead processes (whose cwd points to a deleted worktree), removed worktrees, and sessions with no live PID. The reap operation SHALL be idempotent and fail-open — errors must not abort the session.

Liveness SHALL NOT be decided by the session id alone. A session **resume** starts a new process with a different SID (and possibly a different PID), so a lock whose recorded worktree still exists **and** is checked out on exactly the branch the lock recorded SHALL be treated as live and SHALL NOT be reaped, regardless of a dead or mismatched SID. Reaping a resumed session's lock causes the pre-commit guard to fail afterwards with a spurious "branch mismatch". The filesystem/git state is the authoritative liveness signal here; the volatile SID is not.

#### Scenario: Resumed session keeps its lock

- **GIVEN** a lock records worktree `<path>` and branch `fix/x`, its recorded SID is no longer alive, and `<path>` exists with `fix/x` checked out
- **WHEN** `bash scripts/agent-lock.sh reap` runs
- **THEN** the lock is retained and still listed by `agent-lock.sh list`

#### Scenario: Regression guard — branch drift is still reaped

- **GIVEN** a lock records worktree `<path>` and branch `fix/x`, its SID is dead, but `<path>` is checked out on a different branch
- **WHEN** `bash scripts/agent-lock.sh reap` runs
- **THEN** the lock is removed, because the worktree/branch evidence no longer corroborates a live session
