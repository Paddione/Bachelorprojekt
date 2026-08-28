# Proposal: add-penpot-service

## Why

Penpot ist die open-source Alternative zu Figma und soll als interner Design- und Prototyping-Service in der Workspace-Plattform verfügbar sein. Es ermöglicht Designer und Entwickler, gemeinsam an UI-Prototypen zu arbeiten, Design-Systeme zu pflegen und Assets auszutauschen. Penpot wird wie die anderen Workspace-Services (Vaultwarden, Brett, Studio) über Pocket ID OIDC authentifiziert und in den Admin-Navigationseintrag "Werkzeuge" integriert.

## What Changes

1. **Penpot Kubernetes-Manifeste** (k3d/ + prod-fleet-Overlay): Deployment mit drei Containern (Backend, Frontend, Gateway) in einem Pod, MinIO als Object Storage (eigenes Deployment mit PVC), Service-Routing. Penpot nutzt die shared-db PostgreSQL für seine Metadaten (eigene Role `penpot`).

2. **Pocket-ID OIDC-Client**: Penpot kommuniziert direkt mit Pocket ID (wie Vaultwarden), kein oauth2-proxy Sidecar. OIDC-Client wird vom `pocket-id-client-seed`-Job provisioniert.

3. **Domain `design.<PROD_DOMAIN>`**: Neue Domain-Registry-Einträge in `k3d/configmap-domains.yaml` (dev: `design.localhost`) und Fleet-Overlay-Produktionswerte. IngressRoute für `design.*` → Penpot Gateway.

4. **Admin-Navigation**: "Penpot"-Link in die "Werkzeuge"-Sektion der Admin-Sidebar (wie "Systembrett", als externer Link zur design-Domain).

5. **BATS-Test**: Assertions für neue Manifeste, Domain-Keys, Pocket-ID-Client-Konfiguration und Ingress-Routing.

6. **Helm-Chart manuell konvertiert**: Das offizielle Penpot Helm-Chart dient als Referenz, alle YAMLs werden manuell als raw Kubernetes-Manifeste geschrieben (konsistent mit dem Repo-Pattern, keine Helm-Abhängigkeit).

## Architektur-Entscheidungen

- **Datenbank**: shared-db mit eigener Penpot-Role (wie Vaultwarden/Nextcloud) — spart Resources, folgt dem bestehenden Pattern.
- **Object Storage**: MinIO als eigenständiges Deployment mit PVC (Penpot benötigt MinIO als integralen Bestandteil; kein externes Shared-MinIO verfügbar).
- **Auth**: Direkte Pocket-ID OIDC-Kommunikation (wie Vaultwarden) — keine oauth2-proxy Zwischenschicht.
- **Ressourcen (Prod)**: Backend 2GB RAM / 1 CPU, Frontend 512MB RAM / 250m CPU, Gateway 128MB RAM / 50m CPU, MinIO 512MB RAM / 250m CPU.
- **Namespace**: `workspace` (wie alle anderen Services).

## Impact

- Affected specs: `auth-sso`, `vaultwarden-integration` (als Muster), `repo-structure`
- Affected code: `k3d/penpot.yaml`, `k3d/penpot-ingress.yaml`, `k3d/configmap-domains.yaml`, `k3d/ingress.yaml`, `k3d/pocket-id-client-seed.yaml`, `k3d/shared-db.yaml`, `components/website/src/lib/admin/nav-items.ts`, `prod-fleet/` Overlays
- Neue Dependencies: MinIO Deployment, Penpot Docker Images (penpot/server:latest, penpot/frontend:latest)

_Ticket: T016593_
