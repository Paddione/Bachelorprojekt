# dev.mentolder.de — Operator Runbook

Persistent staging stack hosted as a k3d-in-k3s sibling on
`gekko-hetzner-2`. Mirrors the website + Brett against last night's prod
data; ad-hoc reverse-SSH tunnels publish localhost ports as
`<name>.dev.mentolder.de`. All traffic passes through the same
Keycloak realm as prod via a dedicated `workspace-dev` OIDC client —
membership in `/dev-access` is required.

## Architecture (one paragraph)

A k3d cluster (`mentolder-dev`) runs as a Docker workload on
`gekko-hetzner-2`. Its HTTP loadbalancer binds `127.0.0.1:18080`. Prod
Traefik fronts it as an SSO-gated reverse proxy: `oauth2-proxy-dev`
(in the prod `workspace` namespace, `hostNetwork: true`, pinned to
`gekko-hetzner-2`) dials `127.0.0.1:18080` after auth via
`workspace-dev` Keycloak client. A nightly CronJob `pg_restore`s the
latest prod snapshot into `shared-db-dev`. `sish` exposes
`0.0.0.0:2222` for `ssh -R` tunnels, gated by pubkey-auth plus a ufw
allowlist (`DEV_SSH_ALLOWLIST` → `task dev:firewall:open`).

```
client
  └─ HTTPS ─► prod Traefik (gekko-hetzner-2)
              └─ workspace-ingress-dev (host *.dev.mentolder.de)
                  └─ ForwardAuth middleware ─► oauth2-proxy-dev:4181/oauth2/auth
                  └─ backend ─► oauth2-proxy-dev:4181
                                  └─ upstream ─► 127.0.0.1:18080 (k3d Traefik)
                                                  ├─ web.dev.mentolder.de  → website
                                                  ├─ brett.dev.mentolder.de → brett
                                                  └─ *.dev.mentolder.de    → sish (catch-all)
                                                                              ▲
                                                                              └─ ssh -R from operator
```

## Day-to-day operations

| What | Command | Notes |
|---|---|---|
| First-time cluster bring-up | `task dev:cluster:create` | SSHes to `$DEV_NODE`, runs `k3d cluster create` with the load-bearing port mappings (`127.0.0.1:18080`, `0.0.0.0:2222`, `127.0.0.1:15432`). |
| Status | `task dev:cluster:status` | Pods, services, ingresses in `workspace-dev`. |
| Full deploy | `task dev:deploy` | Builds website + brett, imports into k3d, applies manifests. |
| Website only | `task dev:redeploy:website` | Rebuild + roll. |
| Brett only | `task dev:redeploy:brett` | Same. |
| DB refresh | `task dev:db:refresh` | One-shot restore of the latest prod snapshot. The nightly CronJob does this automatically at 03:30 UTC. |
| Tunnel | `task dev:tunnel -- <name> <port>` | Publishes `localhost:<port>` as `https://<name>.dev.mentolder.de`. |
| Logs | `task dev:logs -- <svc>` | `<svc>` ∈ `website | brett | shared-db-dev | sish`. |
| psql | `task dev:psql` | Drops you into `shared-db-dev` as `postgres`. |
| Firewall allowlist | `task dev:firewall:open` | Applies `DEV_SSH_ALLOWLIST` CIDRs as ufw rules on `$DEV_NODE`. |

## Adding yourself

1. **Keycloak group.** Add your KC user to `/dev-access` via
   `https://auth.mentolder.de/admin/master/console/#/workspace/groups`.
   Without group membership oauth2-proxy returns 403 and you'll loop.
2. **Sish authorized key** (only needed if you want to publish tunnels).
   Append your public key to `environments/.secrets/mentolder.yaml`
   under `DEV_SISH_AUTHORIZED_KEYS`, run `task env:seal ENV=mentolder`,
   commit the resealed sealed-secret, deploy, then `task dev:apply` on
   the dev cluster to refresh the ConfigMap.
3. **Public IP allowlist.** If you're tunneling from a new network, add
   the CIDR to `DEV_SSH_ALLOWLIST` in `environments/mentolder.yaml` and
   run `task dev:firewall:open`.

## What breaks when

| Symptom | Probable cause | Fix |
|---|---|---|
| `web.dev.mentolder.de` returns 502 | k3d cluster not running or oauth2-proxy-dev down | `task dev:cluster:status`; check `kubectl --context mentolder -n workspace get pods -l app=oauth2-proxy-dev`. |
| Looping at the SSO callback | KC user not in `/dev-access`, or `workspace-dev` client redirect URIs out of sync with `${DEV_DOMAIN}` | Re-check group membership; `task keycloak:sync ENV=mentolder`. |
| `dev-tls.bats` cert check fails | LetsEncrypt rate-limit, or DNS record for `*.dev.mentolder.de` drifted | `kubectl --context mentolder -n workspace get certificate workspace-dev-wildcard-tls`; re-pin DNS via the ipv64 API. |
| `dev:db:refresh` errors with "No backups found" | backup-pvc empty on the prod side | Inspect the prod `backup` CronJob — `task workspace:backup:list ENV=mentolder`. |
| `ssh -R` from new laptop hangs | `DEV_SSH_ALLOWLIST` missing the CIDR | Add and `task dev:firewall:open`. |

## Gotchas (reproduce in CLAUDE.md§Gotchas before merge)

- **`dev:cluster:create` MUST run while logged in to the laptop that
  can SSH `root@gekko-hetzner-2`.** It doesn't bootstrap the node
  itself — Docker + k3d binary must already be there (Task 10 of the
  plan covers this).
- **The dev cluster sees prod data.** Don't write production rituals
  against the dev DB — they will be erased at 03:30 UTC.
- **SSH port 2222 is public** but ufw-deny-default'd. Only the
  `DEV_SSH_ALLOWLIST` CIDRs (`task dev:firewall:open`) and a curated
  key list (`DEV_SISH_AUTHORIZED_KEYS`) can publish tunnels.
- **Dev secrets are sealed against the mentolder cert** (the refresh
  CronJob runs in prod) but materialised inside dev k3d as a plain
  Secret by `task dev:_materialise-secrets`. Don't apply
  `environments/sealed-secrets/mentolder.yaml` to the dev context — no
  sealed-secrets controller there.
- **`workspace-dev` Keycloak client enforces `/dev-access` group at
  the oauth2-proxy layer** (`--allowed-groups=/dev-access`). Adding a
  user without the group means a 403 loop, not a "you can sign in but
  see no data" — useful when triaging first-visit complaints.
