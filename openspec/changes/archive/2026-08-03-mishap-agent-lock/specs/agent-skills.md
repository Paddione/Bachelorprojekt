## ADDED Requirements

### Requirement: agent-lock claim supports force flag for dead processes
The agent-lock script SHALL allow the `claim` command to specify a `--force` flag. When `--force` is provided, the script SHALL check if the process holding the lock (specified by `owner_pid` in the lock file) is still active. If the process is dead (i.e. not running), the script SHALL reclaim/take over the lock, overwrite the lock file, and log the reclamation to the `.reap.log` file. If the process is alive, it SHALL reject the claim and exit with a non-zero code.

#### Scenario: Force claim when lock owner process is dead
- **GIVEN** a ticket lock exists with owner_pid 999999
- **AND** process 999999 is not running
- **WHEN** running `agent-lock.sh claim ticket <id> --force --branch <branch> --worktree <worktree>`
- **THEN** the lock is successfully claimed by the current session
- **AND** a log entry is written to `.reap.log`

#### Scenario: Force claim when lock owner process is alive
- **GIVEN** a ticket lock exists with owner_pid 111111
- **AND** process 111111 is currently running
- **WHEN** running `agent-lock.sh claim ticket <id> --force --branch <branch> --worktree <worktree>`
- **THEN** the command fails with a non-zero exit code
- **AND** the lock file is not modified

### Requirement: repo-hygiene Post-Merge-Guard fails closed on empty mergedAt
The post-merge validation script in repo-hygiene SHALL verify that any timestamp or commit metadata retrieved from external APIs (like GitHub CLI) is non-empty. If the API returns an empty string or error, the script SHALL abort with a failure (fail-closed) instead of silently treating it as success.

#### Scenario: GitHub API is down during Post-Merge-Guard check
- **GIVEN** the GitHub API is offline or returns an error
- **AND** `gh pr view` returns an empty string or error for mergedAt
- **WHEN** running the post-merge guard validation for a branch
- **THEN** the script aborts with an exit code 1
- **AND** does not proceed to delete or prune the worktree
