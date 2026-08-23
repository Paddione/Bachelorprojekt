# k3d/

Base Kustomize manifests for all Workspace MVP services.
This directory is the single Kustomize base — production overlays
in `prod-fleet/<brand>/` extend it; never apply base or `prod/` directly.

## Key files

| File | Purpose |
|------|---------|
| `kustomization.yaml` | Root kustomization — lists all resources |
| `configmap-domains.yaml` | Centralised hostname definitions (edit here, not in service YAMLs) |
| `secrets.yaml` | Dev-only placeholder secrets (stripped by prod `$patch: delete`) |
| `ingress.yaml` | Traefik IngressRoutes for all services |
| `website.yaml` | Website Deployment + Service |
| `brett.yaml` | Systembrett Node.js Deployment |
| `llm-gpu.yaml` | LLM gateway Services pointing to GPU host |

## Sub-directories

| Directory | Purpose |
|-----------|---------|
| `coturn-stack/` | CoTURN TURN server (deployed separately via `task workspace:office:deploy`) |
| `dev-cluster/` | k3d local cluster setup resources |
| `dev-stack/` | Dev-only service additions |
| `docs-content-built/` | Pre-built HTML for the Docs service (do not edit manually) |
| `monitoring/` | Prometheus + Grafana manifests |

## hostNetwork-Pods & NetworkPolicy-Ausnahme

Vier Workloads laufen mit `hostNetwork: true` und umgehen damit bewusst die
ClusterWide NetworkPolicies — TURN/Signaling brauchen rohe UDP/TCP-Sockets,
die Traefik nicht routen kann:

| Manifest | Workload | hostPorts |
|----------|----------|-----------|
| `coturn-stack/coturn.yaml` | coturn | 3478, 5349, 49152-49252 |
| `coturn-stack/janus.yaml` | janus | 20000-20200, ws 8188 |
| `rustdesk-stack/hbbs.yaml` | hbbs | 21115-21116 tcp+udp, 21118 tcp |
| `rustdesk-stack/hbbr.yaml` | hbbr | 21117 tcp, 21119 tcp |

Containment: alle vier sind per `nodeSelector: kubernetes.io/hostname: ${TURN_NODE}`
auf einen dedizierten Public-Node gepinnt (`${TURN_NODE}` wird per envsubst im
Deploy-Pfad gesetzt, siehe `scripts/pre-deploy-checks-lib.sh`). Nextcloud und
Collabora sind separate, im Manifest begründete Ausnahmen (Root-Init-Container
bzw. User-Namespace-Sandboxing).

## Deployment

```bash
# Deploy to dev (k3d)
task workspace:deploy

# Deploy to production (fleet cluster)
task workspace:deploy ENV=mentolder
task workspace:deploy ENV=korczewski
```

Validate manifests before committing:

```bash
task workspace:validate
```
