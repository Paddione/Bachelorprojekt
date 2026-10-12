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
# Deploy to dev (devmesh)
task workspace:deploy

# Deploy to production (fleet cluster)
task workspace:deploy ENV=mentolder
task workspace:deploy ENV=korczewski
```

Validate manifests before committing:

```bash
task workspace:validate
```

## Nur via Task deployen (kein direktes `kubectl apply`)

Die Manifeste in diesem Verzeichnis sind **keine** direkt applizierbaren Dateien.
Sie enthalten zwei Platzhalter-Arten, die nur der Task/Flux-Render-Pfad
(`kustomize build` → `envsubst` → `$$`-Kollaps, siehe `task workspace:deploy`,
`task website:deploy`, `scripts/flux-render-artifact.sh`) korrekt aufloest:

| Platzhalter | Bedeutung | Direktes `kubectl apply -f` |
|-------------|-----------|------------------------------|
| `${VAR}` | Deploy-Zeit-Variable (Namespaces, Domains, `POD_CIDR`/`SERVICE_CIDR`, Images) | bleibt literal stehen — ungueltige Felder wie `cidr: ${POD_CIDR}` |
| `$${VAR}` / `$$VAR` | Laufzeit-Variable — die Shell **im Container** soll sie expandieren | `$$` bleibt stehen, die Shell expandiert zur PID (`$${HOST}` → `1API`-Muell, T901777; DB-Passwoerter → `<PID>{VAR}`, T001673) |

Regeln:

- Manifeste **nur** via `task workspace:deploy`, `task website:deploy`,
  `task devmesh:deploy` oder den Flux-Render deployen. `k3d/deploy.sh`
  (legacy, direktes `kubectl apply -k .`) ist fail-closed abgeschaltet.
- Neue `$${...}`-Escapes nur in Dateien, die durch einen Render-Pfad mit
  `$$`-Kollaps laufen (`workspace:deploy`, Flux, `devmesh:deploy`, Prod-Zweig
  von `website:deploy`). Der Dev-Zweig von `website:deploy` hat **keinen**
  Kollaps — `k3d/website.yaml` darf deshalb keine `$${...}`-Escapes enthalten
  (Guard-Test: `tests/py/spec/test_k3d_netpol_cidrs.py`).
- Dateien mit `$${...}`-Escapes tragen den Kopf-Kommentar `NUR VIA TASK
  DEPLOYEN` — derselbe Guard-Test prueft das fail-closed.

Cluster-CIDRs (`POD_CIDR`/`SERVICE_CIDR`/`POD_VTEP_IP`, [T901777]): Die
NetworkPolicies in `network-policies.yaml` und `website.yaml` beziehen Pod-
und Service-CIDR aus der Umgebung (`environments/schema.yaml`). k3s-Default
ist `10.42.0.0/16`/`10.43.0.0/16` (alle Fleet-Cluster); devmesh nutzt
`10.52.0.0/16`/`10.53.0.0/16` (ADR-008, `environments/dev.yaml`). Vor T901777
waren die k3s-Werte hardcoded — ein Deploy auf devmesh haette den dortigen
Live-Fix (Connection-Refused durch kube-router-REJECT bei default-deny)
still ueberschrieben.
