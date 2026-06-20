---
name: factory-worker
description: Interactive Software-Factory worker. Invoke via /factory-worker-on when DeepSeek-Scout produced weak output (SCOUT_WEAK) or tickets sit in planning with no committed plan, and a human needs to scout + plan them so the autopilot can build them. Yields one autopilot parallel slot while active.
---

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.

# factory-worker

A human-driven worker that complements the headless `factory-autopilot`. Where DeepSeek-Scout
fails (empty `touched_files`, thin spec → `SCOUT_WEAK=true` comment) or a ticket has no committed
plan, the interactive session scouts, brainstorms, and plans the ticket via `dev-flow-plan`, then
stages the plan so the autopilot picks it up on its next tick.

While this skill holds the sentinel lock, the autopilot dispatcher reduces its parallel slots by 1
(see `scripts/factory/dispatcher.js`), leaving the human room in the queue.

---

## Phase 1 — Claim the sentinel lock

Hold an `interactive-worker`-labelled claim so the dispatcher yields a slot:

```bash
bash scripts/agent-lock.sh claim ticket interactive-scout \
  --label interactive-worker --worktree "$PWD"
```

If this exits non-zero, another interactive worker is already active — coordinate, do not run a
second one.

---

## Phase 2 — Scan for tickets needing a human plan

Query the shared DB for tickets in `planning`/`backlog` that either have no committed plan
(`branch`/`plan_ref` unset) or carry a `SCOUT_WEAK=true` internal comment:

```bash
kubectl exec -n workspace --context fleet deploy/shared-db -c postgres -- \
  psql -U postgres -d website -c "
SELECT t.external_id, t.title, t.brand, t.status
FROM tickets.tickets t
WHERE t.status IN ('planning','backlog')
  AND (
    t.plan_ref IS NULL
    OR EXISTS (
      SELECT 1 FROM tickets.ticket_comments c
      WHERE c.ticket_id = t.id
        AND c.body LIKE 'SCOUT_WEAK=true%'
        AND c.visibility = 'internal'
    )
  )
ORDER BY t.planning_rank ASC NULLS LAST, t.created_at ASC
LIMIT 10;"
```

> Column names: confirm against the live schema if the query errors (`\d tickets.tickets`,
> `\d tickets.ticket_comments`). Do not `SELECT *` or select large `content`/`body` columns over
> wide result sets (CLAUDE.md DB gotcha).

Present the result as a numbered list (external_id, title, brand, status) and ask the user which
ticket to plan.

---

## Phase 3 — Show context for the chosen ticket

```bash
bash scripts/ticket.sh get --id <EXTERNAL_ID>
```

If a `SCOUT_WEAK` comment exists, surface it so the user knows why the autopilot parked the ticket
(e.g. `touched_files=0`, `spec_length=<n>`).

---

## Phase 4 — Plan via dev-flow-plan

Invoke `dev-flow-plan` for the chosen ticket. It handles worktree setup, brainstorming, spec, and
plan creation, then commits and pushes the plan to the feature branch and stops. Note the resulting
`<branch>` and `<plan_path>` (relative repo path, e.g. `openspec/changes/<slug>/tasks.md`).

---

## Phase 5 — Stage the plan for the autopilot

After the plan is committed and pushed to the branch:

```bash
bash scripts/ticket.sh stage-plan --id <EXTERNAL_ID> --branch <branch> --plan <plan_path>
```

The next dispatcher tick's readiness guard (`scripts/factory/readiness-check.sh`, called from
`factory-prep-bridge.sh`) will confirm the branch + plan exist on `origin` and admit the ticket to
the autopilot's launch list.

Repeat Phases 2–5 for additional tickets, or proceed to Phase 6.

---

## Phase 6 — Release the sentinel lock

```bash
bash scripts/agent-lock.sh release ticket interactive-scout
```

The dispatcher regains its full parallel slot count on the next tick.

---

## Related Skills

| Skill | Beziehung |
|-------|-----------|
| `factory-autopilot` | Gegenstück — headless dispatcher this worker feeds |
| `dev-flow-plan` | Kern — does the actual scout/brainstorm/plan work |
| `mishap-tracker` | Abschluss — protokolliert Frictions |
