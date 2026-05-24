---
name: operations-management
description: Unified runbook for incident response (production triage, scope, fix/rollback, post-mortem), ticket management (triaging, closing, routing tickets), repo hygiene (worktree/branch pruning), PR triage, and mishap tracking.
---

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.

# operations-management

This runbook covers system operations: handling production incidents, database tickets triage, repository git branch/worktree hygiene, PR reviews, and logging execution mishaps.

---

## Phase 1 — Production Incident Response

Use this process when a core platform service is down or degraded.

### Step 1.1: Scope the Incident (< 2 min)
Determine:
1. **Affected Service:** Keycloak, Nextcloud, Website, Brett, Arena, Vaultwarden, Docs, LiveKit, or Shared-DB.
2. **Target Cluster:** `mentolder`, `korczewski`, or both.
3. **Onset Time:** Since when has it been failing? Check git log or deployment status.
4. **Blast Radius:** All users or a subset of features?

### Step 1.2: Open an Incident Ticket
Create a ticket in the database:
```bash
PGPOD=$(kubectl get pod -n workspace --context mentolder -l app=shared-db -o name | head -1)
kubectl exec "$PGPOD" -n workspace --context mentolder -- psql -U website -d website -At -c \
  "INSERT INTO tickets.tickets (type, brand, title, description, status, severity, priority)
   VALUES ('bug', 'mentolder', 'Incident: <desc>', 'Affected: <svc>\nCluster: <env>\nSymptoms: <symptoms>', 'in_progress', '<critical|major|minor>', 'hoch')
   RETURNING external_id;"
```

### Step 1.3: Diagnose
* **Pod status:** `task workspace:status ENV=mentolder` (check for CrashLoopBackOff, OOMKilled, Pending).
* **Logs:** `task workspace:logs ENV=<env> -- <service>`.
* **Recent Deploys:** `git log --oneline -10`.

### Step 1.4: Fix or Rollback
* **Rollback:** If introduced by the last deploy without database schema migrations, roll back the pod image:
  ```bash
  kubectl set image deployment/website website=ghcr.io/paddione/workspace-website:<PREV_SHA> -n <ns> --context <ctx>
  ```
* **Fix:** Open a `fix/<slug>` branch, implement, PR, merge, and verify.

### Step 1.5: Close & Write Post-Mortem
```bash
kubectl exec "$PGPOD" -n workspace --context mentolder -- psql -U website -d website -c \
  "UPDATE tickets.tickets SET status = 'done', resolution = 'fixed', done_at = now(), notes = COALESCE(notes || E'\n\n', '') || '[incident-response $(date +%Y-%m-%d)] Root cause: <cause>. Fix: <fix>. Duration: <X> min.' WHERE external_id = '<TICKET_EXT_ID>';"
```

---

## Phase 2 — Database Ticket Management

Fetch, triage, and resolve open tickets in the tickets database on `mentolder`.

### Step 2.1: Fetch Open Tickets
```sql
SELECT external_id, title, status, priority, severity, type, attention_mode, created_at::date, description
FROM tickets.tickets
WHERE status NOT IN ('done', 'archived')
ORDER BY priority DESC NULLS LAST, created_at ASC;
```

### Step 2.2: Categorization Flow
1. **Already Resolved:** Mark `done` + `fixed`, cite the PR in notes.
2. **Obsolete:** Mark `done` + `obsolete` (e.g. decommissioned services).
3. **AI-Fixable:** Set `attention_mode = 'ai_ready'`, execute code/config fixes, then mark `done` + `fixed`.
4. **Human Needed:** Set `attention_mode = 'needs_human'` and add a clear question/ask in the ticket notes.
*Note: Do not touch `in_progress` tickets referencing a live plan branch.*

---

## Phase 3 — Repository Hygiene & PR Triage

### Step 3.1: Stale Git Worktrees
List worktrees: `git worktree list`.
Verify if the branch is merged: `git log main..<branch> --oneline` (empty means fully merged).
Remove stale worktrees:
```bash
git worktree remove <path> --force
```

### Step 3.2: Stale Branches
Prune local and remote branches:
```bash
# Safe batch-delete merged local branches
git branch --merged main | grep -v 'main' | xargs git branch -d

# Prune gone remote-tracking branches
git fetch --prune
```

### Step 3.3: GitHub PR Triage
List open PRs:
```bash
gh pr list --state open --json number,title,headRefName,statusCheckRollup,reviewDecision,isDraft,mergeStateStatus
```
* **Merge:** If mergeable, CI green, and not draft: `gh pr merge <number> --squash --auto --delete-branch`.
* **CI Failures:** Diagnose failed checks with `gh pr checks <number>`.

---

## Phase 4 — Mishap Tracker Utility

Convert local execution `MISHAP_LOG` entries into tickets.

### Step 4.1: Severity Mapping
* `broken` ──► bug / major
* `security` ──► bug / critical
* `degraded` ──► bug / minor
* `suspicious` ──► task / minor
* `drift` ──► task / trivial
* `process` ──► task / trivial (`component` = `skills/<skill-name>`, `attention_mode` = `ai_ready`)

### Step 4.2: Insert Tickets
For each entry in the log:
```bash
PGPOD=$(kubectl get pod -n workspace --context mentolder -l app=shared-db -o name | head -1)
kubectl exec "$PGPOD" -n workspace --context mentolder -- psql -U website -d website -At -c \
  "INSERT INTO tickets.tickets (type, brand, title, description, severity, status, component)
   VALUES ('<type>', 'mentolder', '<title>', '<description>', '<severity>', 'triage', '<component>')
   RETURNING external_id;"
```
If the database is unreachable, output the formatting log messages to the console for the user to create manually at `https://web.mentolder.de/admin/bugs`.

---

## Post-Execution: Mishap Report

After completing all steps in this skill, invoke `mishap-tracker` with your accumulated `MISHAP_LOG`. If no mishaps were found, `mishap-tracker` exits cleanly.
