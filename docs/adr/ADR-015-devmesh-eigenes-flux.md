# ADR-015: devmesh mit eigenem Flux, Dev-Stack weg von fleet

**Status:** Accepted  
**Datum:** 2026-10-21  
**Ticket / Feature:** `devmesh-flux`  
**Supersedes:** [ADR-008](ADR-008-local-k3s-dev-mesh.md) (Punkt 2 „workspace-dev auf fleet bleibt“) und entscheidet SP-3 („GitOps: flux-Branch vs. push-task“)

## Kontext

Der fleet-Cluster auf Hetzner wird durch Gekko nach Runbook gekko32/mentolder-prod#18 neu aufgesetzt. Nach diesem Neuaufbau läuft auf fleet nichts mehr aus dem Repository `Paddione/Bachelorprojekt` (vollständige organisatorische und technische Trennung).

Der Entwicklungs-Stack, der bisher auf fleet im Namespace `workspace-dev` lief (`flux-dev` und `flux-dev-pod` mit `website:dev`, `sdlc-console`, `sish`, `oauth2-proxy-dev`, `shared-db-dev`, `dev-pod`), verliert damit seine Host-Umgebung. Gleichzeitig wurde der lokale bare-metal k3s-Cluster `devmesh` bisher manuell per `task devmesh:deploy` aus der lokalen Arbeitskopie betrieben, ohne GitOps-Automatisierung.

## Entscheidungen

### D1: Eigenes Flux auf devmesh aus OCI-Artefakt
- `devmesh` erhält eine eigene Flux-Installation via flux-operator (`flux/clusters/devmesh/flux-instance.yaml`, Sync `GitRepository` auf `path: flux/clusters/devmesh`).
- Der gesamte devmesh-Stack synchronisiert sich über ein eigenes, privates und signiertes OCI-Artefakt `ghcr.io/paddione/devmesh-manifests:latest` (`OCIRepository` `devmesh-manifests`).
- Das Artefakt wird in GitHub Actions keyless via Cosign signiert (`.github/workflows/render-devmesh-artifact.yml`).
- Drei getrennte Kustomizations steuern die Ausrollreihenfolge: `devmesh-platform` (`./platform`), `devmesh-secrets` (`./secrets`, dependsOn platform) und `devmesh-workspace` (`./workspace`, dependsOn secrets).

### D2: Dev-Stack zieht nach devmesh um, Abbau auf fleet
- Keine Kustomization `flux-dev` oder `flux-dev-pod` verbleibt auf fleet.
- `dev-pod` zieht als Komponente nach devmesh (`dev-local/components/dev-pod`, Namespace `workspace`).
- `dev-pod` nutzt die shared PostgreSQL-Datenbank auf devmesh (`shared-db.workspace.svc.cluster.local`) anstelle der separaten `shared-db-dev`.
- SSH-Zugriff auf `dev-pod` erfolgt ausschließlich über das Tailnet per Service mit `tailscale.com/expose: "true"` (Hostname `dev-pod`), ohne öffentliche Portfreigaben oder Firewall-Sonderregeln (`DEV_SSH_ALLOWLIST` entfällt).
- Vor dem Löschen der fleet-Kustomizations werden die Daten der PVCs `dev-pod-home` und `dev-pod-repo` per Hilfs-Pod gestreamt und mit Prüfsummen abgeglichen.

### D3: Konsolidierung der Render-Pfade
- `scripts/devmesh/render-stack.sh` wird um die Option `--out <dir>` erweitert und ist die einzige autoritative Render-Logik für devmesh.
- Plattform-Manifeste (cert-manager, lego-webhook, sealed-secrets-controller, TLS) werden als deklarative Flux-Ressourcen unter `dev-local/platform/` geführt.
- `task devmesh:deploy` bleibt ausschließlich als manueller Notfallweg (Break-Glass) erhalten und bricht ab, solange nicht-suspendierte Kustomizations in `flux-system` existieren (Override `FORCE=1`).

## Folgen und Konsequenzen

### Positive Konsequenzen
- **Vollständige Unabhängigkeit von fleet und mentolder.de:** Kein devmesh-Manifest enthält Referenzen auf fleet oder mentolder.
- **GitOps auf devmesh:** Deklarative Zustellung des gesamten lokalen Stacks mit kryptografischer Supply-Chain-Prüfung (Cosign OIDC).
- **Entscheidung von SP-3:** Die in ADR-008 offengelassene Frage „GitOps (flux-Branch vs. push-task)“ ist zugunsten eines OCI-gestützten Flux-Modells entschieden.

### Einschränkungen / Folge-Features
- **Erreichbarkeit vorerst nur LAN/Tailnet:** `sish`, `oauth2-proxy-brainstorm` und `oauth2-proxy-session-hub` entfallen zunächst, da devmesh vorerst keinen öffentlichen Zugang hat.
- Öffentlicher Zugang für die eigene Prod-Website und brainstorm wird in einem separaten Folge-Feature umgesetzt (DynDNS / ipv64 oder Tailscale Funnel).
