# dev-flow skills

The repository workflow runs `dev-flow-plan` to stage a plan in `.agents/plans/<slug>/`, then `dev-flow-execute` to implement, verify, and open a PR. The ticket's `FACTORY-PLAN-REF` locates the plan. Use an isolated worktree, `task test:changed`, `task freshness:check`, and `task workspace:validate` before the PR.

Use the `dev-flow-plan` and `dev-flow-execute` skills.
