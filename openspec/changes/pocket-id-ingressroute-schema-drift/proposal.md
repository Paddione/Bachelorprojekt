# Proposal: pocket-id-ingressroute-schema-drift

## Why

The post-merge deploy workflow's "Deploy manifest changes to both brands" job fails at
`kubectl apply --server-side` on the `pocket-id` `IngressRoute` with:

```
Error from server: failed to create typed patch object (workspace/pocket-id;
traefik.io/v1alpha1, Kind=IngressRoute): .spec.forwardedHeaders: field not
declared in schema
```

Server-side apply validates against the **installed** CRD's OpenAPI schema and aborts the whole
apply chain the moment one resource fails — every subsequent manifest in the same
`kubectl apply` invocation is skipped, so this single bad field blocks **every** future
`workspace:deploy` to both `workspace` and `workspace-korczewski`.

Root-cause confirmed against the live `fleet` cluster (`kubectl --context fleet get crd
ingressroutes.traefik.io -o json`, Traefik `3.6.13`): the installed `IngressRoute` CRD's
`spec` only declares `entryPoints`, `parentRefs`, `routes`, `tls`. `forwardedHeaders` has
**never** been a valid `IngressRoute` field in any Traefik version — it only exists as
Traefik's *static/entry-point* config (`entryPoints.<name>.forwardedHeaders.trustedIPs`,
settable via the Helm chart's `ports.<name>.forwardedHeaders.trustedIPs`), not as a
per-route CRD field. `k3d/pocket-id.yaml`'s `IngressRoute` carried
`spec.forwardedHeaders.trustedIPs` since T001328 (`pocket-id-proxy-ip-rate-limit`), which
tried to fix Pocket-ID rate-limiting seeing the cluster-internal proxy IP instead of the
real client IP — but placed the setting on the wrong CRD object, so it was **never actually
applied by Traefik** (client-side `kubectl apply` historically pruned/ignored unknown
fields silently instead of erroring; server-side apply now enforces the schema and errors
instead).

Separately, **T001341** (`traefik-hostport-clientip`, archived 2026-07-01) already fixed the
real underlying problem this field was chasing: Traefik now runs as a `DaemonSet` binding
`hostPort: 80/443` directly on the 3 public nodes, with k3s' `klipper-lb` (`svclb-traefik`)
removed entirely. There is no SNAT hop left between the client and Traefik, so the real
client IP already reaches Pocket-ID's rate-limiter/audit log without needing to trust any
upstream `X-Forwarded-For` header. The `forwardedHeaders.trustedIPs` field — even placed
correctly at entry-point level — would now be a no-op, since Traefik is the first hop.

## What

1. Remove the invalid `spec.forwardedHeaders` block from the `pocket-id` `IngressRoute` in
   `k3d/pocket-id.yaml` — it is not a valid field on any Traefik `IngressRoute` CRD version,
   was never functionally applied, and its original purpose (T001328) is superseded by
   T001341's hostPort-DaemonSet fix, which already delivers the real client IP with no SNAT
   hop to correct for.
2. Update `tests/spec/pocket-id-proxy-ip.bats` (SSOT test from T001328) so it no longer
   asserts the presence of the now-removed, always-invalid field, and instead asserts the
   `IngressRoute` build output stays schema-clean (no `forwardedHeaders` in any
   `kind: IngressRoute` block emitted by `kustomize build k3d/`). The `TRUST_PROXY` env var
   assertion (Pocket-ID's own Express-level trust-proxy setting, unrelated to the Traefik CRD)
   stays unchanged — it remains correct and necessary.
3. Do **not** touch cluster CRDs or upgrade the Traefik CRD chart — out of scope, higher risk,
   and unnecessary since the field was never valid to begin with.

_Ticket: T001397_
