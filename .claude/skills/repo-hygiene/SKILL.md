---
name: repo-hygiene
description: Use for repository housekeeping — clean up stale branches/worktrees, triage and merge open PRs, close resolved tickets, manage GitHub issue intake, and check software factory queue status. Triggers — "clean branches", "merge PRs", "prune worktrees", "factory queue status".
---

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.

# repo-hygiene

Day-to-day repository hygiene, PR merging, issue intake, and Software Factory queue management.

---

## DB Setup (read first)

The internal Postgres tracker — `tickets.tickets` on `mentolder` (`website` DB) — is the **single source of truth for issues**.

**DB-Zugriff — MCP-Postgres für Reads bevorzugen.** Das `mcp-postgres` MCP-Tool (`mcp__mcp-postgres__query`)
ist read-only und direkt verfügbar, wenn der MCP-Server läuft (einfach mit `SELECT 1` testen).
Die `psql()`-Bash-Hilfsfunktion unten ist der **Fallback** für Reads bei fehlendem MCP-Zugriff
und der **Pflichtweg für schreibende** Statements (INSERT/UPDATE/DELETE) — das MCP-Query-Tool ist
read-only. Siehe [`MCP-Tool-Guide`](file:///home/patrick/Bachelorprojekt/.claude/skills/references/mcp-tool-guide.md).

All SQL below assumes:
```bash
PGPOD=$(kubectl get pod -n workspace --context fleet -l app=shared-db -o name | head -1)
psql() { kubectl exec "$PGPOD" -n workspace --context fleet -c postgres -- psql -U website -d website "$@"; }
```

---

## Step 1: Stale Git Worktrees
List worktrees: `git worktree list`.
Verify if the branch is merged: `git log main..<branch> --oneline` (empty means fully merged).
Remove stale worktrees:
```bash
git worktree remove <path> --force
```

## Step 2: Stale Branches
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

## Step 3: GitHub PR Triage → close the linked ticket
List open PRs:
```bash
gh pr list --state open --json number,title,headRefName,statusCheckRollup,reviewDecision,isDraft,mergeStateStatus
```

For each PR, first recover the ticket it resolves (soft link). Title tag wins; branch name is the fallback:
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

* **Close the ticket once `mergedAt` is set** (only if `$TICKET_ID` was found; `resolution`: `fixed` for `fix/*`, `shipped` for `feature/*`) — **MCP-first** (`ticket-mcp` lifecycle; the wrappers write via `ticket.sh`, not via the read-only `mcp-postgres`):
  > `mcp__ticket-mcp__transition_status({ id: "$TICKET_ID", status: "done", resolution: "<fixed|shipped>" })`
  > `mcp__ticket-mcp__add_comment({ id: "$TICKET_ID", body: "PR #<number> merged." })`

  Fallback (ticket-mcp nicht erreichbar — direkte Writes über `psql`):
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

## Step 4: GitHub Issue Intake (rare)
This repo tracks issues in Postgres, not GitHub. If `gh issue list --state open` returns anything, funnel it in rather than working it on GitHub:
1. **Title-dedupe guard [T001210].** Before creating a new row, run a lookup for an open ticket with the same (case-insensitive, whitespace-normalised) title. If one exists — e.g. canonical reference T001147 "E2E notification test — Playwright FA-bug-notify", mishap bundle T001148 — do not create a duplicate. Append a `ticket_comments` row to the existing ticket noting the re-trigger source, then `gh issue close <n> --comment "Duplicate of <external_id>."`. The 4 duplicates T001196/T001197/T001201/T001202 were created 2026-06-27 against T001147 precisely because this dedupe guard was missing.
2. Create a `tickets.tickets` row from the issue (`type`, `brand`, `title`, `description`, `status='triage'`).
3. `gh issue close <n> --comment "Tracked internally as <external_id>."`

---

## Software-Factory-Queue (MCP-first)

Für Factory-Queue-Status und manuelles Anstoßen die `factory-mcp`-Tools bevorzugen (HTTP-Daemon auf `127.0.0.1:13003`). **Verfügbarkeits-Guard zuerst:** `curl -sf --max-time 2 http://127.0.0.1:13003/health` — bei Erfolg MCP, sonst Skript-Fallback.

**MCP-first** (`factory-mcp`):

> `mcp__factory-mcp__factory_status()` — Queue-Tiefe + ob gerade ein Tick läuft
> `mcp__factory-mcp__factory_queue()` — wartende Tickets (backlog + plan_staged)
> `mcp__factory-mcp__factory_trigger()` — sofortigen Factory-Tick auslösen
> `mcp__factory-mcp__factory_enqueue({ ticket_id: "T000XXX" })` · `mcp__factory-mcp__factory_recent({ limit: 10 })`

Fallback (Daemon `:13003` nicht erreichbar):
- Status/Queue → `mcp__mcp-postgres__query` bzw. `psql` SELECT auf `tickets.tickets WHERE status IN ('backlog','plan_staged')`.
- Tick auslösen → `bash scripts/factory/wakeup.sh`.

---

## Post-Execution: Mishap Report

After completing all steps in this skill, invoke `mishap-tracker` with your accumulated `MISHAP_LOG`. If no mishaps were found, `mishap-tracker` exits cleanly.

## Related Skills

| Skill | Relationship |
|-------|--------------|
| `operations-management` | Routing hub that dispatches repository housekeeping |
| `ticket-ops` | Handles completeness triage and human clarification |
| `mishap-tracker` | Converts execution mishaps to tickets |
