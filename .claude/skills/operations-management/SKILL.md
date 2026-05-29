---
name: operations-management
description: Unified runbook for incident response (production triage, scope, fix/rollback, post-mortem), internal ticket management (triaging, closing, routing tickets in tickets.tickets), repo hygiene (worktree/branch pruning), GitHub PR triage and CI/CD merge with closure of the linked internal ticket, GitHub issue intake, and mishap tracking.
---

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.

# operations-management

This runbook covers system operations: handling production incidents, database tickets triage, repository git branch/worktree hygiene, PR reviews, and logging execution mishaps.

---

## Ticket model & GitHub linkage (read first)

The internal Postgres tracker — `tickets.tickets` on `mentolder` (`website` DB) — is the **single source of truth for issues**. This repo does **not** use GitHub Issues (`gh issue`); the website admin at `https://web.mentolder.de/admin/bugs` is the UI over the same table. If a GitHub issue ever does appear, treat it as intake (see Step 3.4): copy it into a `tickets.tickets` row, then close the GitHub issue referencing the new `external_id`.

GitHub **PRs are the CI/CD merge mechanism** and link back to a ticket by convention — there is **no `ticket_id` FK on PRs**. The link lives in three soft channels:
- the `[T000XXX]` tag in the PR/commit title and the `fix/tNNNN-…` / `feature/…` branch name,
- `tickets.ticket_plans.pr_number` (written when a plan is archived by `dev-flow-execute`),
- a closing row in `tickets.ticket_comments` (`PR #N merged …`).

Never use `tickets.ticket_links` for PR references — it is ticket→ticket only (`to_id` is `NOT NULL`, `kind ∈ blocks|blocked_by|duplicate_of|relates_to|fixes|fixed_by`).

**Enum reference** (closing a ticket with an out-of-set value fails the CHECK constraint):
`priority ∈ {hoch,mittel,niedrig}` · `severity ∈ {critical,major,minor,trivial}` · `status ∈ {triage,in_progress,done,archived,blocked}` · `resolution ∈ {fixed,shipped,obsolete}` · `attention_mode ∈ {auto,ai_ready,needs_human}` (default `auto`).

All SQL below assumes:
```bash
PGPOD=$(kubectl get pod -n workspace --context mentolder -l app=shared-db -o name | head -1)
psql() { kubectl exec "$PGPOD" -n workspace --context mentolder -- psql -U website -d website "$@"; }
```

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
Close the ticket **and** record the fix PR so the incident is traceable to the change that resolved it. If the fix went out as a PR, capture its number first (`PR_NUM=$(gh pr view <branch-or-num> --json number -q '.number')`); for a rollback-only fix, omit the comment.
```bash
psql -c \
  "UPDATE tickets.tickets SET status = 'done', resolution = 'fixed', done_at = now(), notes = COALESCE(notes || E'\n\n', '') || '[incident-response $(date +%Y-%m-%d)] Root cause: <cause>. Fix: <fix>. Duration: <X> min.' WHERE external_id = '<TICKET_EXT_ID>';

   INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
   SELECT id, 'claude-code', 'Resolved by PR #<PR_NUM> (or rollback to <PREV_SHA>).', 'internal'
   FROM tickets.tickets WHERE external_id = '<TICKET_EXT_ID>';"
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
3. **AI-Fixable:** Set `attention_mode = 'ai_ready'`. Do **not** push fixes straight to `main` — hand the ticket to `dev-flow-plan` / `dev-flow-execute`, which opens a `fix/tNNNN-…` branch, PRs it, and closes the ticket on merge (Step 3.3). Trivial one-liners may PR directly, but still merge via PR.
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

### Step 3.3: GitHub PR Triage → close the linked ticket
List open PRs:
```bash
gh pr list --state open --json number,title,headRefName,statusCheckRollup,reviewDecision,isDraft,mergeStateStatus
```

For each PR, first recover the ticket it resolves (soft link — see preamble). Title tag wins; branch name is the fallback:
```bash
TITLE=$(gh pr view <number> --json title -q '.title')
BRANCH=$(gh pr view <number> --json headRefName -q '.headRefName')
TICKET_ID=$(printf '%s %s' "$TITLE" "$BRANCH" | grep -oiE 'T[0-9]{6}' | head -1 | tr a-z A-Z)
```

* **Merge (mergeable, CI green, not draft):**
  ```bash
  gh pr merge <number> --squash --delete-branch
  ```
  > **Expected exit 1 after a squash-merge is NOT a failure.** A squash-merge makes the local branch diverge from `main`, so `gh pr merge` exits 1 with `not possible to fast-forward` even though the PR merged. **Always verify by timestamp, never by exit code:**
  > ```bash
  > gh pr view <number> --json mergedAt -q '.mergedAt'   # empty = still open; timestamp = merged
  > ```
  Use `--auto` instead when CI is still running — GitHub merges once checks pass.

* **Close the ticket once `mergedAt` is set** (only if `$TICKET_ID` was found; `resolution`: `fixed` for `fix/*`, `shipped` for `feature/*`):
  ```bash
  psql -c \
    "UPDATE tickets.tickets SET status='done', resolution='fixed', done_at=now()
     WHERE external_id='$TICKET_ID' AND status <> 'done';
     INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
     SELECT id, 'claude-code', 'PR #<number> merged.', 'internal'
     FROM tickets.tickets WHERE external_id='$TICKET_ID';"
  ```
  If no `T000XXX` is recoverable, the PR is unlinked — note it and leave any ticket untouched.

* **CI Failures:** Diagnose failed checks with `gh pr checks <number>`. Do not merge red PRs. If the failure is a known flake, re-run; otherwise leave the PR open and (if it has a ticket) leave the ticket `in_progress`.

### Step 3.4: GitHub Issue Intake (rare)
This repo tracks issues in Postgres, not GitHub. If `gh issue list --state open` returns anything, funnel it in rather than working it on GitHub:
1. Create a `tickets.tickets` row from the issue (`type`, `brand`, `title`, `description`, `status='triage'`).
2. `gh issue close <n> --comment "Tracked internally as <external_id>."`

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
