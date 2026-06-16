---
name: mishap-tracker
description: Shared utility — batches all execution mishaps into a single aggregate ticket. Reuses an existing open "Mishap collection" ticket if one exists; creates a new one otherwise. Each mishap is individually classified within the aggregate.
---

# mishap-tracker

Batches all execution mishaps into **one aggregate ticket** rather than creating N individual tickets. If an open "Mishap collection" ticket already exists, new mishaps are appended to it. Otherwise a new collection is created.

Called as the final step of runbook skills that maintain a `MISHAP_LOG`.

---

## Input

The calling skill accumulates a `MISHAP_LOG` — a list of entries, each with:
- `type`: `broken` | `degraded` | `suspicious` | `security` | `drift` | `process`
- `title`: Short, actionable summary
- `description`: What was observed and why it matters
- `component`: Affected subsystem (e.g., `kubeconfig`, `repo/chore/…`, `skills/<name>`)

Calling skill **must** export `SKILL_NAME` (e.g. `SKILL_NAME=operations-management`) for batch labeling.

If the log is empty or no mishaps were found, report that and stop — nothing to track.

---

## Step 0: Verify Before Creating (False-Positive Guard)

Before including any mishap, verify the claim with a concrete check:

| Mishap type | Required verification |
|---|---|
| `broken` (import cycle) | `grep -r 'import.*<file>' <target>` to confirm the cycle actually exists |
| `broken` (file missing/stale) | `ls` or `git show HEAD:<file>` to confirm the file is actually absent or stale |
| `drift` (version mismatch) | Check current value via kubectl/grep before asserting drift |
| `suspicious` (unexpected state) | Run the command that would reveal the state and confirm it |
| `process` | These are observations, not assertions — no verification needed |
| `security` | These are always created without suppression |

**If verification contradicts the observation:** drop the mishap entry and log `[mishap-tracker] SKIP <title> — verified false positive: <reason>`.

**If verification is not feasible in context** (e.g. no cluster access): include the mishap but add `[UNVERIFIED — <reason>]` to its description.

---

## Step 1: Individual Mishap Classification

Each mishap type maps to its own triage values — these are used in the per-mishap listing within the aggregate:

| Mishap type | maps-to type | Severity | Priority | Attention mode |
|---|---|---|---|---|
| `broken` | `bug` | `major` | `hoch` | `needs_human` |
| `security` | `bug` | `critical` | `hoch` | `needs_human` |
| `degraded` | `bug` | `minor` | `mittel` | `needs_human` |
| `suspicious` | `task` | `minor` | `mittel` | `ai_ready` |
| `drift` | `task` | `trivial` | `niedrig` | `ai_ready` |
| `process` | `task` | `trivial` | `niedrig` | `ai_ready` |

For `process` mishaps, always set `component = 'skills/<skill-name>'`.

### Aggregate Ticket Triage

The **ticket-level** triage is computed across all mishaps in the ticket:

| Field | Rule |
|---|---|
| `type` | `bug` if any mishap maps to `bug`; else `task` |
| `severity` | worst across all: `critical > major > minor > trivial` |
| `priority` | worst across all: `hoch > mittel > niedrig` |
| `attention_mode` | `needs_human` if any mishap maps to `needs_human`; else `ai_ready` |

---

## Step 2: Find or Create Aggregate Ticket

### 2a. Set up DB access

```bash
PGPOD=$(kubectl get pod -n workspace --context fleet -l app=shared-db -o name | head -1)
PSQL="kubectl exec $PGPOD -n workspace --context fleet -c postgres -- psql -U website -d website"
```

### 2b. Look for existing open mishap collection

```bash
EXISTING=$($PSQL -At -c \
  "SELECT external_id, severity, priority, attention_mode::text
   FROM tickets.tickets
   WHERE status NOT IN ('done', 'archived')
     AND title LIKE 'Mishap collection:%'
   ORDER BY created_at DESC LIMIT 1;")

if [ -n "$EXISTING" ]; then
  COLLECT_ID=$(echo "$EXISTING" | cut -d'|' -f1)
  COLLECT_SEV=$(echo "$EXISTING" | cut -d'|' -f2)
  COLLECT_PRIO=$(echo "$EXISTING" | cut -d'|' -f3)
  COLLECT_ATTN=$(echo "$EXISTING" | cut -d'|' -f4)
else
  COLLECT_ID=""
fi
```

---

## Step 3: Append to Aggregate Ticket

### 3a. Build the batch block

Format all mishaps of this execution into a single markdown block:

```
--- ${SKILL_NAME} — $(date +%Y-%m-%d\ %H:%M) ---

| # | Type | Severity | Priority | Attention | Component |
|---|---|---|---|---|---|
| 1 | broken | major | hoch | needs_human | <component> |
| 2 | drift | trivial | niedrig | ai_ready | <component> |

<details>
<summary>Descriptions</summary>

**1. [broken] <title>**
<description> [UNVERIFIED — <reason>]

**2. [drift] <title>**
<description>
</details>
```

