# Public token-authenticated route for the dev MCP monolith — Design Spec

**Date:** 2026-05-30
**Branch:** `feature/dev-mcp-public-route`
**Author:** dev-flow-plan (straight-to-spec, approach pre-chosen by operator)

## Problem

The dev MCP monolith (`claude-code-mcp-monolith` in namespace `workspace-dev` on
the `k3d-mentolder-dev` cluster, hosted as a k3d-in-k3s sibling on `k3s-1`) is
healthy and speaks MCP correctly, but it is **ClusterIP-only**. There is no
public route, so a Claude Code client on a workstation cannot reach it. The
operator wants a **durable, token-authenticated** public endpoint
(`mcp.dev.mentolder.de`) so the dev monolith's `kubernetes` / `postgres` /
`github` / `browser` MCP servers are usable from any Claude Code client,
surviving cluster/pod restarts — not a per-session SSH tunnel.

### Verified current state (2026-05-30)

- Monolith pod `claude-code-mcp-monolith` is **4/4 Running** in `workspace-dev`.
- Health: postgres (`:3001/health`), browser (`:3000/health`), github
  (`:3002/health`) all return `ok`; kubernetes (`:8080`) listens (TCP probe, no
  `/health`).
- postgres MCP completes a proper MCP `initialize` handshake over a port-forward
  (`serverInfo: example-servers/postgres`, advertises tools + resources).
- `mcp.dev.mentolder.de` resolves to the three mentolder Traefik IPs via the
  `*.dev.mentolder.de` wildcard and is covered by the existing
  `workspace-dev-wildcard-tls` cert. **No new DNS record or cert is required.**

## Constraints discovered (the two-layer routing reality)

External `*.dev.mentolder.de` traffic does **not** reach the k3d cluster
directly. The path is:

```
client ──HTTPS──▶ prod Traefik (mentolder k3s, :443, valid wildcard cert)
                   └─ Ingress workspace-ingress-dev  (host *.dev.mentolder.de + dev.mentolder.de)
                       backend ──▶ Service oauth2-proxy-dev:4181
                                    └─ oauth2-proxy-dev  (v7.9.0, reverse-proxy,
                                       hostNetwork on k3s-1, OIDC /dev-access gate)
                                        └─ --upstream http://127.0.0.1:18080  (k3d Traefik LB, localhost-only)
                                            ├─ web.dev.mentolder.de   → website
                                            ├─ brett.dev.mentolder.de → brett
                                            └─ *.dev.mentolder.de     → sish catch-all (priority 1)
```

Key facts (file:line):

- `prod-mentolder/dev-ingress.yaml:15-34` — native `Ingress` `workspace-ingress-dev`
  matches `*.${DEV_DOMAIN}` **and** `${DEV_DOMAIN}`, both backing
  `oauth2-proxy-dev:4181`. TLS = `workspace-dev-wildcard-tls`.
- `prod-mentolder/oauth2-proxy-dev.yaml:65-96` — `oauth2-proxy-dev` is a **full
  reverse proxy** (`--reverse-proxy=true --upstream=http://127.0.0.1:18080`),
  `hostNetwork: true`, pinned `nodeSelector kubernetes.io/hostname=${DEV_NODE}`
  (k3s-1), `hostPort 4181`, OIDC gate `--keycloak-group=/dev-access`. It is the
  **only** bridge into k3d, and `127.0.0.1:18080` is localhost-only (a normal
  pod cannot reach it — hostNetwork is mandatory).
- `deploy/mcp/mcp-auth-proxy.yaml` — the prod MCP token gate is an **nginx
  ForwardAuth** target: `/auth` returns 200 (with `X-MCP-Role`) or 401, reading
  `Authorization: Bearer <tok>` or, as fallback for header-less clients,
  `?token=` extracted from `X-Forwarded-Uri`. Tokens live in Secret `mcp-tokens`
  (keys `CLUSTER_TOKEN`, `BUSINESS_TOKEN`).
- `deploy/mcp/ingress.yaml:44-110` — prod `mcp.mentolder.de` IngressRoute applies
  middleware chain `mcp-forwardauth → mcp-strip-auth-header → mcp-strip-service-prefix`,
  path-routing `/kubernetes→8080 /postgres→3001 /browser→3000 /github→3002`,
  entrypoints `web` + `websecure`.
- `k3d/dev-stack/traefik-wildcard-ingress.yaml` — inside k3d, explicit hosts use
  native `Ingress`; the catch-all is a Traefik `IngressRoute` `sish-catchall`
  (`priority: 1`, entrypoint `web` only). **TLS is terminated at prod Traefik;
  dev k3d runs plain HTTP on entrypoint `web`.**
- `Taskfile.dev-stack.yml` — `dev:apply` runs `kubectl --context
  k3d-mentolder-dev` over `k3d/dev-stack/`, envsubst vars `$DEV_DOMAIN
  $DEV_WEBSITE_HOST $DEV_BRETT_HOST $PROD_DOMAIN $CONTACT_EMAIL`. Dev secrets are
  **materialised imperatively** (`dev:_materialise-secrets`) from
  `environments/.secrets/mentolder.yaml`; there is **no sealed-secrets
  controller** in the dev k3d cluster.

