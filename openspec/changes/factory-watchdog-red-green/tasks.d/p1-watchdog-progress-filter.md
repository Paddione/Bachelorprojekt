# p1: Watchdog Progress Filter

## Target Files
- `scripts/factory/watchdog.sh`
- `openspec/specs/software-factory.md`

## Role
implement

## Description
Fix the watchdog's attempt counter to only consider phase events with `state IN ('done', 'partial-done', 'blocked')` as progress. `entered` events without a matching completion event should NOT reset the counter.

## Steps

### Step 1: Fix watchdog.sh `prog` CTE

In `scripts/factory/watchdog.sh`, locate the attempt counter UPSERT (around line 135-137). Modify the `prog` CTE to filter by state:

**IST (line 137-139):**
```sql
), prog AS (
  SELECT max(pe.at) AS last_at
  FROM tickets.factory_phase_events pe JOIN tgt ON pe.ticket_id = tgt.id
```

**SOLL:**
```sql
), prog AS (
  SELECT max(pe.at) AS last_at
  FROM tickets.factory_phase_events pe JOIN tgt ON pe.ticket_id = tgt.id
  WHERE pe.state IN ('done', 'partial-done', 'blocked')
```

### Step 2: Update the spec

In `openspec/specs/software-factory.md`, locate the requirement text at approximately line 202-204 that reads:
"existiert ein `tickets.factory_phase_events`-Eintrag, dessen `at` neuer ist als das `updated_at` des Zählers, SHALL der Zähler auf `1` zurückgesetzt werden"

Change to:
"existiert ein `tickets.factory_phase_events`-Eintrag mit `state IN ('done', 'partial-done', 'blocked')`, dessen `at` neuer ist als das `updated_at` des Zählers, SHALL der Zähler auf `1` zurückgesetzt werden"

### Verification

```bash
# The failing test (p2) should now pass
task test:changed
```
