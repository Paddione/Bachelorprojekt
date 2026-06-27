# Proposal: t001269-mishap-bundle-skills-dev-flow-execute-repo-worktree-state-ticket-mcp

## Why

We need to address three process glitches (mishaps) identified during development flows:
1. Active plan files (having status `plan_staged` or `in_progress`) were not being converted to `completed` in `.claude/skills/dev-flow-execute/SKILL.md` because `sed` only matched `status: active`.
2. Local configs like `.claude/settings.json` and `.opencode/opencode.jsonc` were lost on aggressive `git reset --hard` cleanup operations.
3. Subagents noted missing MCP tools (like `stage_plan`) in the opencode runtime due to outdated binaries and lack of documentation on MCP extension workflows.

## What

We will implement the following:
1. Update `.claude/skills/dev-flow-execute/SKILL.md` status replacement with an extended regex supporting `plan_staged`, `in_progress`, and `active`.
2. Add a guidelines section to `CONTRIBUTING.md` advising on the risk of `git reset --hard` and recommending `git stash push -u` or selective checkouts.
3. Add MCP registration and compiling guidelines to `CONTRIBUTING.md` as developer best practices, and verify schema generation alignment.

_Ticket: T001269_
