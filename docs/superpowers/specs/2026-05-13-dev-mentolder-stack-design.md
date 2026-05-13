# dev.mentolder.de — Persistent Dev Stack on gekko-hetzner-2

**Date:** 2026-05-13
**Status:** Draft — awaiting user review
**Target:** mentolder workspace, hosted on the existing `gekko-hetzner-2` control-plane node

## 1. Purpose

Stand up a persistent, SSO-gated, k3d-based staging environment for the mentolder workspace at `*.dev.mentolder.de`. It mirrors only the parts of prod we actually iterate on — the Astro/Svelte **website** and the **Brett** service, plus a small **Postgres** with a nightly snapshot of prod data — and gates every URL with a dedicated OIDC client backed by the existing prod Keycloak.

The stack must also let Claude (and the user from a laptop) **publish localhost services as public subdomain URLs** via an authenticated reverse-SSH tunnel, so previewing a locally running dev server from another device is one command away.

## 2. Goals & non-goals

### Goals
- Always-on `https://web.dev.mentolder.de` and `https://brett.dev.mentolder.de` reflecting merged `main` (auto-deploy on push).
- Ad-hoc `https://<name>.dev.mentolder.de` URLs for any localhost port, created by `ssh -R`, torn down when the tunnel disconnects.
- Every URL gated by Keycloak with a **dedicated `workspace-dev` OIDC client** restricted to the **`dev-access` group**.
- Realistic data: nightly restore of the prod `website` / `bugs` / `bachelorprojekt` databases into dev's own Postgres. Dev writes never reach prod.
- Manual `task dev:deploy BRANCH=<branch>` override to preview a feature branch end-to-end before merging.

### Non-goals
- Per-branch preview URLs (out of scope — branches share the single `web.dev.mentolder.de` URL).
- Full prod mirror. Nextcloud, the workspace Keycloak, LiveKit, MCP, DocuSeal, Vaultwarden, Mailpit, Whiteboard are **not** running in dev — dev consumes the prod Keycloak for OIDC and otherwise has nothing of theirs.
- Backups of dev state. The dev DB is rebuildable from prod's nightly snapshot in ~60 s.
- ArgoCD federation of the dev cluster. Manifests are applied imperatively via `task dev:deploy` and a CI workflow that SSHes to the node.

## 3. Architecture

A k3d cluster (Docker-in-Docker) runs **inside** gekko-hetzner-2, sibling to the production k3s. Its HTTP load balancer is bound to `127.0.0.1:18080` on the host — public Internet cannot reach it directly. The only entry path for HTTP is via the production cluster's Traefik, which fronts everything as an SSO-gated reverse proxy. Its SSH load balancer is bound to `0.0.0.0:2222` for sish; that port is firewalled to known source ranges.

```
Internet
   │
   ▼  *.dev.mentolder.de  (DNS A → 178.104.169.206)
┌──────────────────────────── gekko-hetzner-2 ──────────────────────────┐
│                                                                       │
│  mentolder k3s (prod)                                                 │
│  ─────────────────────                                                │
│  • Traefik :80/:443                                                   │
│  • IngressRoute *.dev.mentolder.de   ← TLS termination (wildcard)     │
│       └─ middleware: oauth2-proxy-dev  (workspace-dev OIDC client)    │
│       └─ Endpoints → 127.0.0.1:18080  (k3d HTTP LB)                   │
│                                                                       │
│  k3d-mentolder-dev  (Docker, single-node)                             │
│  ─────────────────────────────────────────                            │
│  • k3d HTTP LB → published on host 127.0.0.1:18080                    │
│  • k3d SSH LB  → published on host 0.0.0.0:2222   (for sish)          │
│  • Traefik (in-k3d): Host(...) router                                 │
│  • workspace-dev ns:                                                  │
│      - website, brett, shared-db-dev (1 replica each)                 │
│      - sish (reverse-tunnel broker)                                   │
│  • dev-restore ns: nightly pg_restore CronJob mirror (idle)           │
│  • Storage: local-path-provisioner                                    │
└───────────────────────────────────────────────────────────────────────┘
```

