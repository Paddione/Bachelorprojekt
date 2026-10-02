# Plan archive after merge

`devflow-post-merge-finalize.sh` reads the plan path from `FACTORY-PLAN-REF`, copies `tasks.md` into a temporary file, marks its frontmatter `status: completed`, and calls `ticket.sh archive-plan`. This persists the plan in `tickets.ticket_plans` before branch and worktree cleanup. The finalizer is idempotent; call it again with the ticket ID and merged PR number if an earlier run stopped.

```bash
bash scripts/devflow-post-merge-finalize.sh "$TICKET_ID" --pr "$PR_NUM"
```

The staged plan remains a regular repository file until a later cleanup change removes it.
