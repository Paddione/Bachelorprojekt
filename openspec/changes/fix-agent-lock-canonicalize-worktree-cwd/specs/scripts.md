## ADDED Requirements

### Requirement: Worktree-Prozess-Erkennung vergleicht kanonische Pfade

`_worktree_has_active_process` und der Worktree-Prozess-Report in `cmd_activity`
(`scripts/agent-lock-activity.sh`) SHALL den uebergebenen Worktree-Pfad vor dem
Vergleich mit `/proc/<pid>/cwd` kanonisieren (`cd "$wt" && pwd -P`), damit zwei
unterschiedliche String-Repraesentationen desselben Verzeichnisses (z. B. ein
Mount-Punkt wie `/tmp` auf einem NTFS-Pfad unter Windows/git-bash) nicht als
verschiedene Pfade behandelt werden.

#### Scenario: live process under a non-canonical worktree path is detected

- **GIVEN** a process whose working directory is a worktree path reachable
  both via a mount-point alias (e.g. `/tmp/tmp.XXXX`) and via the underlying
  canonical path reported by `/proc/<pid>/cwd`
- **WHEN** `_worktree_has_active_process` is called with the mount-point
  alias path
- **THEN** it SHALL report the process as active (return code 0)

#### Scenario: reap does not remove a lock whose worktree holds a live process

- **GIVEN** an agent-lock whose `owner_pid` looks dead but whose worktree
  directory holds a live process reachable only via a non-canonical path
  alias
- **WHEN** `agent-lock-reap.sh` evaluates the lock via
  `_worktree_has_active_process`
- **THEN** the lock SHALL NOT be reaped