### Two ways traffic enters dev

**Persistent services** (`web.dev.mentolder.de`, `brett.dev.mentolder.de`):
prod Traefik → SSO gate → 127.0.0.1:18080 → k3d Traefik → website/brett pod.

**Ad-hoc tunnels** (`<name>.dev.mentolder.de`):
```bash
ssh -p 2222 -R <name>:80:localhost:<port> tunnel@dev.mentolder.de
```
- sish authenticates by SSH pubkey.
- sish registers `<name>` as an HTTP frontend internally.
- prod Traefik catches `<name>.dev.mentolder.de` via the same `*.dev.mentolder.de` wildcard, SSO-gates it, forwards to k3d → k3d Traefik → sish → SSH back to the originating localhost:port.
- The tunnel disappears when the SSH session ends. No cleanup needed.

### Why three boundaries, not two
1. **Internet → prod Traefik**: TLS termination, all subdomains.
2. **Prod Traefik → k3d HTTP LB**: SSO gate. Anything beyond this point assumes a valid session.
3. **k3d Traefik → service**: ordinary HTTP routing inside the dev cluster.

Two failure modes this avoids:
- A pod inside dev exposed via NodePort: harmless because the NodePort lives in the k3d Docker network, not on the host.
- A dev service forgetting its own auth: harmless because prod-side ForwardAuth has already returned 302/403 if the user isn't authenticated.

## 4. SSO / OIDC

### Keycloak
One new client in the existing `workspace` realm on `auth.mentolder.de`:

| Field | Value |
|---|---|
| Client ID | `workspace-dev` |
| Client type | OpenID Connect, confidential |
| Root URL | `https://dev.mentolder.de` |
| Valid redirect URIs | `https://*.dev.mentolder.de/oauth2/callback`, `https://*.dev.mentolder.de/oauth2/sign_in` |
| Web origins | `https://*.dev.mentolder.de` |
| Authorization | Required group membership: `dev-access` — enforced via a client-level Authorization Policy + Permission so users without the group are 403'd at the token endpoint, not silently let through |

One new realm group: `dev-access`. Empty by default. The user adds themselves and anyone else who needs dev access.

The client config lands as `prod-mentolder/realm-workspace-dev-client.json`, consumed by `task keycloak:sync ENV=mentolder` so re-applying the realm is idempotent.

### oauth2-proxy
New Deployment `oauth2-proxy-dev` in the prod `workspace` namespace:

| Setting | Value |
|---|---|
| `--provider` | `keycloak-oidc` |
| `--oidc-issuer-url` | `https://auth.mentolder.de/realms/workspace` |
| `--client-id` | `workspace-dev` |
| `--client-secret` | from SealedSecret `oauth2-proxy-dev-secrets` |
| `--cookie-domain` | `.dev.mentolder.de` |
| `--cookie-name` | `_oauth2_dev` |
| `--email-domain` | `*` |
| `--reverse-proxy` | `true` |
| `--whitelist-domain` | `.dev.mentolder.de` |

The dev session cookie is scoped to `.dev.mentolder.de` and named `_oauth2_dev` (distinct from any prod oauth2-proxy cookie). Even if a cookie scope were chosen that overlapped, the cookie *name* is namespaced, and the prod oauth2-proxy validates only its own session cookie. SSO across both environments still works because the user has a Keycloak session at `auth.mentolder.de` itself — when dev oauth2-proxy redirects there, Keycloak sees its host-local session cookie and immediately returns an auth code, no second login prompt.

### Traefik middleware
New middleware `oauth2-proxy-dev@kubernetescrd` of kind `ForwardAuth` pointing at `oauth2-proxy-dev.workspace.svc.cluster.local`. Applied to every `*.dev.mentolder.de` IngressRoute in prod.

