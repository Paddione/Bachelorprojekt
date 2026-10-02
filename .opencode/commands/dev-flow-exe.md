---
description: Execute a staged plan through the dev-flow-execute lifecycle
---

# Plan execution

Resolve the plan from the ticket's FACTORY-PLAN-REF and read `.agents/plans/<slug>/tasks.md` and its partials. Follow the repository's [dev-flow-execute skill](../skills/dev-flow-execute/SKILL.md) through implementation, verification, commit, push, and PR creation. Use an isolated worktree and explicit `git -C <worktree>` commands.
