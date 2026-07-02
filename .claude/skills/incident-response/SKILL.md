---
name: incident-response
description: Production incident triage, scope, diagnose, fix/rollback, and post-mortem close for the workspace platform. Time-critical — use when a core service is down or degraded.
agent: bachelorprojekt-ops
---

> **Mishap Tracking:** Führe während dieses Skills ein `MISHAP_LOG` und rufe am Ende
> `mishap-tracker` auf — Eintragsformat und Ablauf: siehe `mishap-tracker` §Input.

# incident-response

Production incident triage and recovery. Use when a core platform service is down or degraded. For ongoing ticket triage, repo hygiene, or PR management, see `ticket-ops`.

---

## Ticket model (shared preamble)

Internal tickets live in `tickets.tickets` on the `mentolder` (`website` DB). Enum reference:

`priority ∈ {hoch,mittel,niedrig}` · `severity ∈ {critical,major,minor,trivial}` · `status ∈ {triage,planning,plan_staged,backlog,in_progress,in_review,blocked,qa_review,done,archived}` · `resolution ∈ {fixed,shipped,obsolete}`

**DB-Zugriff:** Reads MCP-first via `mcp__mcp-postgres__query`; der `psql()`-Fallback-Helper
(zugleich Pflichtweg für Writes wie das `INSERT` in Schritt 2) ist SSOT im
[`MCP-Tool-Guide`](file:///home/patrick/Bachelorprojekt/.claude/skills/references/mcp-tool-guide.md) §mcp-postgres —
die `psql -c`-Aufrufe unten setzen diesen Helper voraus.

---

## Step 1 — Scope the Incident (< 2 min)

Determine:
1. **Affected Service:** Keycloak, Nextcloud, Website, Brett, Arena, Vaultwarden, Docs, LiveKit, or Shared-DB.
2. **Target Cluster:** `mentolder` brand (fleet cluster), `korczewski` brand (fleet cluster), or both.
3. **Onset Time:** Since when has it been failing? Check git log or deployment status.
4. **Blast Radius:** All users or a subset of features?

## Step 2 — Open an Incident Ticket

```bash
# psql()-Helper aus dem MCP-Tool-Guide §mcp-postgres (siehe Preamble)
psql -At -c \
  "INSERT INTO tickets.tickets (type, brand, title, description, status, severity, priority)
   VALUES ('bug', 'mentolder', 'Incident: <desc>', 'Affected: <svc>\nCluster: <env>\nSymptoms: <symptoms>', 'in_progress', '<critical|major|minor>', 'hoch')
   RETURNING external_id;"
```

## Step 3 — Diagnose

Cluster-Status-Reads — **MCP-first** (`mcp-kubernetes`, read-only):

> Pod-Status: `mcp__mcp-kubernetes__pods_list_in_namespace({ namespace: "workspace" })` — CrashLoopBackOff, OOMKilled, Pending erkennen.
> Logs: `mcp__mcp-kubernetes__pods_log({ namespace: "workspace", name: "<pod>" })`
> Einzelnes Pod-Detail: `mcp__mcp-kubernetes__pods_get({ namespace: "workspace", name: "<pod>" })`

Fallback (mcp-kubernetes nicht erreichbar — Verfügbarkeits-Guard siehe [`MCP-Tool-Guide`](file:///home/patrick/Bachelorprojekt/.claude/skills/references/mcp-tool-guide.md)):

* **Pod status:** `task workspace:status ENV=mentolder` (CrashLoopBackOff, OOMKilled, Pending).
* **Logs:** `task workspace:logs ENV=<env> -- <service>`.

**Recent Deploys** (kein Cluster-Read): `git log --oneline -10`.

## Step 4 — Fix or Rollback

* **Rollback** (no schema migration introduced): `kubectl set image deployment/<svc> <container>=ghcr.io/paddione/workspace-<svc>:<PREV_SHA> -n <ns> --context <ctx>`
* **Fix:** Open a `fix/<slug>` branch, implement, PR, merge, verify.

## Step 5 — Close & Write Post-Mortem

Capture the fix PR number (`PR_NUM=$(gh pr view <branch-or-num> --json number -q '.number')`); for rollback-only, omit the comment.

```bash
psql -c \
  "UPDATE tickets.tickets SET status = 'done', resolution = 'fixed', done_at = now(), notes = COALESCE(notes || E'\n\n', '') || '[incident-response $(date +%Y-%m-%d)] Root cause: <cause>. Fix: <fix>. Duration: <X> min.' WHERE external_id = '<TICKET_EXT_ID>';

   INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
   SELECT id, 'claude-code', 'Resolved by PR #<PR_NUM> (or rollback to <PREV_SHA>).', 'internal'
   FROM tickets.tickets WHERE external_id = '<TICKET_EXT_ID>';"
```

---

## Post-Execution: Mishap Report

Invoke `mishap-tracker` with your accumulated `MISHAP_LOG`.

## Related Skills

| Skill | Relationship |
|-------|--------------|
| `ticket-ops` | Follow-up: PR management, ticket triage for human-fixable items |
| `mishap-tracker` | Converts execution mishaps to tickets |
| `cluster-deployment` | Cross-brand incident handling (Phase 5) |
