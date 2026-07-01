# Proposal: pocket-id-migration

## Why

Keycloak drives ~512 MB of steady-state RAM and pulls in a full realm/mapper system that has to be re-synced on every config change. Pocket ID replaces it with a lean Go binary (~50 MB) that speaks OIDC natively, has a passkey-first UX, and exposes a simple Admin REST API. The migration is split into 4 sequential waves with rollback open until Welle 3 (Keycloak scale-down).

## What

Replace Keycloak with two independent Pocket ID instances — `pocket-id` Deployment in `workspace` (→ `id.mentolder.de`) and in `workspace-korczewski` (→ `id.korczewski.de`), each backed by its own database in the shared PostgreSQL (`pocket_id`, namespace-isolated per brand). Keycloak stays live on `auth.<domain>` for the whole migration. Migration proceeds in sequential waves:

- **Welle 0** — Pocket ID deployen & konfigurieren (`k3d/pocket-id.yaml`, schema, envsubst)
- **Welle 1** — 12 oauth2-proxy-Services auf Pocket ID umschwenken (config-only)
- **Welle 2** — Custom-Integrationen (Website identity.ts, Nextcloud, Grafana, Brett)
- **Welle 3** — Keycloak Shutdown (nach 14+7 Tagen Beobachtung)

Plus automated coverage: BATS spec + 3 E2E auth specs targeting the Pocket ID endpoints.

_Ticket: T001068_
