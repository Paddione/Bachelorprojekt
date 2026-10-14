---
name: operations-management
description: 'Routing hub for operational work — decides between incident-response (a service is down or degraded, time-critical), dev-flow-plan (plan or content work) and repo-hygiene (repository state: branches, worktrees, PRs). Use this first when the operational request is ambiguous; it holds no runbook of its own and only delegates. If you already know which skill you need, invoke it directly.'
---

# operations-management

This skill routes to focused sub-skills. Use the decision tree below to route to the correct one.

---

## Decision Tree

```
Is a core service DOWN or DEGRADED right now?
├── YES → Use incident-response
│          (production triage, diagnose, fix/rollback, post-mortem)
│
├── NO, PLAN or CONTENT work (feature, bug, chore)
│   ├── needs a plan first → Use dev-flow-plan
│   └── approved for execution → worker sandbox (task devflow:sandbox),
│        then dev-flow-execute — only after explicit approval
│
└── NO, repository STATE (branches, worktrees, PRs)
         → Use repo-hygiene
```

### Quick reference

| Situation | Skill |
|-----------|-------|
| Pocket ID/Nextcloud/Website/Brett/DB is down or crashing | `incident-response` |
| New feature, bug report, or chore needs a plan | `dev-flow-plan` |
| Approved work goes to execution sandboxes | `task devflow:sandbox`, then `dev-flow-execute` |
| Clean up stale worktrees and branches | `repo-hygiene` |
| Review & merge open PRs | `repo-hygiene` |
| File a bug found after merge | GitHub issue (see AGENTS.md Bug-Triage-Konvention) |

---

## Mishap Tracking

All sub-skills carry the mishap tracking preamble. After completing either, invoke `mishap-tracker` if any mishaps were accumulated.

## Related Skills

| Skill | Relationship |
|-------|--------------|
| `incident-response` | Production incident triage & recovery |
| `dev-flow-plan` | Plan work: specs, partials, plan-lint |
| `dev-flow-execute` | Execute approved plans in worker sandboxes |
| `repo-hygiene` | Repository state: branches, worktrees, PRs |
| `mishap-tracker` | Local mishap log (stderr + `.mishaps.log`) |


## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Full — load via `load skill <name>` or matches on description triggers |
| **opencode** | Full — available as a listed skill. All tools (CLI, MCP) are framework-agnostic |
| **agy** | Full — treat the opencode path as authoritative. All CLI tools and MCP calls work identically |
