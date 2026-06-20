---
name: ticket-ops
description: Daily operations — database ticket triage, repository hygiene (stale worktrees/branches), GitHub PR merge-and-close workflow, and GitHub issue intake. Use for non-incident operational work.
---

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.

# ticket-ops

Day-to-day ticket management, repository hygiene, and PR lifecycle. For time-critical production incidents, use `incident-response` instead.

---

## Ticket model & GitHub linkage (read first)

The internal Postgres tracker — `tickets.tickets` on `mentolder` (`website` DB) — is the **single source of truth for issues**. This repo does **not** use GitHub Issues (`gh issue`); the website admin at `https://web.mentolder.de/admin/bugs` is the UI over the same table. If a GitHub issue ever does appear, treat it as intake (see GitHub Issue Intake): copy it into a `tickets.tickets` row, then close the GitHub issue referencing the new `external_id`.

GitHub **PRs are the CI/CD merge mechanism** and link back to a ticket by convention — there is **no `ticket_id` FK on PRs**. The link lives in three soft channels:
- the `[T000XXX]` tag in the PR/commit title and the `fix/tNNNN-…` / `feature/…` branch name,
- `tickets.ticket_plans.pr_number` (written when a plan is archived by `dev-flow-execute`),
- a closing row in `tickets.ticket_comments` (`PR #N merged …`).

Never use `tickets.ticket_links` for PR references — it is ticket→ticket only (`to_id` is `NOT NULL`, `kind ∈ blocks|blocked_by|duplicate_of|relates_to|fixes|fixed_by`).

**Enum reference** (closing a ticket with an out-of-set value fails the CHECK constraint):
`priority ∈ {hoch,mittel,niedrig}` · `severity ∈ {critical,major,minor,trivial}` · `status ∈ {triage,planning,plan_staged,backlog,in_progress,in_review,blocked,qa_review,done,archived}` · `resolution ∈ {fixed,shipped,obsolete}` · `attention_mode ∈ {auto,ai_ready,needs_human}` (default `auto`).