### Sequence (first visit to `web.dev.mentolder.de`)
1. Browser → prod Traefik → ForwardAuth checks `_oauth2_dev` cookie.
2. No cookie → 302 to `https://auth.mentolder.de/realms/workspace/protocol/openid-connect/auth?client_id=workspace-dev&...`.
3. User logs in (or already has KC session). KC enforces `dev-access` group; missing → 403.
4. KC → redirect to `https://web.dev.mentolder.de/oauth2/callback?code=...`.
5. oauth2-proxy exchanges code, sets `_oauth2_dev` cookie on `.dev.mentolder.de`, redirects to `/`.
6. Subsequent requests to *any* `*.dev.mentolder.de` host carry the cookie → ForwardAuth allow → upstream.

### sish (SSH side)
SSH access to port 2222 is gated by an authorized-keys list, stored as ConfigMap `sish-authorized-keys` populated from `environments/.secrets/dev.yaml`. The HTTP side of any sish-published URL still flows through the OIDC gate above — sish does not bypass SSO; it only injects upstream backends.

## 5. Data lifecycle

### Components

| What | Where | Detail |
|---|---|---|
| `shared-db-dev` Postgres | inside k3d (`workspace-dev` ns) | Single replica, 1Gi PVC on local-path-provisioner, image `postgres:16`. Roles + DBs initialised by an init Job from the dev SealedSecret. |
| `dev-db-refresh` CronJob | in prod k3s, `workspace` ns | Nightly 03:30 UTC. Mounts `backup-pvc`, picks the latest dump for `website`, `bugs`, `bachelorprojekt`, drops & recreates the matching DB in dev's `shared-db-dev`, then `pg_restore`s. |
| Connectivity | prod CronJob → dev DB | The CronJob pod runs with `hostNetwork: true` + a `nodeSelector` pinning it to `gekko-hetzner-2`, then connects to `127.0.0.1:15432` (the k3d-published Postgres NodePort, also `127.0.0.1`-bound). |
| Manual override | `task dev:db:refresh` | Runs the same restore script against the same CronJob image. |

### What does NOT get copied
- `tracking.pending_*` write queues — dev has its own empty queue, so dev's tracking-import CronJob does not replay prod PRs.
- `keycloak.*` user records — irrelevant; dev uses prod Keycloak.
- `nextcloud.*`, `vaultwarden.*`, `docuseal.*` — those services do not run in dev.

### Personal-data posture
Dev sees the same coaching data, tickets, and timeline rows as prod admins. The trust boundary is identical: only Keycloak users with `dev-access` reach dev, and `dev-access` is curated by the same person curating prod admin access. No additional DSGVO controls beyond what prod already enforces.

### Secrets

`shared-db-dev` has its own role passwords, distinct from prod's. The SealedSecret `environments/sealed-secrets/dev.yaml` is sealed against the **prod cluster's** sealing cert because the dev-refresh CronJob — which needs these credentials to log into the dev DB — runs in prod. Inside the dev k3d cluster, the same plaintext is materialised as a normal Secret by the deploy task (one-shot at provisioning, not on every refresh). The dev k3d cluster does **not** run sealed-secrets-controller.

A leaked dev password must not unlock prod's `shared-db`. The init Job uses a separate password set generated by `task env:generate ENV=dev`.

## 6. Deploy & image flow

### 6.1 Manifests — new overlay `k3d/dev-stack/`

```
k3d/dev-stack/
├── kustomization.yaml
├── namespace.yaml          # workspace-dev
├── shared-db-dev.yaml      # postgres:16, 1Gi PVC, init Job, NodePort 30000 → host:15432
├── website-dev.yaml        # Deployment + Service + IngressRoute (Host: web.dev.mentolder.de)
├── brett-dev.yaml          # Deployment + Service + IngressRoute (Host: brett.dev.mentolder.de)
├── sish.yaml               # Deployment + Service (HTTP + SSH), authorized-keys ConfigMap
├── traefik-config.yaml     # k3d Traefik: wildcard IngressRoute for *.dev.mentolder.de + sish forwarder
└── secrets.yaml.template   # placeholder; real values come from environments/sealed-secrets/dev.yaml
```

No prod/ overlay needed for dev itself — the dev k3d only ever runs one config. Image tags are kustomize `images:` overrides set by the deploy task at apply time.

### 6.2 Prod-side glue — additions to `prod-mentolder/`

