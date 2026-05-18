---
name: ticket-management
description: Use when asked to work through, triage, or resolve open tickets in the mentolder ticket database. Covers fetching open tickets, categorizing by actionability, applying fixes autonomously for ai_ready tickets, and routing needs_human tickets with a clear request.
---

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.

# Ticket Management

## Overview

Work through open tickets in `tickets.tickets` on the mentolder cluster. For each ticket: categorize, act or route, then update the DB with proper ticketing etiquette (status, resolution, notes, done_at).

## Connection

```bash
task workspace:psql ENV=mentolder -- website <<'SQL'
<query>
SQL
```

## Fetch Open Tickets

```sql
SELECT external_id, title, status, priority, severity, type,
       attention_mode, created_at::date, description
FROM tickets.tickets
WHERE status NOT IN ('done', 'archived')
ORDER BY priority DESC NULLS LAST, created_at ASC;
```

## Categorization Flow

For each ticket, classify into one of four buckets before acting:

| Bucket | Condition | Action |
|--------|-----------|--------|
| **Already resolved** | Description says "fixed in PR #X" / "resolved this session" | `done` + `fixed`, note the PR |
| **Obsolete** | Feature/system removed (e.g. ArgoCD gone) | `done` + `obsolete` |
| **AI-fixable** | Clear root cause, safe code/config change, no human judgment needed | Set `ai_ready`, fix it, then `done` + `fixed` |
| **Human needed** | Active plan branch, parallel-session artifact, external env, design decision | Set `needs_human`, add a crisp request |

**Never touch `in_progress` tickets that reference a live plan branch.** Set `needs_human` and move on.

## Constraints (check constraints — use only these values)

```
status:      triage | backlog | in_progress | in_review | blocked | done | archived
resolution:  fixed | shipped | wontfix | duplicate | cant_reproduce | obsolete
attention_mode: auto | ai_ready | needs_human
priority:    hoch | mittel | niedrig
severity:    critical | major | minor | trivial
```

`resolution` is required when status is `done` or `archived`.

## Closing a Ticket

```sql
UPDATE tickets.tickets SET
  status = 'done',
  resolution = 'fixed',          -- or: shipped / wontfix / obsolete / duplicate
  done_at = now(),
  notes = COALESCE(notes || E'\n\n', '') ||
    '[ticket-management YYYY-MM-DD] <one sentence on what was done / why closed>'
WHERE external_id = 'T000XXX';
```

## Routing to Human

```sql
UPDATE tickets.tickets SET
  attention_mode = 'needs_human',
  notes = COALESCE(notes || E'\n\n', '') ||
    '[ticket-management YYYY-MM-DD] Human needed: <specific question or action required>'
WHERE external_id = 'T000XXX';
```

The note must contain a **specific ask** — not just "needs human". Good: "Decide: keep parked/arena-alpine-bootstrap branch or delete?" Bad: "Needs human review."

## Marking AI-Actionable

```sql
UPDATE tickets.tickets SET attention_mode = 'ai_ready'
WHERE external_id IN ('T000XXX', 'T000YYY');
```

Set this before starting the fix. After the fix is complete, close with `done` + `fixed`.

## Fix Patterns by Type

**Stale worktree/branch** (type=task, trivial):
```bash
git worktree remove .claude/worktrees/<name> --force
git branch -D <branch>
```

**Bash script bug** — fix the script, verify with `bash -n <script>`.

**Test failure** — read the test, trace to source, fix the source (never just change the assertion value).

**Skill/template gap** — update the relevant `.claude/skills/` SKILL.md.

**Already fixed in referenced PR** — close as `done`/`fixed` with a note citing the PR. No code change needed.

## Ticketing Etiquette

- Always add a dated note (`[ticket-management YYYY-MM-DD]`) — never leave notes blank.
- Set `done_at = now()` whenever closing.
- Use `attention_mode = 'ai_ready'` as a staging flag before acting — it's a breadcrumb if the fix fails partway.
- Batch SQL for multiple similar tickets (e.g. close 11 already-fixed at once), but write individual notes per ticket.
- After code fixes: create one PR per logical group of tickets, reference ticket IDs in the commit and PR title.

## Session Workflow

1. Fetch all open tickets
2. Present categorization to user for confirmation before acting (especially for `needs_human` judgment calls)
3. Batch-close the "already resolved" group first (quick wins, no code risk)
4. Set `ai_ready` on fixable tickets, then fan out fixes in parallel (use Agent tool for independent tasks)
5. Set `needs_human` with specific asks for blocked tickets
6. Commit code changes → PR → auto-merge
7. Close fixed tickets in DB after the PR is up

## Common Mistakes

| Mistake | Correct approach |
|---------|-----------------|
| Closing `in_progress` plan tickets | Set `needs_human` — they have their own lifecycle |
| Using free-text resolution values | Only use: `fixed / shipped / wontfix / duplicate / cant_reproduce / obsolete` |
| Writing vague human-needed notes | Include the specific question or action the human must take |
| Fixing tests by changing the assertion | Find the source of the regression; fix the logic |
| Acting on tickets before presenting categorization to user | Always confirm the triage grouping first |

## Post-Execution: Mishap Report

After completing all steps in this skill, invoke `mishap-tracker` with your
accumulated `MISHAP_LOG`. If no mishaps were found, `mishap-tracker` exits
cleanly with "No mishaps found."
