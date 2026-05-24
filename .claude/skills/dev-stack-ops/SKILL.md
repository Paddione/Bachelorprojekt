---
name: dev-stack-ops
description: Use when bringing up, repairing, or operating the dev.mentolder.de stack — including SSH to k3s-1, task dev:* commands, dev DB refresh, tunnel publishing, and Keycloak /dev-access group issues.
---

# dev-stack-ops — dev.mentolder.de Stack Operations

## Overview

The dev stack is a k3d cluster running **on k3s-1** (a home LAN node), not on the machine running Claude Code. All `task dev:*` commands SSH to that node or assume kubectl is pointing at `k3d-mentolder-dev`. Dev sees prod data (refreshed nightly at 03:30 UTC from latest prod snapshot).

**Critical constraint:** `task dev:cluster:create` **must run from k3s-1** — running it elsewhere fails because Docker isn't available locally.

---

## Bring-Up Order

```bash
# 1. Check if cluster already exists
task dev:cluster:status

# 2. If not: SSH to k3s-1 and create (done via Taskfile SSH wrapper)
task dev:cluster:create

# 3. Deploy full stack (website + brett + workspace manifests)
task dev:deploy

# 4. Open firewall for your CIDR (reads DEV_SSH_ALLOWLIST from environments/mentolder.yaml)
task dev:firewall:open
```

---

## Common Day-2 Commands

```bash
task dev:cluster:status          # Pod status in workspace-dev
task dev:redeploy:website        # Rebuild + roll website only
task dev:redeploy:brett          # Rebuild + roll brett only
task dev:db:refresh              # One-shot restore latest prod snapshot → shared-db-dev
task dev:logs -- <svc>           # Tail dev pod logs
task dev:psql                    # psql into shared-db-dev
task dev:tunnel -- <name> <port> # Publish localhost:<port> as https://<name>.dev.mentolder.de
```

---

## Access Requirements

### Keycloak `/dev-access` Group

`workspace-dev` Keycloak client enforces `/dev-access` group membership at the oauth2-proxy layer. Without this, browsers loop on 403.

```
# Check in KC admin UI: web.mentolder.de/keycloak/admin → realm workspace → Groups → /dev-access
# Add user there, then retry
```

### SSH Access (brainstorm tunnels)

Tunnels via `task dev:tunnel` require:
1. Your CIDR in `DEV_SSH_ALLOWLIST` (environments/mentolder.yaml) → then `task dev:firewall:open`
2. Your public key in `DEV_SISH_AUTHORIZED_KEYS` → then `task brainstorm:materialise-keys`

---

## Port Mappings (load-bearing — don't recreate cluster without these)

| Port | Purpose |
|---|---|
| `127.0.0.1:18080` | k3d HTTP LB (prod Traefik → workspace-dev) |
| `0.0.0.0:2222` | SSH for sish reverse tunnels |
| `127.0.0.1:15432` | shared-db-dev direct access |

These come from `k3d-config.yaml` in the project root. Recreating the cluster without `task dev:cluster:create` loses them.

---

## Secret Handling

Dev secrets are sealed against the **mentolder cert** (for the dev-db-refresh CronJob which runs in prod), but materialised inside dev k3d as plain Secrets:

```bash
# ❌ Never do this — no sealed-secrets controller in k3d
kubectl apply environments/sealed-secrets/mentolder.yaml --context k3d-mentolder-dev

# ✅ Correct: materialise via task
task dev:_materialise-secrets
```

---

## Nightly Data Refresh Caveat

`dev-db-refresh` CronJob (03:30 UTC) drops + recreates `website`, `bugs`, `bachelorprojekt` in `shared-db-dev` from the latest prod snapshot. Any data written to those DBs in dev is erased each night. Use `task dev:db:refresh` to trigger manually.

---

## Common Failure Modes

| Symptom | Cause | Fix |
|---|---|---|
| `task dev:cluster:create` fails immediately | Not running on k3s-1 | This task SSHes in — check connectivity to k3s-1 first |
| 403 loop on dev.mentolder.de | Not in `/dev-access` KC group | Add user in KC admin → Groups → /dev-access |
| Tunnel command hangs | Key not in DEV_SISH_AUTHORIZED_KEYS | `task brainstorm:materialise-keys` |
| DB writes gone next day | Nightly refresh | Expected — don't write production rituals against dev DB |
| Port 18080 not mapped | Cluster recreated without task | `task dev:cluster:delete` then `task dev:cluster:create` |
