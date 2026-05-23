---
name: ticket-management
description: Use when asked to work through, triage, or resolve open tickets in the mentolder ticket database, clean up stale git worktrees and branches, merge open PRs, or fix CI/CD failures. Covers fetching open tickets, categorizing by actionability, applying fixes autonomously for ai_ready tickets, routing needs_human tickets, and full repo hygiene.
---

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.

> **Loop Entry Point:** This skill starts every dev cycle. Before triaging user
> work, auto-apply any open skill-improvement tickets (Phase 0 below).

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
git worktree remove <path> --force   # path is /tmp/wt-<slug> (new convention) or .claude/worktrees/<name> (legacy)
git branch -D <branch>
```
**Note:** New worktrees use `/tmp/wt-<slug>` — `.claude/worktrees/` is gitignored and causes branch-detection failures.

**Bash script bug** — fix the script, verify with `bash -n <script>`.

**Test failure** — read the test, trace to source, fix the source (never just change the assertion value).

**Skill/template gap** — update the relevant `.claude/skills/` SKILL.md.

**Already fixed in referenced PR** — close as `done`/`fixed` with a note citing the PR. No code change needed.

## Repo Hygiene

Run this block **every session** before touching tickets — it surfaces work the DB may not know about.

### 1. Stale Worktrees

```bash
git worktree list
```

A worktree is stale when its branch is already merged to `main` or the owning plan/session is gone. Safe to remove:

```bash
# Verify merged first — never remove an unmerged worktree without checking
git log main..<branch> --oneline   # empty = fully merged
git worktree remove <path> --force  # path from `git worktree list` (new: /tmp/wt-<slug>, legacy: .claude/worktrees/<name>)
```

**Do not remove** a worktree if:
- Its branch has unmerged commits (check with `git log main..<branch>`)
- Another concurrent Claude session may own it (`git stash list`, `git log --all --grep=WIP`)

### 2. Stale Local Branches

```bash
git branch -vv | grep -v '^\*'
```

Delete branches that are either:
- Already merged: `git branch --merged main | grep -v main`
- Tracking a deleted remote: shows `[gone]` in `-vv` output

```bash
# Safe batch-delete merged local branches
git branch --merged main | grep -v 'main' | xargs git branch -d

# Delete a branch whose remote is gone
git branch -D <branch>
```

**Never force-delete** a branch with unmerged commits without user confirmation.

### 3. Stale Remote Branches

```bash
git fetch --prune   # prunes remote-tracking refs for deleted remote branches
gh pr list --state merged --limit 50 --json headRefName \
  | jq -r '.[].headRefName' \
  | xargs -I{} git push origin --delete {} 2>/dev/null || true
```

Only delete remote branches that: (a) had their PR merged, and (b) have no open PRs referencing them.

## GitHub PR Triage

### Fetch All Open PRs

```bash
gh pr list --state open --json number,title,headRefName,statusCheckRollup,reviewDecision,isDraft,mergeStateStatus \
  | jq '.[] | {number, title, branch: .headRefName, ci: (.statusCheckRollup // [] | map(.conclusion) | unique), review: .reviewDecision, draft: .isDraft, mergeState: .mergeStateStatus}'
```

### Triage Buckets

| Bucket | Condition | Action |
|--------|-----------|--------|
| **Merge immediately** | `mergeStateStatus=MERGEABLE`, CI green, not draft | Squash-merge now |
| **CI failing** | Any check is `FAILURE` or `TIMED_OUT` | Diagnose → fix → re-push |
| **Needs rebase** | `mergeStateStatus=BEHIND` | `gh pr update-branch <number>` or rebase |
| **Draft** | `isDraft=true` | Skip — author is not done |
| **Stale / abandoned** | Open >14 days, no activity, branch stale | Close with a note explaining why |

### Merging a PR

```bash
# Always squash-merge to keep main history clean (project rule)
gh pr merge <number> --squash --auto --delete-branch
```

After merge: verify the branch is gone remotely, then delete the local tracking ref (`git fetch --prune`).

### Diagnosing CI Failures

```bash
# List failed checks on a PR
gh pr checks <number> | grep -E 'fail|error' -i

# View the failing job log (get run ID from the check URL or gh run list)
gh run list --branch <branch> --limit 5
gh run view <run-id> --log-failed
```

Common CI failures in this repo and fixes:

| Failure | Likely cause | Fix |
|---------|-------------|-----|
| `task test:all` exits non-zero | BATS unit test regression | Run `task test:unit` locally, fix the failing assertion |
| `test-inventory` diverged | Added/removed a test without regenerating | `task test:inventory` then commit |
| Arena protocol drift | `messages.ts` ≠ `lobbyTypes.ts` | Copy the canonical file, commit |
| `kustomize build` fails | Bad patch or missing resource | `task workspace:validate` locally |
| Image push fails (ghcr.io 403) | `default_workflow_permissions` not set to write | Fix in GitHub repo settings (see memory `reference_ghcr_workflow_permissions`) |
| Secret scanning alert | Hardcoded credential detected | Remove credential, rotate it, force-push (coordinate with user) |

### Closing a Stale PR

```bash
gh pr close <number> --comment "Closing as stale — <reason>. Reopen if this work resumes."
git push origin --delete <branch>  # clean up remote branch
```

## GitHub Issues Triage

```bash
# List open issues
gh issue list --state open --json number,title,labels,assignees,createdAt \
  | jq '.[] | {number, title, labels: [.labels[].name], age: .createdAt}'