## Chosen approach — "B: skip-auth bridge + dev-side token gate"

Keep the prod surface minimal and mirror the existing prod MCP pattern, but
host the token gate + routing entirely **inside** the dev k3d cluster.

1. **Bridge (prod, 2-line change):** Add `--skip-auth-route` entries to
   `oauth2-proxy-dev` for the MCP path prefixes
   (`^/(kubernetes|postgres|github|browser)(/|$)`). Skipped routes bypass the
   OIDC gate but are **still reverse-proxied to `127.0.0.1:18080`** with the
   original `Host` header intact. This is the only prod change and it is fully
   reversible.

2. **Token gate (dev k3d):** Port `deploy/mcp/mcp-auth-proxy.yaml` into
   `k3d/dev-stack/` as `mcp-auth-proxy-dev` (nginx ForwardAuth, `/auth` →
   200/401, Bearer or `?token=`). Single token tier (`CLUSTER_TOKEN`) is enough
   for dev; drop the business tier.

3. **Routing (dev k3d):** Add a Traefik `IngressRoute`
   `Host(mcp.dev.mentolder.de)` on entrypoint `web` with middleware chain
   `mcp-dev-forwardauth → mcp-dev-strip-auth-header → mcp-dev-strip-service-prefix`,
   path-routing `/kubernetes→8080 /postgres→3001 /github→3002 /browser→3000`
   (mirror prod). Priority above the `sish-catchall` (which is `priority: 1`).

4. **Token secret (dev):** `mcp-tokens` Secret in `workspace-dev`, key
   `CLUSTER_TOKEN`, materialised imperatively in the dev deploy step from a new
   `DEV_MCP_TOKEN` key in `environments/.secrets/mentolder.yaml` (same mechanism
   as `claude-code-secrets`). No sealing (dev has no controller).

5. **Client registration:** Document `claude mcp add --transport http` commands
   for `https://mcp.dev.mentolder.de/{kubernetes,postgres,github,browser}/mcp?token=<TOKEN>`.

### Why not the alternatives

- **A: dedicated hostNetwork token-bridge pod in prod** (parallel to
  oauth2-proxy-dev, exact-host Ingress beats the wildcard). More isolated from
  the shared SSO proxy, but adds a **new prod hostNetwork Deployment + Service +
  Ingress + sealed secret + a second host port on k3s-1** — more prod surface to
  maintain and for the in-flight fleet Phase-2a overlay to exclude. Rejected as
  heavier for no real security gain (the token gate is the actual control in
  both designs).
- **Local SSH tunnel** — operator explicitly rejected (not durable).

### Security notes

- `--skip-auth-route` is **path-based and applies to every `*.dev` host**, not
  just `mcp.dev`. This is acceptable: only the `mcp.dev.mentolder.de`
  IngressRoute serves those paths inside k3d; the same paths on
  `web.dev`/`brett.dev` have no backend and 404 at the k3d layer. The MCP itself
  is gated by the dev-side token ForwardAuth.
- The token is a bearer secret in the URL/header; it lives only in
  `environments/.secrets/mentolder.yaml` (gitignored) and the materialised dev
  Secret. Never committed.
- postgres MCP reaches `shared-db-dev` (`/website` DB) which holds **prod-derived
  data** (nightly refresh). Treat the token as production-sensitive.

## Acceptance criteria

- [ ] `curl https://mcp.dev.mentolder.de/postgres/mcp` **without** a token → 401
      from the dev token gate (not an OIDC redirect, not a 404).
- [ ] `POST https://mcp.dev.mentolder.de/postgres/mcp?token=<TOKEN>` with an MCP
      `initialize` body → valid MCP `initialize` result (`example-servers/postgres`).
- [ ] Same handshake succeeds for `/kubernetes/mcp` and `/github/mcp` with a
      valid token.
- [ ] An OIDC browser visit to `web.dev.mentolder.de` still requires
      `/dev-access` login (skip-auth did not widen the SSO bypass for real app
      paths).
- [ ] `task test:all` green; `task workspace:validate` green (kustomize builds
      for `prod-mentolder/` and `k3d/dev-stack/`).
- [ ] A BATS/structural test asserts the `mcp.dev` IngressRoute + ForwardAuth
      chain exist in the rendered `k3d/dev-stack` kustomize output.

## Out of scope

- Korczewski / fleet dev MCP (mentolder dev only).
- Repairing the **prod** `mcp.mentolder.de` 404 (separate issue — logged as a
  mishap).
- The stale fleet IP `204.168.244.104` in mentolder DNS (pre-existing DNS
  hygiene — logged as a mishap; ~1/3 of requests to any mentolder hostname hit a
  dead IP).
- Multi-tier (business) tokens in dev.
