## Why

T001328 (`externalTrafficPolicy: Local`) sollte den netzwerkweiten 429-Bug von
Pocket ID beheben (alle Client-IPs erscheinen als dieselbe Pseudo-IP), wurde
gemerged und live ausgerollt — der Bug besteht live weiter. Live-Verifikation
in diesem Ticket zeigt den echten Root Cause: k3s' ServiceLB (klipper-lb)
re-originiert die Verbindung beim Forward zur NodePort-Backend-IP in der
eigenen Pod-Netns und verliert dabei die echte Client-IP, **bevor**
`externalTrafficPolicy` überhaupt greift. Ohne diesen Fix bleibt das
Rate-Limiting für Pocket ID (und potenziell jeden anderen Service hinter
Traefik, der nach Client-IP unterscheidet) für beide Brands unbrauchbar.

## What Changes

- `prod/traefik-values.yaml`: `service.spec.type: ClusterIP` ergänzt — entfernt
  klipper-lb (`svclb-traefik`-DaemonSet) für den Traefik-Service vollständig,
  da k3s' ServiceLB-Controller nur auf `type: LoadBalancer`-Services reagiert.
- Traefiks eigene Pods binden Port 80/443 direkt per `ports.web.hostPort` /
  `ports.websecure.hostPort` (bereits in der Datei committed seit T001328,
  aber nie live ausgerollt) — einzelner DNAT-Hop statt klipper-lbs
  zweistufigem Re-Origination-Design, Client-IP bleibt erhalten.
- `tests/spec/fleet-operations.bats`: 3 neue `@test`-Blöcke (Service-Type,
  hostPort×2, updateStrategy) als Manifest-Struktur-Regressionsschutz.
- Manueller Produktions-Rollout gegen den laufenden Fleet-Cluster (kein
  GitOps für dieses Helm-verwaltete k3s-Addon) — kombinierter
  `kubectl patch helmchartconfig/traefik`, nicht zwei getrennte Schritte
  (vermeidet das Outage-Fenster, das die ursprüngliche Lücke verursacht hat).
- **BREAKING (operational, nicht API):** `kube-system/traefik` Service wechselt
  von `type: LoadBalancer` auf `type: ClusterIP` — klipper-lb verschwindet als
  sichtbare Komponente im Cluster. Kein Effekt auf DNS/öffentliche Erreichbarkeit
  (DNS zeigt bereits direkt auf die 3 Node-IPs, nicht auf eine LB-VIP).

## Capabilities

### New Capabilities

(keine — reine Bugfix-Erweiterung einer bestehenden Komponente)

### Modified Capabilities

- `fleet-operations`: Die Traefik-Ingress-Topologie-Requirements werden um die
  Anforderung erweitert, dass Traefik die reale Client-IP ohne ServiceLB-
  Zwischenschritt erhält (Service-Type + hostPort-Bind), zusätzlich zur
  bestehenden DaemonSet/Node-Affinity/`externalTrafficPolicy`-Anforderung aus
  T001328.

## Impact

- **Betroffen:** `kube-system/traefik` (shared, beide Brands: `workspace` +
  `workspace-korczewski`), `prod/traefik-values.yaml`,
  `tests/spec/fleet-operations.bats`.
- **Nicht betroffen:** Dev/k3d (`k3d/traefik-config.yaml`, separates
  HelmChartConfig, kein klipper-lb-Bug dort — Single-Node-Cluster). Andere
  Services hinter Traefik (Mailpit, Nextcloud, Vaultwarden, etc.) ändern sich
  nicht funktional, laufen weiter über denselben Traefik-Entrypoint.
- **Blast Radius:** Cluster-weiter Ingress-Pfad für BEIDE Brands gleichzeitig
  — manueller Rollout-Schritt mit Canary-Verifikation und Rollback-Plan
  (siehe `tasks.md` Task 4 / Design-Spec).
- **Verworfene Alternativen:** MetalLB (Topologie braucht keine geteilte VIP
  — DNS round-robint bereits über die 3 Public-Node-IPs direkt; MetalLB
  L2/BGP für separate gemietete Hetzner-Server nicht sauber nutzbar),
  PROXY-Protocol (klipper-lb:v0.4.17 unterstützt es laut Env-Var-Inspektion
  nicht).
