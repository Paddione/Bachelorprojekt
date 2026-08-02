# Proposal: t002188-dev-flow-plan-fix

## Why

Mishap: The Pre-Commit Guard in `.claude/skills/dev-flow-plan/SKILL.md` uses a relative
path `.git/agent-locks/` to locate the agent-lock file. In a `git worktree`, `.git` is a
**file** (not a directory), so the lock check always fails — either blocking the commit with
a false "branch mismatch" or silently allowing unguarded commits.

## Fix

Replace `.git/agent-locks/ticket__${TICKET_EXT_ID}.json` with
`$(git rev-parse --git-common-dir)/agent-locks/ticket__${TICKET_EXT_ID}.json` in the
dev-flow-plan SKILL.md guard. Check dev-flow-execute for the same pattern.

## Trade-offs

- Minimal risk. Single-path fix in skill documentation.

## Risks

- None.