```

| Issue type | Action |
|-----------|--------|
| Already fixed by a merged PR | Close with `gh issue close <n> --comment "Fixed in PR #<m>"` |
| Duplicate | Close with `gh issue close <n> --comment "Duplicate of #<m>"` and add `duplicate` label |
| Tracked in DB ticket | Add comment linking ticket ID, then close or leave open per user preference |
| Genuine open work | Create a DB ticket if it doesn't exist, link the issue in the ticket notes |

## Ticketing Etiquette

- Always add a dated note (`[ticket-management YYYY-MM-DD]`) — never leave notes blank.
- Set `done_at = now()` whenever closing.
- Use `attention_mode = 'ai_ready'` as a staging flag before acting — it's a breadcrumb if the fix fails partway.
- Batch SQL for multiple similar tickets (e.g. close 11 already-fixed at once), but write individual notes per ticket.
- After code fixes: create one PR per logical group of tickets, reference ticket IDs in the commit and PR title.

## Session Workflow

**Phase −1 — Skill-improvement tickets (loop feedback, always first)**

```bash
PGPOD=$(kubectl get pod -n workspace --context mentolder \
  -l app=shared-db -o name | head -1)

kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -At -c \
  "SELECT external_id, title, description, component
   FROM tickets.tickets
   WHERE status NOT IN ('done', 'archived')
     AND component LIKE 'skills/%'
     AND attention_mode = 'ai_ready'
   ORDER BY created_at ASC;"
```

Falls Ergebnisse: dieselbe auto-apply Logik wie `dev-flow-e2e` Schritt 9b (ephemerter Branch + PR + auto-merge + Ticket schließen). Danach weiter mit Phase 0.

Falls keine Ergebnisse: direkt weiter mit Phase 0.

*Idempotent — falls dev-flow-e2e Schritt 9 bereits alle Tickets bearbeitet hat, liefert diese Abfrage nichts zurück.*

**Phase 0 — Repo hygiene (always first)**
1. `git worktree list` → identify and remove stale worktrees (branch merged to main)
2. `git branch --merged main` → delete merged local branches
3. `git fetch --prune` → clean remote-tracking refs
4. `gh pr list --state open` → triage all open PRs (merge ready ones immediately)
5. `gh issue list --state open` → close issues that are already fixed or duplicate
6. Fix any CI failures on mergeable PRs before touching tickets

**Phase 1 — Ticket triage**
7. Fetch all open tickets
8. Present categorization to user for confirmation before acting (especially for `needs_human` judgment calls)

**Phase 2 — Execute**
9. Batch-close the "already resolved" group first (quick wins, no code risk)
10. Set `ai_ready` on fixable tickets, then fan out fixes in parallel (use Agent tool for independent tasks)
11. Set `needs_human` with specific asks for blocked tickets
12. Commit code changes → PR → auto-merge
13. Close fixed tickets in DB after the PR is up

## Common Mistakes

| Mistake | Correct approach |
|---------|-----------------|
| Closing `in_progress` plan tickets | Set `needs_human` — they have their own lifecycle |
| Using free-text resolution values | Only use: `fixed / shipped / wontfix / duplicate / cant_reproduce / obsolete` |
| Writing vague human-needed notes | Include the specific question or action the human must take |
| Fixing tests by changing the assertion | Find the source of the regression; fix the logic |
| Acting on tickets before presenting categorization to user | Always confirm the triage grouping first |
| Deleting a worktree/branch without checking for unmerged commits | Always run `git log main..<branch> --oneline` first — empty = safe |
| Force-deleting an unmerged branch without user confirmation | Only `git branch -D` with user consent; prefer `git branch -d` (safe delete) |
| Merging a PR without squash | Project rule: always `--squash`; regular merge pollutes main history |
| Ignoring CI failures on a PR before merge | Fix CI first — a red PR is blocked; never merge with failing checks |
| Closing a GitHub issue without a comment explaining why | Always leave a comment — it's the public audit trail |

## Post-Execution: Mishap Report

After completing all steps in this skill, invoke `mishap-tracker` with your
accumulated `MISHAP_LOG`. If no mishaps were found, `mishap-tracker` exits
cleanly with "No mishaps found."
