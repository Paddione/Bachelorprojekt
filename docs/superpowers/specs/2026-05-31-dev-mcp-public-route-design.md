---
title: Dev MCP public route — self-contained k3d edge
date: 2026-05-31
status: active
domains: [infra, security, ops]
ticket: T000363
supersedes: 2026-05-30-dev-mcp-public-route-design.md
shelves: 2026-05-30-multinode-dev-cluster-ha-design.md
---

# Dev MCP public route — self-contained k3d edge

## Goal

Restore public reachability of the dev MCP servers —
`https://mcp.dev.mentolder.de/{kubernetes,postgres}/mcp` — with a valid TLS
certificate, after the mentolder-standalone decommission removed the edge that
used to terminate TLS and SSO-gate the dev stack.

## What broke

On 2026-05-30 the **mentolder-standalone** k3s cluster was decommissioned and
**standalone-k3s was uninstalled from the `k3s-1` node**. That standalone k3s
provided the entire public edge for the dev stack:

- host `:443` (k3s Traefik) — the TLS terminator,
- the `workspace-dev-wildcard-tls` certificate for `*.dev.mentolder.de`,
- the `oauth2-proxy-dev` pod (hostNetwork) that SSO-gated `*.dev` and
  skip-auth'd the token-authed MCP path prefixes, proxying to `127.0.0.1:18080`.

The nested **k3d** dev cluster on `k3s-1` survived — it still serves HTTP on the
loadbalancer host-port `127.0.0.1:18080` — but it is now **orphaned**: nothing
listens on `k3s-1:443`, so every `*.dev.mentolder.de` host (web, brett, mcp)
connection-refuses externally.

Two further tangles were found:

- The `oauth2-proxy-dev` manifest (`prod-mentolder/oauth2-proxy-dev.yaml`) had
  its `--upstream` flipped to `http://10.0.0.20:80` — a kube-vip VIP from the
  **shelved** multinode-HA draft (`2026-05-30-multinode-dev-cluster-ha-design.md`,
  PR #1213) whose VMs/VIP were never built (`10.0.0.20` is unreachable).
- The fleet overlay (`prod-fleet/mentolder/kustomization.yaml`) `$patch:delete`s
  `oauth2-proxy-dev` with **no replacement bridge**, so re-joining `k3s-1` to
  fleet would not restore the edge.

The previous design doc (`2026-05-30-dev-mcp-public-route-design.md`) assumed the
old bridge model and scoped "repair prod `mcp.mentolder.de`" out — it is
superseded by this one.

## Decision

**Self-contained k3d edge.** Move the whole 443 + TLS + SSO edge *into* the k3d
dev cluster on `k3s-1`, with no dependency on fleet or any standalone cluster.
(Chosen over: re-joining `k3s-1` to fleet — re-introduces cross-cluster coupling
the consolidation removed; or host-level Docker proxies — more moving parts
outside any cluster.)

The multinode-HA direction (#1213) is **shelved** — it is the wrong layer/effort
for the immediate need and its half-applied VIP upstream is reverted here.

## Architecture

```
client
  │  https://mcp.dev.mentolder.de/{kubernetes,postgres}/mcp?token=…
  ▼
FritzBox (Exposed Host) ──► k3s-1 : 443        (unchanged; already forwards)
  ▼
k3d loadbalancer  --port 0.0.0.0:443:443@loadbalancer   (NEW host-port)
  ▼
k3d Traefik  websecure (443)
  │   TLS terminated via default TLSStore → workspace-dev-wildcard-tls
  │   (cert-manager LE wildcard, DNS-01 / ipv64, issued INSIDE the k3d cluster)
  ▼
Ingress workspace-ingress-dev   Host(*.dev.mentolder.de) ─► oauth2-proxy-dev:4181
  ▼
oauth2-proxy-dev  (in-cluster pod, NO hostNetwork)
  │   keycloak-oidc gate for *.dev; --keycloak-group=/dev-access
  │   --skip-auth-route=^/(kubernetes|postgres|github|browser)(/|$)   ← MCP bypass
  │   --upstream=http://traefik.kube-system.svc.cluster.local:80  (Host preserved)
  ▼
k3d Traefik  web (80)   ── host-routed ──►
     • IngressRoute mcp-dev   Host(mcp.dev) /kubernetes|/postgres|… → monolith
     • Ingress website-dev / brett-dev
```

Token-auth MCP clients (which cannot do the browser OIDC dance) are allowed
through the OIDC gate by `--skip-auth-route`; the real control on the MCP paths
is the dev-side ForwardAuth `mcp-auth-proxy-dev` (single `CLUSTER_TOKEN` tier).

## TLS

cert-manager runs **inside** the k3d cluster, mirroring prod's issuer:
`ClusterIssuer letsencrypt-prod` with the cert-manager-lego-webhook DNS-01
solver (provider `ipv64`, key from secret `ipv64-api-key`). A `Certificate`
issues `*.dev.mentolder.de` + `dev.mentolder.de` into secret
`workspace-dev-wildcard-tls`. The secret is co-located with Traefik's default
`TLSStore` (namespace `kube-system`) so `websecure` serves the wildcard for all
dev hosts.

## Out of scope

- The **prod** route `mcp.mentolder.de` (the prod MCP stack is not deployed on
  fleet at all) — clients are repointed to `mcp.dev.mentolder.de` instead.
- The multinode-HA dev cluster (#1213) — shelved.
- Re-joining `k3s-1` to fleet.

## Verification

`tests/dev-stack/dev-mcp-public.bats` (gated `RUN_DEV_TESTS=true`,
`DEV_MCP_TOKEN=<CLUSTER_TOKEN>`): valid (non-`TRAEFIK DEFAULT CERT`) TLS for
`mcp.dev.mentolder.de`, and JSON-RPC `result` from `/kubernetes/mcp` and
`/postgres/mcp`. Plus: k3d serverlb publishes `0.0.0.0:443`, the wildcard
Certificate is `Ready`, and `oauth2-proxy-dev` is `Running` in the k3d cluster.