```
prod-mentolder/
├── dev-ingress.yaml             # IngressRoute *.dev.mentolder.de → ForwardAuth → 127.0.0.1:18080
├── dev-db-refresh-cron.yaml     # nightly snapshot restore CronJob (workspace ns)
├── oauth2-proxy-dev.yaml        # second oauth2-proxy instance + Service
├── oauth2-proxy-dev-middleware.yaml  # Traefik Middleware (ForwardAuth)
├── cert-dev-wildcard.yaml       # Certificate CR for *.dev.mentolder.de via DNS-01
└── realm-workspace-dev-client.json   # consumed by keycloak:sync
```

### 6.3 Taskfile — new `Taskfile.dev-stack.yml`, included under namespace `dev`

```bash
task dev:cluster:create            # one-shot: k3d cluster create with the right port mappings + nodeSelector
task dev:cluster:delete            # tear down
task dev:cluster:status            # kubectl --context k3d-mentolder-dev get pods -A
task dev:deploy                    # build website+brett images, k3d image import, apply manifests
task dev:deploy BRANCH=feature/x   # worktree-checkout BRANCH first, then the above
task dev:redeploy:website          # rebuild + roll website only
task dev:redeploy:brett            # rebuild + roll brett only
task dev:db:refresh                # one-shot snapshot restore (same logic as the CronJob)
task dev:tunnel -- <name> <port>   # convenience wrapper: ssh -p 2222 -R <name>:80:localhost:<port> tunnel@dev.mentolder.de
task dev:logs -- <svc>             # tail dev pod logs
task dev:psql                      # psql into dev shared-db
```

The `dev:deploy` task does the same image-import dance as `task website:deploy`, against the `k3d-mentolder-dev` context instead of `mentolder`. `dev:cluster:create` runs:

```
k3d cluster create mentolder-dev \
  --port "127.0.0.1:18080:80@loadbalancer" \
  --port "0.0.0.0:2222:2222@loadbalancer" \
  --port "127.0.0.1:15432:30000@loadbalancer" \
  --servers 1 --agents 0
```

If any of these port mappings drift (e.g. cluster recreated without `--port`), the prod IngressRoute and nightly refresh both break silently. The task is the only supported way to (re)create the cluster.

### 6.4 CI auto-deploy on `main` merge — `.github/workflows/dev-auto-deploy.yml`

| Trigger | Action |
|---|---|
| Push to `main` touching `website/**` | SSH `gekko-hetzner-2` → `task dev:redeploy:website` |
| Push to `main` touching `brett/**` | SSH `gekko-hetzner-2` → `task dev:redeploy:brett` |
| Push to `main` touching `k3d/dev-stack/**` or `prod-mentolder/dev-*` | SSH → `task dev:deploy` (full re-apply) |

The SSH part uses a dedicated deploy key, added to `~/.ssh/authorized_keys` on gekko-hetzner-2 with a `command=` restriction limiting it to `cd /opt/bachelorprojekt && task dev:*` invocations. Manual override from the user's laptop bypasses CI entirely.

### 6.5 Branch-preview flow

`task dev:deploy BRANCH=feature/foo` (rough sketch):
```bash
git fetch origin "$BRANCH"
worktree=$(mktemp -d)/branch
git worktree add "$worktree" "origin/$BRANCH"
( cd "$worktree" && task website:build brett:build )
docker image save mentolder-website brett | k3d image import - -c mentolder-dev
kubectl --context k3d-mentolder-dev rollout restart deploy/website deploy/brett -n workspace-dev
git worktree remove "$worktree"
```

Branches share the single `web.dev.mentolder.de` URL — there are no per-branch URLs. Switching back to main happens automatically on the next `main` push.

## 7. Testing & rollout

### Smoke tests — `tests/dev-stack/`
- `dev-tls.bats`: `curl -sI https://web.dev.mentolder.de` redirects to `auth.mentolder.de` (proves SSO gate is alive).
- `dev-sso.bats`: with a valid `_oauth2_dev` cookie (minted via Keycloak admin REST in test setup), `curl https://web.dev.mentolder.de/api/timeline` returns 200 with non-empty JSON.
- `dev-tunnel.bats`: scripted `ssh -R` + `curl` round-trip through sish, then verify teardown.

