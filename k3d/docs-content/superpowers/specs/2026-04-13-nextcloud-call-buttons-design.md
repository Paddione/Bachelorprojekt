# Nextcloud Call Buttons in Mattermost

**Date:** 2026-04-13
**Status:** Approved
**Clusters:** dev (k3d), korczewski, mentolder

## Goal

Add a `/call` slash command to Mattermost on all three clusters. When invoked, it creates a fresh Nextcloud Talk public room and posts an interactive message with a "Join Call" button. Each invocation produces a new room; there are no persistent per-channel rooms.

## Architecture

```
User: /call   (in any Mattermost channel)
  → Mattermost POSTs to billing-bot /slash
  → billing-bot calls Nextcloud Talk API: POST /ocs/v2.php/apps/spreed/api/v4/room
  → gets back a room token
  → constructs call URL: https://files.<domain>/apps/spreed/call/<token>
  → posts interactive message with "Join Call" button (direct URL, no callback)
```

No new microservice is needed. The billing-bot already handles `/slash` and `/actions` and runs on every cluster.

## Components

### 1. billing-bot extension (`billing-bot/main.go`)

New config vars (all injected via env):
- `NEXTCLOUD_URL` — internal cluster URL: `http://nextcloud.workspace.svc.cluster.local:80`
- `NEXTCLOUD_ADMIN_USER` — Nextcloud admin username (default: `admin`)
- `NEXTCLOUD_ADMIN_PASSWORD` — from `workspace-secrets` key `NEXTCLOUD_ADMIN_PASSWORD`
- `NC_DOMAIN` — from `domain-config` ConfigMap (already exists, key `NC_DOMAIN`)
- `SCHEME` — `http` for dev, `https` for prod (default: `https`)

New slash command handler in `handleSlash`:
- Detect `command == "/call"`
- Call `POST http://nextcloud.workspace.svc.cluster.local/ocs/v2.php/apps/spreed/api/v4/room` with Basic auth and body `{"roomType": 3, "roomName": "#<channel> Call"}`
- Parse response JSON for `.ocs.data.token`
- Construct external call URL: `<SCHEME>://<NC_DOMAIN>/apps/spreed/call/<token>`
- Return Mattermost `application/json` response with an interactive attachment containing a single "Join Call" URL button

Response message format (posted to channel, not ephemeral):
```
📹 **#<channel> Call** gestartet

[ Join Call ]   ← url: https://files.<domain>/apps/spreed/call/<token>
```

The "Join Call" button is a Mattermost `url` action — clicking it opens the URL directly, no server callback required.

### 2. Kubernetes manifest patch (`k3d/billing-bot.yaml`)

Add env vars to the billing-bot container:
```yaml
- name: NEXTCLOUD_URL
  value: "http://nextcloud.workspace.svc.cluster.local:80"
- name: NEXTCLOUD_ADMIN_USER
  value: "admin"
- name: NEXTCLOUD_ADMIN_PASSWORD
  valueFrom:
    secretKeyRef:
      name: workspace-secrets
      key: NEXTCLOUD_ADMIN_PASSWORD
- name: NC_DOMAIN
  valueFrom:
    configMapKeyRef:
      name: domain-config
      key: NC_DOMAIN
- name: SCHEME
  value: "http"   # prod overlay patches this to "https"
```

The prod overlay (`prod/`) patches `SCHEME` to `https`.

### 3. `scripts/call-setup.sh`

Registers `/call` slash command in every Mattermost team. Follows the same pattern as `meeting-slash-setup.sh`:
- Auto-generates and revokes a temporary mmctl token
- Iterates over all teams via `mm_api GET /teams`
- Creates or updates the `/call` command pointing to `http://billing-bot:8090/slash`
- ENV-aware: reads `MM_URL`, `NAMESPACE` from environment (sourced via `env-resolve.sh`)

### 4. Taskfile tasks

```yaml
workspace:call-setup:
  desc: Register /call slash command in Mattermost (ENV=dev|mentolder|korczewski)
  vars:
    ENV: '{{.ENV | default "dev"}}'
  cmds:
    - |
      source scripts/env-resolve.sh "{{.ENV}}"
      [ "{{.ENV}}" != "dev" ] && export KUBE_CONTEXT="${ENV_CONTEXT}"
      bash scripts/call-setup.sh

workspace:call-setup:all-prods:
  desc: Register /call in both production clusters (mentolder + korczewski)
  cmds:
    - task: workspace:call-setup
      vars: { ENV: "mentolder" }
    - task: workspace:call-setup
      vars: { ENV: "korczewski" }
```

Also add `workspace:call-setup` to the `workspace:up` task chain (after `workspace:connectors`).

## Secrets

No new secrets are required. `NEXTCLOUD_ADMIN_PASSWORD` already exists in `workspace-secrets` on all clusters. The production environments have this key sealed in `environments/sealed-secrets/`.

The `NC_DOMAIN` comes from `domain-config` ConfigMap, which is already correct per cluster.

## Prod overlay

Extend the existing `prod/patch-billing-bot.yaml` to add a `SCHEME: "https"` env var override for production clusters.

## Error handling

- If the Nextcloud Talk API call fails (non-200), billing-bot returns an ephemeral error message to the invoking user: `"Fehler: Nextcloud Talk-Raum konnte nicht erstellt werden. Bitte versuche es erneut."`
- If `NEXTCLOUD_ADMIN_PASSWORD` is empty at startup, billing-bot logs a warning but does not crash (the `/billing` command still works).

## Testing

- Run `./tests/runner.sh local FA-03` (Nextcloud reachable) to confirm Nextcloud Talk API is accessible from the billing-bot pod
- Manual: `task workspace:call-setup`, then type `/call` in any Mattermost channel on dev cluster

## Rollout order

1. Add env vars to `k3d/billing-bot.yaml` + prod overlay patch
2. Extend `billing-bot/main.go` with the `/call` handler
3. Add `scripts/call-setup.sh`
4. Add Taskfile tasks
5. Deploy to dev: `task workspace:deploy && task workspace:call-setup`
6. Deploy to prod: `task workspace:call-setup:all-prods`
