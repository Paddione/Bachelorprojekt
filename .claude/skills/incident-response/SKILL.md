---
name: incident-response
description: Use when something is broken or degraded in production — guides through triage, ticket creation, root cause analysis, fix or rollback, verification, and post-mortem. Triggers on: "something is broken", "X is down", "users can't log in", "pod is crashing", 500 errors, health check failures.
---

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.

# incident-response

Structured production incident triage for the Bachelorprojekt platform.

---

## Phase 1: Scope the incident (< 2 min)

Answer these before doing anything else:

1. **Which service(s)?** (Keycloak, Nextcloud, website, brett, arena, vaultwarden, docs, livekit, shared-db…)
2. **Which cluster(s)?** mentolder / korczewski / both
3. **Since when?** (last known good deploy, git log, or user report)
4. **Blast radius?** All users / specific users / specific feature only

Ask the user if any of these are unknown.

---

## Phase 2: Create an incident ticket

```bash
PGPOD=$(kubectl get pod -n workspace --context mentolder \
  -l app=shared-db -o name | head -1)

TICKET_RESULT=$(kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -At -c \
  "INSERT INTO tickets.tickets (type, brand, title, description, status, severity, priority)
   VALUES (
     'bug', 'mentolder',
     'Incident: <one-line description>',
     'Affected: <services>\nCluster: <env>\nSince: <time>\nSymptoms: <what users see>',
     'in_progress',
     '<critical|major|minor>',
     'hoch'
   )
   RETURNING external_id, id;")

TICKET_EXT_ID=$(echo "$TICKET_RESULT" | cut -d'|' -f1)
TICKET_UUID=$(echo "$TICKET_RESULT"   | cut -d'|' -f2)
echo "Ticket $TICKET_EXT_ID → https://web.mentolder.de/admin/bugs"
```

Use severity `critical` if users cannot log in or data is at risk. Use `major` for degraded functionality. Use `minor` for cosmetic issues or single-user impact.

---

## Phase 3: Diagnose

### Pod status

```bash
task workspace:status ENV=mentolder
task workspace:status ENV=korczewski  # if both clusters affected
```

Look for: `CrashLoopBackOff`, `Error`, `Pending`, `OOMKilled`, low `READY` counts.

### Logs

```bash
task workspace:logs ENV=<env> -- <service>
# For website pod:
task workspace:logs ENV=<env> -- website
# For shared-db:
task workspace:logs ENV=<env> -- shared-db
```

Common error signatures:
| Log pattern | Likely cause |
|---|---|
| `password authentication failed` | DB password drift → use `secret-rotation` Type A |
| `ECONNREFUSED` / `connection refused` | Service dependency not running or wrong port |
| `certificate verify failed` | TLS cert expired or wrong issuer |
| `401 Unauthorized` from Keycloak | OIDC client secret rotated without service update |
| `OOMKilled` | Memory limit too low — check pod resource requests |
| `ImagePullBackOff` | Image not pushed to registry or wrong tag |
| `cannot connect to cluster` | Keycloak/DB not yet ready — wait and retry |

### Events

```bash
kubectl get events -n workspace --context <ctx> --sort-by='.lastTimestamp' | tail -30
```

### Recent deploys

```bash
git log --oneline -10
```

Did the incident start right after a deploy? If yes, a rollback may be faster than a fix.

---

## Phase 4: Decide — fix or rollback?

| Situation | Decision |
|---|---|
| Introduced by the last deploy, no DB migration | **Rollback** — faster, lower risk |
| Config drift or secret rotation issue | **Fix in place** — rollback won't help |
| DB schema change involved | **Fix only** — never roll back a migration |
| Unknown cause | **Diagnose further** before deciding |

### Rollback path

```bash
# Find the last good image digest from git log
PREV_SHA=$(git log --oneline -5 | awk 'NR==2{print $1}')

# For website: redeploy previous commit's image
# (CI builds images tagged with commit SHA — check ghcr.io)
kubectl set image deployment/website website=ghcr.io/paddione/workspace-website:<PREV_SHA> \
  -n <WORKSPACE_NS> --context <CTX>

# Verify
task workspace:status ENV=<env>
```

For full cluster rollback:
```bash
git checkout <PREV_SHA> -- k3d/ prod/ prod-mentolder/ prod-korczewski/
task workspace:deploy ENV=<env>
git checkout HEAD -- k3d/ prod/ prod-mentolder/ prod-korczewski/
```

### Fix path

Open a `fix/<slug>` branch via `dev-flow-plan` Fix-Pfad with the incident ticket ID. Implement, PR, merge, deploy.

---

## Phase 5: Verify resolution

```bash
# All pods healthy
task workspace:status ENV=<env>

# Health checks pass
task workspace:verify ENV=<env>

# SSO login works (manual browser test)
# open https://web.<domain>, log in, verify core flow

# No new errors in logs for 2 min
task workspace:logs ENV=<env> -- <affected-service>
```

---

## Phase 6: Close ticket + post-mortem note

```bash
PGPOD=$(kubectl get pod -n workspace --context mentolder \
  -l app=shared-db -o name | head -1)

kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -c \
  "UPDATE tickets.tickets
     SET status = 'done', resolution = 'fixed', done_at = now(),
         notes = COALESCE(notes || E'\n\n', '') ||
           '[incident-response $(date +%Y-%m-%d)] Root cause: <1 sentence>. Fix: <1 sentence>. Duration: <X> min.'
   WHERE external_id = '$TICKET_EXT_ID';"
```

Post-mortem note must answer:
1. **What broke** — the specific component and failure mode
2. **Why it broke** — root cause (config drift, bad deploy, secret mismatch, etc.)
3. **How it was fixed** — PR number or command run
4. **How to prevent it** — action item (skill gap, test, alert, etc.)

If a skill gap contributed to the incident, open a chore ticket to close it.

---

## Quick-reference: common service fixes

| Symptom | Quick fix |
|---|---|
| Keycloak not starting | `task workspace:restart ENV=<env> -- keycloak` |
| DB not accepting connections | `task workspace:db:start ENV=<env>` |
| Website 503 | Check website pod + ingress: `kubectl get ingress -n website-ns --context <ctx>` |
| Nextcloud 500 | Check Nextcloud + shared-db connectivity |
| Talk not connecting | Check HPB + Janus + coturn (`task workspace:logs ENV=<env> -- talk-hpb`) |
| LiveKit ICE failure | Check DNS pin + ufw rules: `task livekit:dns-pin ENV=<env>` — use `livekit-setup` skill |
| Secret-related 401/403 | Use `secret-rotation` skill |
| Keycloak realm drift | Use `keycloak-realm-sync` skill |

---

## Post-Execution: Mishap Report

After completing all steps in this skill, invoke `mishap-tracker` with your
accumulated `MISHAP_LOG`. If no mishaps were found, `mishap-tracker` exits
cleanly with "No mishaps found."
