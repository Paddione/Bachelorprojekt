---
name: dev-flow
description: RETIRED — use dev-flow-plan (planning phase) and dev-flow-execute (implementation phase) instead.
---

> **Mishap Tracking:** If this skill is ever invoked despite being RETIRED,
> maintain a `MISHAP_LOG` and invoke `mishap-tracker` at the end. Log the
> invocation itself as `type: suspicious`, `title: "retired dev-flow skill
> invoked"`, `component: skill-routing`.

# dev-flow — RETIRED

This skill has been split into two:

- **`dev-flow-plan`** — path decision, worktree, brainstorming, spec, plan creation, commit+push. Entry point for all work.
- **`dev-flow-execute`** — picks up a staged plan, implements, verifies, PRs, deploys.

Do not use this skill. Invoke `dev-flow-plan` instead.