Gated by `[[ "$RUN_DEV_TESTS" == "true" ]]` so the regular `./tests/runner.sh local` does not hit dev. New `.github/workflows/dev-smoke.yml` runs them nightly, after the auto-deploy job.

### Rollout order (first-time)
1. Cert + DNS prep: add `*.dev.mentolder.de` to ipv64, apply `cert-dev-wildcard.yaml`, wait for `Ready=True`.
2. Keycloak: `dev-access` group + `workspace-dev` client via `task keycloak:sync ENV=mentolder` after dropping `realm-workspace-dev-client.json` into `prod-mentolder/`.
3. Prod-side: apply `prod-mentolder/dev-ingress.yaml` + `oauth2-proxy-dev.yaml` + middleware. Returns 502 until step 5 — expected.
4. Provision k3d on gekko-hetzner-2: `task dev:cluster:create` (publishes 18080 to 127.0.0.1, 2222 to 0.0.0.0, 15432 to 127.0.0.1).
5. `task dev:deploy` — applies the dev-stack overlay, brings up website / brett / db / sish.
6. `task dev:db:refresh` — first snapshot restore (CronJob handles nightly after).
7. Verify `https://web.dev.mentolder.de` from a browser → KC login → land on dev's index.

### Gotchas
- **Port 2222 is exposed to the public Internet.** SSH pubkey auth is strong, but fail2ban + a deny-by-default ufw rule with explicit allows from known source ranges is mandatory. Adds two rules to `prod/cloud-init.yaml`.
- **k3d loadbalancer port pinning is load-bearing.** `--port "127.0.0.1:18080:80@loadbalancer"`, `--port "0.0.0.0:2222:2222@loadbalancer"`, `--port "127.0.0.1:15432:30000@loadbalancer"` must match exactly across recreations. `dev:cluster:create` is the only supported entry point.
- **gekko-hetzner-2 is already heavily loaded.** ArgoCD + cert-manager + Traefik + brett + keycloak + livekit-ingress + longhorn + several MCP pods already run there. Dev pods get tight resource limits (256Mi mem / 250m cpu defaults, 1Gi PVC cap). Document the node's current `kubectl top` baseline before rollout so regressions are easy to spot.
- **`shared-db-dev` SealedSecret is sealed against the prod cluster's cert** (because the refresh CronJob runs in prod). The dev k3d cluster has no sealed-secrets controller; the deploy task materialises the same plaintext as an ordinary Secret. Applying the SealedSecret directly to dev will fail and is unsupported.
- **Cookie domains are siblings, not parent/child.** `.dev.mentolder.de` and `.mentolder.de` are isolated. A KC SSO cookie on `auth.mentolder.de` is visible to both subdomains (good — single sign-on), but the oauth2-proxy session cookies do not cross. Don't "fix" this by widening `--cookie-domain` to `.mentolder.de`.
- **No dev backups.** The dev cluster's PVCs are not in the prod backup PVC. Destroying `k3d-mentolder-dev` loses dev state — acceptable because `dev:db:refresh` rebuilds it from prod in ~60 s.
- **First image build is cold and slow.** Laptop-side `task dev:deploy` builds and pushes; the CI/SSH variant builds directly on the node and reuses the docker cache there.

## 8. Out of scope (revisit later if needed)

- Per-branch preview subdomains (`web-<branch>.dev.mentolder.de`). Possible later by parameterising IngressRoute Host rules with branch slugs.
- Letting non-`dev-access` users preview specific sish tunnels. Possible by adding a second oauth2-proxy with a different group requirement and a separate Traefik route for a `public-preview-*.dev.mentolder.de` prefix.
- Federating the dev k3d cluster with ArgoCD. Skipped because the cluster is intended to be wiped and recreated freely, which fights ArgoCD's drift detection.
- Running Nextcloud / Keycloak / LiveKit / MCP / DocuSeal / Vaultwarden in dev. Out of scope; dev uses the prod Keycloak and skips the rest.
