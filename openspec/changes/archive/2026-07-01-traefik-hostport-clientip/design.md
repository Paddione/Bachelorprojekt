## Context

T001328 fixed `externalTrafficPolicy: Local` on `kube-system/traefik`,
believing kube-proxy's SNAT during the NodePort forward was the sole cause of
client-IP loss behind Traefik. Live verification after that rollout shows the
bug persists: Pocket ID still logs `ip=10.42.x.x` (pod-CIDR addresses) for
real browser requests. Live cluster inspection in this ticket found the real
root cause sits one hop earlier: k3s' built-in ServiceLB (`klipper-lb`,
`svclb-traefik` DaemonSet) re-originates the connection in its own pod netns
when forwarding to the Traefik Service's NodePort backend — `externalTrafficPolicy`
only governs the step after that, too late to help.

`kube-system/traefik` is a k3s-native Addon (`HelmChart` + `HelmChartConfig`
CRDs, reconciled by k3s' own `helm-controller`) — not Kustomize/GitOps-managed
and not directly steerable via a bare `helm upgrade --set` (such a change
would be silently overwritten on the next controller reconcile unless it's
also reflected in `HelmChartConfig/traefik`'s `valuesContent`). This is the
same resource T001328 touched; this change builds directly on its committed
`prod/traefik-values.yaml`.

## Goals / Non-Goals

**Goals:**
- Traefik's own pods receive the real external client IP, with no
  intermediate proxy re-origination.
- Minimal, chart-idiomatic diff: extend the file T001328 already committed
  rather than introduce a new networking mechanism or subsystem.
- Safe rollout for a cluster-wide, dual-brand-shared ingress resource:
  no silent traffic black hole during the change.

**Non-Goals:**
- Migrating away from k3s ServiceLB cluster-wide (e.g. to MetalLB) — out of
  scope; `klipper-lb` continues to exist as k3s' default mechanism for any
  *other* `type: LoadBalancer` Service that might be added later. This change
  only removes it for the Traefik Service specifically.
- PROXY-protocol passthrough — `klipper-lb:v0.4.17` has no env-var support
  for it per inspection of its container spec.
- Changing Traefik's rate-limiter middleware or Pocket ID's own
  `TRUST_PROXY` configuration — both are already correctly configured and
  unaffected by this change.
- Reproducing this fix in `k3d-mentolder-dev` — the local single-node Docker
  cluster never exhibited the cross-node SNAT bug T001328/T001341 address,
  and `hostPort` on real host NICs isn't meaningfully testable inside
  k3d's Docker network isolation.

## Decisions

**1. `ports.*.hostPort` (Traefik chart-native) over `hostNetwork: true`.**
Both eliminate the `klipper-lb` hop, but `hostPort` scopes the change to
exactly ports 80/443 — the pod keeps normal pod networking (cluster DNS,
normal NetworkPolicy selectors, no IPv6/dual-stack Service re-evaluation)
for everything else. `hostNetwork: true` was considered (see the
brainstorming session's Lavish board) and rejected for unnecessarily larger
blast radius: it would additionally require `dnsPolicy:
ClusterFirstWithHostNet` and a full re-evaluation of the pod's network
exposure, for no behavioral benefit over `hostPort` here.

**2. MetalLB rejected.** Initially proposed in the ticket. Live topology
check during brainstorming: DNS for `auth.mentolder.de` /
`auth.korczewski.de` / `mentolder.de` already round-robins directly across
the 3 public Hetzner node IPs — there is no shared/floating VIP need that
MetalLB would solve. MetalLB's L2Advertisement mode needs a shared L2
broadcast domain between nodes, generally not available across separate
rented Hetzner servers; BGP mode needs peering with Hetzner's network, not
offered for rented servers. MetalLB would add a new CRD-based subsystem
(speaker pods, IPAddressPool/L2Advertisement) to solve a problem this
cluster's topology doesn't have.

**3. Combine `service.spec.type: ClusterIP` and the `hostPort`/
`updateStrategy` rollout into a single `kubectl patch` (not two staged
steps).** T001328 staged its `helm upgrade` rollout in two manually-verified
steps (topology, then `externalTrafficPolicy`) specifically to avoid
`externalTrafficPolicy: Local`'s silent-drop risk on under-covered nodes —
that staging pattern doesn't transfer here. Splitting `service.spec.type`
(removes `klipper-lb`) from `ports.*.hostPort` (adds Traefik's own host bind)
would create a window where neither covers all 3 nodes: removing
`klipper-lb` first kills the old (working) entry point before the new one is
live anywhere; adding `hostPort` first leaves new Traefik pods `Pending`
(scheduler-rejected — `hostPort` already claimed by `klipper-lb` on that
node) until `klipper-lb` is gone. One combined values change minimizes that
window to ordinary controller-reconcile + DaemonSet-rollout latency (seconds,
not the multi-minute human-verification pause that left T001328's `ports`/
`updateStrategy` keys un-applied in the first place).

**4. Rollout mechanism: `kubectl patch helmchartconfig/traefik`, not `helm
upgrade traefik traefik/traefik --set ...`.** T001328's `tasks.md` documented
the latter; live inspection of `kube-system/traefik` in this ticket shows
it's a k3s Addon-managed `HelmChart`, reconciled by k3s' own
`helm-controller`, which merges `HelmChart.spec.valuesContent` with
`HelmChartConfig.spec.valuesContent` and performs its own internal `helm
upgrade`. A bare `helm upgrade --set` against the `helm` CLI would be
overwritten on the controller's next reconcile unless mirrored into
`HelmChartConfig`. This is very likely *why* `ports`/`updateStrategy` never
landed live from T001328 despite being committed in `prod/traefik-values.yaml`.

## Risks / Trade-offs

- **[Risk] Brief ingress gap during the combined apply, even with a single
  patch** → **Mitigation:** apply during low-traffic hours; watch the
  DaemonSet rolling update (`maxUnavailable: 1`, inherently sequential
  node-by-node) and verify the first rolled node (`curl --resolve` against
  its public IP + Pocket ID log check for real client IP) before the
  remaining 2 nodes are allowed to proceed; abort/rollback immediately on
  any anomaly.
- **[Risk] Rollback complexity** → **Mitigation:** rollback is a single
  `kubectl patch` reverting `service.spec.type` to `LoadBalancer` (k3s
  recreates `svclb-traefik` automatically) — the prior, known-working state.
  `ports.*.hostPort`/`updateStrategy` do not need to be reverted in isolation;
  they're harmless once `klipper-lb` is back (Traefik's pods simply also
  hold a hostPort binding that nothing routes to, since `klipper-lb` again
  owns the externally-reachable path).
- **[Risk] No CI/live-cluster verification path** → **Mitigation:** same
  constraint T001328 had — no live cluster in CI. BATS coverage is
  manifest-structure only; live behavior (real client IP, no scheduling
  conflicts) is verified manually per the Migration Plan below, exactly as
  T001328's Task 4 did.
- **[Trade-off] `externalTrafficPolicy: Local` becomes vestigial** under
  `type: ClusterIP` (the field only has effect for `LoadBalancer`/`NodePort`
  Services). Left in place rather than removed — harmless, and removing it
  is unrelated cleanup outside this change's scope.

## Migration Plan

1. Apply the combined `HelmChartConfig/traefik` patch (`service.spec.type:
   ClusterIP` + `ports.web.hostPort: 80` + `ports.websecure.hostPort: 443` +
   `updateStrategy`) via `kubectl patch helmchartconfig traefik -n
   kube-system --type merge -p '...'`.
2. Confirm `svclb-traefik` pods are gone:
   `kubectl -n kube-system get pods -l svccontroller.k3s.cattle.io/svcname=traefik`
   (expect zero results).
3. Watch the Traefik DaemonSet roll: `kubectl -n kube-system get pods -l
   app.kubernetes.io/name=traefik -o wide -w`.
4. After the **first** node's pod is `Running`/`Ready`: verify directly
   against that node's public IP (`curl --resolve auth.<brand>:443:<node-ip>
   ...`) and check Pocket ID logs for a real (non-`10.42.0.0/16`) client IP
   for a request made with a distinguishing User-Agent.
5. If verification passes, allow the rollout to proceed to nodes 2 and 3;
   repeat the same per-node check.
6. **Rollback (any step):** `kubectl patch helmchartconfig traefik -n
   kube-system --type merge -p '{"spec":{"valuesContent":"...service:\n
   spec:\n    type: LoadBalancer..."}}'` — restores `klipper-lb`, the prior
   known-working state.

## Open Questions

None outstanding — root cause, rejected alternatives, rollout mechanism, and
sequencing were all resolved during the brainstorming session preceding this
proposal (see `docs/superpowers/specs/2026-07-01-t001341-traefik-hostport-clientip-design.md`).
