# p2 — fleet-Proxy

Target files: `prod-fleet/mentolder/langfuse-dev-proxy.yaml`, `prod-fleet/mentolder/kustomization.yaml`.

Kontext: `design.md` D2, D3. Vorlage: `prod-fleet/mentolder/studio-ingress.yaml`.

### Task 1: `langfuse-dev-proxy.yaml`

Drei Objekte, Namespace `${WORKSPACE_NAMESPACE}`, Kopfkommentar mit Zweck und T900691:

1. Service `langfuse-dev-proxy`, kein `selector`, Port 80 (name `http`, TCP).
2. EndpointSlice `langfuse-dev-proxy-devmesh`, Label `kubernetes.io/service-name: langfuse-dev-proxy`,
   `addressType: IPv4`, Port `http`/80, drei Endpoints (je ein Eintrag mit `addresses: [<ip>]`):
   `100.115.236.87` (gpu-cluster), `100.126.111.105` (gpu-cluster2), `100.120.125.39` (gpu-metal).
3. Ingress `workspace-ingress-langfuse-dev`, Middlewares wie `studio-ingress.yaml`, `tls` mit
   Host `langfuse-dev.${PROD_DOMAIN}` und `secretName: ${TLS_SECRET_NAME}`, Regel `/` Prefix →
   `langfuse-dev-proxy:80`.

### Task 2: Overlay

`prod-fleet/mentolder/kustomization.yaml` → `resources`: `langfuse-dev-proxy.yaml` nach
`studio-ingress.yaml`.
