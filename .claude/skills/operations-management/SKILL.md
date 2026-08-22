---
name: operations-management
description: 'Routing hub for operational work — decides between incident-response (a service is down or degraded, time-critical), ticket-ops (ticket content: triage, missing information, parallel-work planning) and repo-hygiene (repository state: branches, worktrees, PRs, factory queue). Use this first when the operational request is ambiguous; it holds no runbook of its own and only delegates. If you already know which of the three you need, invoke that skill directly.'
---

# operations-management

This skill routes to three focused sub-skills. Use the decision tree below to route to the correct one.

---

## Decision Tree

```
Is a core service DOWN or DEGRADED right now?
├── YES → Use incident-response
│          (production triage, diagnose, fix/rollback, post-mortem)
│
├── NO, ticket CONTENT (triage, missing info, parallel planning)
│        → Use ticket-ops
│
└── NO, repository STATE (branches, worktrees, PRs, factory queue)
         → Use repo-hygiene
```

### Quick reference

| Situation | Skill |
|-----------|-------|
| Pocket ID/Nextcloud/Website/Brett/DB is down or crashing | `incident-response` |
| Triage open tickets, mark AI-fixable or needs-human | `ticket-ops` |
| Clean up stale worktrees and branches | `repo-hygiene` |
| Review & merge open PRs, close linked tickets | `repo-hygiene` |
| Funnel GitHub issues into internal tracker | `repo-hygiene` |

---

## Software-Factory operations (MCP-first)

Factory-Queue-Status und manuelles Anstoßen: MCP-first via `factory-mcp` — Health-Guard, Tools und
Fallbacks sind SSOT im [`MCP-Tool-Guide`](.claude/skills/references/mcp-tool-guide.md) §factory-mcp.

---

## Mishap Tracking

All three sub-skills carry the mishap tracking preamble. After completing either, invoke `mishap-tracker` if any mishaps were accumulated.

## Related Skills

| Skill | Relationship |
|-------|--------------|
| `incident-response` | Production incident triage & recovery |
| `ticket-ops` | Ticket content: triage, missing information, parallel-work planning |
| `repo-hygiene` | Repository state: branches, worktrees, PRs, factory queue |
| `mishap-tracker` | Converts execution mishaps to tickets |


## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Full — load via `load skill <name>` or matches on description triggers |
| **opencode** | Full — available as a listed skill. All tools (CLI, MCP) are framework-agnostic |
| **agy** | Full — treat the opencode path as authoritative. All CLI tools and MCP calls work identically |

