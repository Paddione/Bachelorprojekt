---
name: operations-management
description: Routing hub — dispatches to incident-response (production incidents) or ticket-ops (ticket triage, repo hygiene, PR management). Use this skill first; it delegates to the right sub-skill.
---

# operations-management

This skill has been split into two focused sub-skills. Use the decision tree below to route to the correct one.

---

## Decision Tree

```
Is a core service DOWN or DEGRADED right now?
├── YES → Use incident-response
│          (production triage, diagnose, fix/rollback, post-mortem)
│
└── NO  → Use ticket-ops
           (DB ticket triage, stale worktrees/branches, PR merge→close,
            GitHub issue intake)
```

### Quick reference

| Situation | Skill |
|-----------|-------|
| Keycloak/Nextcloud/Website/Brett/LiveKit/DB is down or crashing | `incident-response` |
| Triage open tickets, mark AI-fixable or needs-human | `ticket-ops` |
| Clean up stale worktrees and branches | `ticket-ops` |
| Review & merge open PRs, close linked tickets | `ticket-ops` |
| Funnel GitHub issues into internal tracker | `ticket-ops` |

---

## Software-Factory operations (MCP-first)

Factory-Queue-Status und manuelles Anstoßen: MCP-first via `factory-mcp` — Health-Guard, Tools und
Fallbacks sind SSOT im [`MCP-Tool-Guide`](file:///home/patrick/Bachelorprojekt/.claude/skills/references/mcp-tool-guide.md) §factory-mcp.

---

## Mishap Tracking

Both sub-skills carry the mishap tracking preamble. After completing either, invoke `mishap-tracker` if any mishaps were accumulated.

## Related Skills

| Skill | Relationship |
|-------|--------------|
| `incident-response` | Production incident triage & recovery |
| `ticket-ops` | Daily ticket management & PR workflow |
| `mishap-tracker` | Converts execution mishaps to tickets |

> This skill was split from a combined runbook. If you find you need content from the other sub-skill frequently, consider running them in sequence.
