# Plan archive after merge

`devflow-post-merge-finalize.sh` reads the plan path from `FACTORY-PLAN-REF`, copies `tasks.md` into a temporary file, and marks its frontmatter `status: completed` before branch and worktree cleanup. No ticket backend is involved anymore (Ticket-Retirement 2026-10-14: `ticket.sh archive-plan` and `tickets.ticket_plans` are gone). The finalizer is idempotent; call it again with the merged PR number if an earlier run stopped.

```bash
bash scripts/devflow-post-merge-finalize.sh --pr "$PR_NUM"
```

The completed plan remains a regular repository file until a later cleanup change removes it.
