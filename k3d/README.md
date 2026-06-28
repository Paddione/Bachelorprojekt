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
| `livekit.yaml` | LiveKit server (hostNetwork, pinned to pk-hetzner-4) |
| `llm-gpu.yaml` | LLM gateway Services pointing to GPU host |

## Sub-directories

| Directory | Purpose |
|-----------|---------|
| `coturn-stack/` | CoTURN TURN server (deployed separately via `task workspace:office:deploy`) |
| `dev-cluster/` | k3d local cluster setup resources |
| `dev-stack/` | Dev-only service additions |
| `docs-content-built/` | Pre-built HTML for the Docs service (do not edit manually) |
| `monitoring/` | Prometheus + Grafana manifests |

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