**DB-Zugriff — MCP-Postgres für Reads bevorzugen.** Ist `mcp-postgres` erreichbar
(`bash scripts/mcp-portforward.sh status`), führe **lesende** SELECTs über `mcp__mcp-postgres__query`
aus (nur `sql`, read-only). Die `psql()`-Bash-Hilfsfunktion unten ist (a) der **Fallback** für Reads
ohne aktiven Portforward und (b) der **Pflichtweg für schreibende** Statements (INSERT/UPDATE/DELETE) —
das MCP-Query-Tool ist read-only. Siehe [`MCP-Tool-Guide`](file:///home/patrick/Bachelorprojekt/.claude/skills/references/references.md#mcp-tool-guide).

All SQL below assumes:
```bash
PGPOD=$(kubectl get pod -n workspace --context fleet -l app=shared-db -o name | head -1)
psql() { kubectl exec "$PGPOD" -n workspace --context fleet -c postgres -- psql -U website -d website "$@"; }
```

> ⚠️ **Warning on tickets.ticket_plans**: When querying this table, never run `SELECT *` or retrieve the `content` column without filtering by a specific ticket/slug. The `content` column stores large plan markdown files, and querying the entire table will transfer megabytes over `kubectl exec`, causing connection timeouts. Always query metadata columns (e.g. `id`, `ticket_id`, `slug`, `branch`, `pr_number`, `archived_at`) or filter explicitly.

---

## Phase 1 — Database Ticket Management

Fetch, triage, and resolve open tickets in the tickets database on `mentolder`.

### Step 1.1: Fetch Open Tickets
```sql
SELECT external_id, title, status, priority, severity, type, attention_mode, created_at::date, description
FROM tickets.tickets
WHERE status NOT IN ('done', 'archived')
ORDER BY priority DESC NULLS LAST, created_at ASC;
```

### Step 1.1b: Load OpenSpec Status Map

After fetching tickets, enrich the triage view with OpenSpec proposal status. The map is pre-generated and committed in the repo:

```bash
OMAP_FILE="$REPO/website/src/data/openspec-status.json"
# Regenerate if the file is missing (e.g. freshly cloned worktree without freshness:regenerate)
if [[ ! -f "$OMAP_FILE" ]]; then
  bash "$REPO/scripts/openspec-status-map.sh"
fi

get_openspec_status() {
  local ext_id="$1"
  jq -r --arg id "$ext_id" '.[$id] // [] | map("\(.status):\(.slug)") | join(", ")' \
    "$OMAP_FILE" 2>/dev/null || echo ""
}
```

When displaying the triage table, append the OpenSpec status column. Example output format:

```
T000953 | Cockpit Fullscreen     | plan_staged | hoch    | READY (cockpit-fullscreen-overview)
T000959 | OpenSpec Status Badge  | plan_staged | mittel  | READY (openspec-ticket-status-display)
T000943 | Awaiting-Deploy Gaps   | planning    | mittel  | SPEC (fix-awaiting-deploy-visualization-gaps)
T000738 | Unbekanntes Feature    | backlog      | niedrig | —
```

Use `get_openspec_status "$ext_id"` per row and display `—` when the result is empty.

### Step 1.2: Categorization Flow
1. **Already Resolved:** Mark `done` + `fixed`, cite the PR in notes.
2. **Obsolete:** Mark `done` + `obsolete` (e.g. decommissioned services).
3. **AI-Fixable:** Set `attention_mode = 'ai_ready'`. Do **not** push fixes straight to `main` — hand the ticket to `dev-flow-plan` / `dev-flow-execute`, which opens a `fix/tNNNN-…` branch, PRs it, and closes the ticket on merge. Trivial one-liners may PR directly, but still merge via PR.
4. **Human Needed:** Set `attention_mode = 'needs_human'` and add a clear question/ask in the ticket notes.

*Note: Do not touch `in_progress` tickets referencing a live plan branch.*

---

## Phase 2 — Repository Hygiene & PR Triage

### Step 2.1: Stale Git Worktrees
List worktrees: `git worktree list`.
Verify if the branch is merged: `git log main..<branch> --oneline` (empty means fully merged).
Remove stale worktrees:
```bash
git worktree remove <path> --force
```

### Step 2.2: Stale Branches
Prune local and remote branches:
```bash
# Safe batch-delete merged local branches
git branch --merged main | grep -v 'main' | xargs git branch -d

# Prune gone remote-tracking branches
git fetch --prune
```

> **`--merged` misses squash-merged branches.** This repo merges via **squash-and-merge** (Dev Rule 3), which rewrites a branch's commits into one new commit on `main`. The original branch tip is therefore NOT an ancestor of `main`, so `git branch --merged` never lists it and `git branch -d` refuses to delete it. Reclaim these branches by detecting that their remote is **[gone]** (deleted by `gh pr merge --delete-branch`) and confirming the PR actually merged, then force-deleting:
> ```bash
> # After `git fetch --prune`, list local branches whose upstream is gone
> git for-each-ref --format='%(refname:short) %(upstream:track)' refs/heads \
>   | awk '$2 == "[gone]" {print $1}' \
>   | while read -r b; do
>       # Verify the PR for this branch is merged before destroying local work
>       merged=$(gh pr list --head "$b" --state merged --json number -q '.[0].number')
>       if [ -n "$merged" ]; then
>         git branch -D "$b"   # safe: PR #$merged merged, remote gone
>       else
>         echo "SKIP $b — upstream gone but no merged PR found; inspect manually"
>       fi
>     done
> ```
> Only `-D` (force) works here — `-d` will refuse because git does not see the squash-merged history.

### Step 2.3: GitHub PR Triage → close the linked ticket
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

### Step 2.4: GitHub Issue Intake (rare)
This repo tracks issues in Postgres, not GitHub. If `gh issue list --state open` returns anything, funnel it in rather than working it on GitHub:
1. Create a `tickets.tickets` row from the issue (`type`, `brand`, `title`, `description`, `status='triage'`).
2. `gh issue close <n> --comment "Tracked internally as <external_id>."`

---

## Post-Execution: Mishap Report

After completing all steps in this skill, invoke `mishap-tracker` with your accumulated `MISHAP_LOG`. If no mishaps were found, `mishap-tracker` exits cleanly.

## Related Skills

| Skill | Relationship |
|-------|--------------|
| `incident-response` | Time-critical incidents — different workflow |
| `mishap-tracker` | Converts execution mishaps to tickets |
| `dev-flow-execute` | Takes AI-fixable tickets to implementation |
| `fleet-ops` | Cross-brand issues |
| `database-ops` | DB-related tickets |
