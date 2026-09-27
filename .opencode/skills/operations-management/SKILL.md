---
name: operations-management
description: 'Routing hub for operational work — decides between incident-response (a service is down or degraded, time-critical), ticket-triage/ticket-dispatch (ticket content) and repo-hygiene (repository state: branches, worktrees, PRs). Use this first when the operational request is ambiguous; it holds no runbook of its own and only delegates. Requests naming a ticket ID (T…) skip this hub and start at ticket-triage. If you already know which skill you need, invoke it directly.'
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
├── NO, ticket CONTENT
│   ├── completeness, DoR, missing facts, clarification → Use ticket-triage
│   └── dependency waves, approved dispatch → Use ticket-dispatch
│        (legacy alias ticket-ops still routes to both; prefer the direct skills)
│
└── NO, repository STATE (branches, worktrees, PRs)
         → Use repo-hygiene
```

### Quick reference

| Situation | Skill |
|-----------|-------|
| Pocket ID/Nextcloud/Website/Brett/DB is down or crashing | `incident-response` |
| Triage open tickets, mark AI-fixable or needs-human | `ticket-triage` |
| Clean up stale worktrees and branches | `repo-hygiene` |
| Review & merge open PRs, close linked tickets | `repo-hygiene` |
| Funnel GitHub issues into internal tracker | `repo-hygiene` |

---

## Mishap Tracking

All sub-skills carry the mishap tracking preamble. After completing either, invoke `mishap-tracker` if any mishaps were accumulated.

## Related Skills

| Skill | Relationship |
|-------|--------------|
| `incident-response` | Production incident triage & recovery |
| `ticket-triage` | Ticket content: completeness, DoR, clarification (dispatcht nie) |
| `ticket-dispatch` | Ticket waves & approved dispatch |
| `ticket-ops` | Legacy alias routing to ticket-triage/ticket-dispatch |
| `repo-hygiene` | Repository state: branches, worktrees, PRs |
| `mishap-tracker` | Converts execution mishaps to tickets |


## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Full — load via `load skill <name>` or matches on description triggers |
| **opencode** | Full — available as a listed skill. All tools (CLI, MCP) are framework-agnostic |
| **agy** | Full — treat the opencode path as authoritative. All CLI tools and MCP calls work identically |

