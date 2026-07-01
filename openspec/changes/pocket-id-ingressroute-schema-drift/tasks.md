---
title: "pocket-id-ingressroute-schema-drift — Implementation Plan"
ticket_id: T001397
domains: [infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# pocket-id-ingressroute-schema-drift — Implementation Plan

_Ticket: T001397_

## File Structure

```
k3d/pocket-id.yaml                       # remove invalid spec.forwardedHeaders block from the
                                          # pocket-id IngressRoute; add an explanatory NOTE comment
tests/spec/pocket-id-proxy-ip.bats       # update SSOT test (T001328) so it asserts the field's
                                          # absence + schema-clean kustomize build output instead
                                          # of its presence; TRUST_PROXY assertion unchanged
openspec/changes/pocket-id-ingressroute-schema-drift/specs/workspace-deploy.md
                                          # delta spec: new Requirement that manifests only use
                                          # CRD-schema-declared fields
```

## Root cause (confirmed against the live `fleet` cluster)

`kubectl --context fleet get crd ingressroutes.traefik.io -o json` shows the installed CRD's
`spec` only declares `entryPoints`, `parentRefs`, `routes`, `tls` (Traefik `3.6.13`). The
`forwardedHeaders` field set on `k3d/pocket-id.yaml`'s `IngressRoute` (added in T001328,
`pocket-id-proxy-ip-rate-limit`) is not, and never was, a valid `IngressRoute` field on any
Traefik version — that setting only exists as Traefik's static/entry-point config. It was
never actually applied by Traefik; only the newer `kubectl apply --server-side` used by
`task workspace:deploy` started rejecting it, because server-side apply validates against
the live CRD schema and aborts the whole multi-resource apply on the first violation. The
original purpose (get Pocket-ID's rate-limiter/audit-log the real client IP instead of the
cluster-internal proxy IP) is already satisfied by T001341 (Traefik hostPort DaemonSet, no
SNAT hop between client and Traefik), so no equivalent replacement field is needed anywhere.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Update `tests/spec/pocket-id-proxy-ip.bats` to assert the
      `forwardedHeaders` field is **absent** from `k3d/pocket-id.yaml`'s `IngressRoute` and
      absent from the `kustomize build k3d/` output (the SSOT test previously asserted the
      opposite — that the field must be present — since it predates this fix). Run it against
      the current (unfixed) branch — the field is still present, so the new assertions fail:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-proxy-ip.bats
# expected: FAIL (red — k3d/pocket-id.yaml still has spec.forwardedHeaders)
```

- [ ] **Fix-Step (GREEN).** Remove the `spec.forwardedHeaders` block from the `pocket-id`
      `IngressRoute` in `k3d/pocket-id.yaml` (keep `entryPoints` and `routes` as-is; leave
      `TRUST_PROXY` env var and `prod/patch-pocket-id.yaml` untouched — neither reference the
      removed field). Re-run the same BATS file — it must now pass:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-proxy-ip.bats
# expected: PASS (green)
```

- [ ] **Regression check on both brand overlays.** Confirm `kustomize build` for both prod
      overlays renders no `forwardedHeaders` on any `IngressRoute`:

```bash
kustomize build prod-fleet/mentolder --load-restrictor=LoadRestrictionsNone | grep -c forwardedHeaders   # expect 0
kustomize build prod-fleet/korczewski --load-restrictor=LoadRestrictionsNone | grep -c forwardedHeaders  # expect 0
task workspace:validate
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
