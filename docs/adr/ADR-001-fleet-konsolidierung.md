# ADR-001: Fleet-Konsolidierung — Zusammenführung aller Marken-Cluster (Phase 3)

**Status:** Accepted  
**Datum:** 2026-05-31  
**Ticket:** T001298

## Kontext

Bis Mai 2026 betrieb das Projekt drei separate k3s-Cluster:

- `mentolder-standalone` auf gekko-hetzner-2/3/4
- `korczewski-standalone` auf pk-hetzner-4/6/8 (später dekommissioniert in Phase 2)
- `k3s-1` (Einzelknoten, permanent ausgefallen: Speicherfehler 2026-05-31)

Drei getrennte Cluster bedeuteten dreifachen Betriebsaufwand: separate Sealed-Secrets-Controller, separate cert-manager-Installationen, separate Keycloak-Instanzen und getrennte Deployments für jede Aktualisierung. Der k3s-1-Ausfall beschleunigte die Entscheidung.

## Entscheidung

Alle Workloads werden in einem einzigen Fleet-Cluster konsolidiert. Der Cluster besteht aus drei Control-Plane-Nodes (pk-hetzner-4/6/8) und drei Worker-Nodes (die ehemaligen mentolder-standalone-Knoten gekko-hetzner-2/3/4). Beide Marken (mentolder, korczewski) laufen als getrennte Namespaces (`workspace`, `workspace-korczewski`) im selben Cluster. Lokale Entwicklung erfolgt weiterhin via k3d (`k3d-mentolder-dev`).

## Konsequenzen

**Positive Konsequenzen:**
- Betriebsaufwand halbiert: ein Sealed-Secrets-Controller, ein cert-manager, eine Traefik-Instanz.
- Ressourcennutzung verbessert: Worker-Nodes aus dem dekomiissionierten mentolder-Cluster sind vollständig nutzbar.
- Einfachere Wartung: eine kubeconfig (`fleet`), ein Deployment-Kontext.

**Negative Konsequenzen:**
- Stärkere Kopplung: ein Cluster-Ausfall betrifft beide Marken gleichzeitig.
- Cross-brand-Isolation nur auf Namespace-Ebene, nicht auf Cluster-Ebene.
- LiveKit muss per `nodeAffinity` auf pk-hetzner-4 gepinnt werden (hostNetwork + stabile IP).

**Tote Kontexte (nie mehr verwenden):** `mentolder`, `korczewski` (alle kubeconfigs außer `fleet` und `k3d-mentolder-dev` sind ungültig).
