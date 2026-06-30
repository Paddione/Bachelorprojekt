## ADDED Requirements

### Requirement: Traefik Delivers the Real Client IP Without a ServiceLB Hop
The shared `kube-system/traefik` Service on the fleet cluster SHALL deliver the
real external client IP to backend services without an intermediate
re-originating proxy hop. The Service SHALL NOT be of `type: LoadBalancer`
(which causes k3s' ServiceLB/`klipper-lb` to manage it); Traefik's own
DaemonSet pods SHALL bind ports 80 and 443 directly via `hostPort` on each of
the 3 public Hetzner nodes.

#### Scenario: Service type prevents klipper-lb from managing the Traefik Service
- **WHEN** `prod/traefik-values.yaml` is inspected
- **THEN** `service.spec.type` is `ClusterIP`
- **AND** no `svclb-traefik` DaemonSet pods exist in `kube-system` on the fleet cluster

#### Scenario: Traefik pods bind host ports directly
- **WHEN** `prod/traefik-values.yaml` is inspected
- **THEN** `ports.web.hostPort` is `80` and `ports.websecure.hostPort` is `443`

#### Scenario: Real client IP reaches backend services
- **WHEN** an external client sends a request to `auth.${PROD_DOMAIN}` with a
  distinguishing User-Agent
- **THEN** Pocket ID's access logs show the client's real external IP
  (not a `10.42.0.0/16` pod-CIDR address belonging to a ServiceLB pod)

### Requirement: Traefik DaemonSet Rolling Update Avoids hostPort Conflicts
Because `hostPort`-bound pods cannot share a port on the same node, the
Traefik DaemonSet's update strategy SHALL evict the old pod on a node before
scheduling its replacement there.

#### Scenario: Rolling update strategy prevents same-node port collisions
- **WHEN** `prod/traefik-values.yaml` is inspected
- **THEN** `updateStrategy.rollingUpdate.maxUnavailable` is `1`
- **AND** `updateStrategy.rollingUpdate.maxSurge` is `0`
