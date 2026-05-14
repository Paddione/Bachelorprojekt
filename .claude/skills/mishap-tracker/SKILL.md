---
name: mishap-tracker
description: Invoked at the end of any local skill execution to convert MISHAP_LOG entries into tickets in the mentolder postgres database. Never invoke directly — always called from another skill's Post-Execution section.
---

# mishap-tracker

Convert the calling skill's `MISHAP_LOG` into `tickets.tickets` records on the mentolder cluster.

## Step 1: Check MISHAP_LOG

If `MISHAP_LOG` is empty or has no entries → print "No mishaps found." and stop. Do not make any DB call.

## Step 2: Severity mapping

Map each entry's `type` to DB fields before inserting:

| type | tickets.type | tickets.severity |
|---|---|---|
| broken | bug | major |
| security | bug | critical |
| degraded | bug | minor |
| suspicious | task | minor |
| drift | task | trivial |

If an entry has no `component`, use `skill-execution` as the value.

## Step 3: Insert tickets

For each entry in `MISHAP_LOG`, run the following — substituting the mapped values:

```bash
PGPOD=$(kubectl get pod -n workspace --context mentolder \
  -l app=shared-db -o name | head -1)

TICKET_EXT=$(kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -At -c \
  "INSERT INTO tickets.tickets (type, brand, title, description, severity, status, component)
   VALUES (
     '<tickets.type>',
     'mentolder',
     '<title>',
     '<description>',
     '<tickets.severity>',
     'triage',
     '<component>'
   )
   RETURNING external_id;")
```

Collect each returned `external_id` for the summary.

## Step 4: Print summary

After all inserts, print:

```
Mishap report — N ticket(s) created:
  T000312 [broken/major]      shared-db: no backup found in last 24h
  T000313 [security/critical] keycloak: realm export missing MFA policy
  T000314 [drift/trivial]     livekit: DNS pin node differs from nodeAffinity
→ https://web.mentolder.de/admin/bugs
```

## Step 5: DB unreachable fallback

If `kubectl get pod` returns empty, or `psql` exits non-zero:

1. Print all `MISHAP_LOG` entries formatted:

```
⚠️  DB unreachable — mishaps NOT ticketed. Create manually:

  [broken/major]      shared-db: no backup found in last 24h
    shared-db pod did not respond to pg_dump trigger at 03:30 UTC.
    component: backup

  [security/critical] keycloak: realm export missing MFA policy
    realm-workspace-mentolder.json has no browserSecurityHeaders.contentSecurityPolicy.
    component: keycloak
```

2. Print: "→ Create tickets manually at https://web.mentolder.de/admin/bugs"
3. Exit cleanly — do NOT propagate an error to the parent skill.