Also compute the aggregate triage across **all current mishaps** (the new batch only, if appending):
- `BATCH_TYPE`: `bug` if any mishap is `broken`/`security`/`degraded`; else `task`
- `BATCH_SEV`: worst severity in the batch
- `BATCH_PRIO`: worst priority in the batch
- `BATCH_ATTN`: `needs_human` if any; else `ai_ready`

### 3b. Insert or append

**New ticket** (no existing collection):

```bash
TITLE="Mishap collection: $(date +%Y-%m-%d)"
NEW_ID=$($PSQL -At -c \
  "INSERT INTO tickets.tickets (type, brand, title, description, severity, priority, attention_mode, status, component)
   VALUES ('$BATCH_TYPE', 'mentolder', '$TITLE', '$(echo "$BATCH_BLOCK" | sed "s/'/''/g")', '$BATCH_SEV', '$BATCH_PRIO', '$BATCH_ATTN', 'triage', 'mishap-tracker')
   RETURNING external_id;")
echo "Created mishap collection ticket: $NEW_ID"
```

**Existing ticket** (append) — update description & triage, add a comment:

```bash
# Compute combined triage (worst of existing + new batch)
COMBINED_SEV=$($PSQL -At -c \
  "SELECT CASE
    WHEN severity = 'critical' OR '$BATCH_SEV' = 'critical' THEN 'critical'
    WHEN severity = 'major'    OR '$BATCH_SEV' = 'major'    THEN 'major'
    WHEN severity = 'minor'    OR '$BATCH_SEV' = 'minor'    THEN 'minor'
    ELSE 'trivial'
  END FROM tickets.tickets WHERE external_id = '$COLLECT_ID';")

COMBINED_PRIO=$($PSQL -At -c \
  "SELECT CASE
    WHEN priority = 'hoch'   OR '$BATCH_PRIO' = 'hoch'   THEN 'hoch'
    WHEN priority = 'mittel' OR '$BATCH_PRIO' = 'mittel' THEN 'mittel'
    ELSE 'niedrig'
  END FROM tickets.tickets WHERE external_id = '$COLLECT_ID';")

COMBINED_ATTN=$($PSQL -At -c \
  "SELECT CASE
    WHEN attention_mode::text = 'needs_human' OR '$BATCH_ATTN' = 'needs_human' THEN 'needs_human'
    ELSE 'ai_ready'
  END FROM tickets.tickets WHERE external_id = '$COLLECT_ID';")

$PSQL -At -c \
  "UPDATE tickets.tickets
   SET description = description || E'\n\n' || '$(echo "$BATCH_BLOCK" | sed "s/'/''/g")',
       severity = '$COMBINED_SEV',
       priority = '$COMBINED_PRIO',
       attention_mode = '$COMBINED_ATTN',
       type = CASE WHEN '$BATCH_TYPE' = 'bug' OR type = 'bug' THEN 'bug' ELSE 'task' END
   WHERE external_id = '$COLLECT_ID';

   INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
   SELECT id, 'mishap-tracker', 'Appended ${MISHAP_COUNT} mishaps from ${SKILL_NAME}.', 'internal'
   FROM tickets.tickets WHERE external_id = '$COLLECT_ID';"

echo "Appended $MISHAP_COUNT mishaps to $COLLECT_ID"
```

### 3c. Auto-categorize (new tickets only)

If a new ticket was created, run auto-categorization:

```bash
bash scripts/mishap-categorize.sh "$NEW_ID" "Mishap collection" "$BATCH_BLOCK"
```

For existing tickets, categorization already ran — skip.

---

## Step 4: Fallback — Manual Creation

If the database is unreachable (no pod, wrong context, connection refused), output a single formatted block for manual entry at `https://web.mentolder.de/admin/bugs`:

```
--- Mishap collection ($(date +%Y-%m-%d)) ---

Aggregate triage: type=<aggregate_type> severity=<aggregate_severity> priority=<aggregate_priority> attention=<aggregate_attention>

Entries:
  [<type>] <title>
  Severity: <severity> | Priority: <priority> | Attention: <attention_mode> | Component: <component>
  <description>

  [<type>] <title>
  ...
```

---

## Step 5: Summary

Report:
- Whether a new ticket was created or mishaps were appended to an existing one
- The external_id of the collection ticket
- Total mishap count in this batch
- If fallback was used, note that tickets need manual creation

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `operations-management` | Auftraggeber — erstellt Tickets aus Mishaps |
| Alle Runbooks | Nutzer — jedes Skill schließt mit Mishap-Report ab |
