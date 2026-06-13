---
name: mishap-tracker
description: Shared utility — converts an accumulated MISHAP_LOG from another skill's execution into tickets.tickets rows. Invoked automatically at the end of operations-management, secret-rotation, and other runbook skills. If no mishaps were found, exits cleanly.
---

# mishap-tracker

Converts execution mishaps into internal tickets. Called as the final step of runbook skills that maintain a `MISHAP_LOG`.

---

## Input

The calling skill accumulates a `MISHAP_LOG` — a list of entries, each with:
- `type`: `broken` | `degraded` | `suspicious` | `security` | `drift` | `process`
- `title`: Short, actionable summary
- `description`: What was observed and why it matters
- `component`: Affected subsystem (e.g., `kubeconfig`, `repo/chore/…`, `skills/<name>`)

If the log is empty or no mishaps were found, report that and stop — nothing to track.

---

## Step 0: Verify Before Creating (False-Positive Guard)

Before inserting any ticket, verify the claim with a concrete check. Each mishap type has a minimum verification:

| Mishap type | Required verification |
|---|---|
| `broken` (import cycle) | `grep -r 'import.*<file>' <target>` to confirm the cycle actually exists |
| `broken` (file missing/stale) | `ls` or `git show HEAD:<file>` to confirm the file is actually absent or stale |
| `drift` (version mismatch) | Check current value via kubectl/grep before asserting drift |
| `suspicious` (unexpected state) | Run the command that would reveal the state and confirm it |
| `process` | These are observations, not assertions — no verification needed |
| `security` | These are always created without suppression |

**If verification contradicts the observation:** drop the mishap entry and log `[mishap-tracker] SKIP <title> — verified false positive: <reason>` instead of creating a ticket.

**If verification is not feasible in context** (e.g. no cluster access): create the ticket but add `[UNVERIFIED — <reason>]` to the description so the assignee knows to verify first.

---

## Step 1: Severity Mapping

| Mishap type | Ticket type | Ticket severity |
|---|---|---|
| `broken` | `bug` | `major` |
| `security` | `bug` | `critical` |
| `degraded` | `bug` | `minor` |
| `suspicious` | `task` | `minor` |
| `drift` | `task` | `trivial` |
| `process` | `task` | `trivial` |

For `process` mishaps, set `component = 'skills/<skill-name>'` and `attention_mode = 'ai_ready'`.

---

## Step 2: Insert Tickets

For each entry, attempt to insert into the Postgres tracker on mentolder:

```bash
PGPOD=$(kubectl get pod -n workspace --context fleet -l app=shared-db -o name | head -1)
kubectl exec "$PGPOD" -n workspace --context fleet -c postgres -- psql -U website -d website -At -c \
  "INSERT INTO tickets.tickets (type, brand, title, description, severity, status, component${ATTN:+, attention_mode})
   VALUES ('<ticket_type>', 'mentolder', '<title>', '<description>', '<severity>', 'triage', '<component>'${ATTN:+, '$ATTN'})
   RETURNING external_id;"
```

- Escape single quotes in title/description with `''`.
- If the DB is unreachable (no pod, wrong context, connection refused), fall through to Step 3.

---

## Step 3: Fallback — Manual Creation

If the database is unreachable, output each ticket as a formatted block for manual entry at `https://web.mentolder.de/admin/bugs`:

```
  [<type>] <title>
  Severity: <severity> | Component: <component>
  <description>
```

---

## Step 4: Summary

Report the count of tickets created (or output for manual creation). If the log was empty, note that no mishaps were found.

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `operations-management` | Auftraggeber — erstellt Tickets aus Mishaps |
| Alle Runbooks | Nutzer — jedes Skill schließt mit Mishap-Report ab |
