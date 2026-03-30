# Services

Übersicht aller Kubernetes-Deployments im Homeoffice MVP (Namespace `homeoffice`).

## Keycloak (SSO / Identity Provider)

| Eigenschaft | Wert |
|------------|------|
| Deployment | `keycloak` + `keycloak-db` |
| Image | `quay.io/keycloak/keycloak:24.0` + `postgres:16-alpine` |
| Port | 8080 (via Ingress auf `auth.localhost`) |
| Funktion | Single Sign-On via OpenID Connect |

Keycloak ist der zentrale Identity Provider. Beim ersten Start wird der Realm `homeoffice` aus `realm-homeoffice-dev.json` importiert (via `import-entrypoint.sh`). Der Realm enthält:

- OIDC-Clients für Mattermost und Nextcloud (Secrets aus `k3d/secrets.yaml`)
- Integrierte Benutzerverwaltung (Keycloak als alleiniger User Store)
- Brute-Force-Schutz und E-Mail-Login

Details: [Keycloak & SSO](keycloak.md)

## Mattermost (Chat)

| Eigenschaft | Wert |
|------------|------|
| Deployment | `mattermost` + `mattermost-db` |
| Image | `mattermost/mattermost-enterprise-edition:9.7` + `postgres:16-alpine` |
| Port | 8065 (via Ingress auf `chat.localhost`) |
| Funktion | Chat, Channels, Dateifreigabe |

Mattermost ist die Chat-Plattform (Slack-Alternative). Login erfolgt per Keycloak SSO über das GitLab-OAuth-Protokoll — der `mm-keycloak-proxy` übersetzt Keycloak-Userinfo ins GitLab-Format.

**Zusatz-Komponente:** `mm-keycloak-proxy` (NGINX, Port 8081) — übersetzt `/userinfo`-Responses und leitet `/token`-Anfragen weiter.

## Nextcloud (Dateien)

| Eigenschaft | Wert |
|------------|------|
| Deployment | `nextcloud` + `nextcloud-db` |
| Image | `nextcloud:28-apache` + `postgres:16-alpine` |
| Port | 80 (via Ingress auf `files.localhost`) |
| Funktion | Dateisynchronisation, Kalender, Kontakte, Videokonferenzen (Talk), Dokumentenbearbeitung (Collabora) |

Nextcloud ist die Datei-Plattform (Google Drive-Alternative). Login per Keycloak SSO über die `oidc_login` App. Nextcloud Talk bietet Videokonferenzen — SSO wird automatisch über die Nextcloud-OIDC-Session vererbt (kein separater Adapter nötig).

**Wichtig:** Nach dem ersten Deployment müssen die Apps manuell installiert werden:
```bash
kubectl exec -n homeoffice deploy/nextcloud -- php occ app:install oidc_login
kubectl exec -n homeoffice deploy/nextcloud -- php occ app:install spreed
kubectl exec -n homeoffice deploy/nextcloud -- php occ app:install richdocuments
```

## Nextcloud Talk HPB (Videokonferenzen)

Talk nutzt das High Performance Backend (HPB) für Calls mit mehr als 5 Teilnehmern:

| Deployment | Image | Funktion |
|------------|-------|----------|
| `spreed-signaling` | `strukturag/nextcloud-spreed-signaling:1.2.4` | WebRTC-Signaling (SFU-Koordination) |
| `janus` | `canyan/janus-gateway:0.14.3` | WebRTC Gateway (Media-Forwarding) |
| `nats` | `nats:2.10-alpine` | Interner Message Bus |
| `coturn` | `coturn/coturn:4.6-alpine` | TURN/STUN Server (NAT-Traversal) |

**Routing:** `signaling.localhost` → spreed-signaling (intern via `http://spreed-signaling:8080`)

## Collabora Online (Dokumentenbearbeitung)

| Eigenschaft | Wert |
|------------|------|
| Deployment | `collabora` |
| Image | `collabora/code:24.04` |
| Port | 9980 (via Ingress auf `office.localhost`) |
| Funktion | Kollaborative Dokumentenbearbeitung (WOPI-Integration mit Nextcloud) |

Collabora ermöglicht Echtzeit-Zusammenarbeit an Dokumenten direkt in Nextcloud — auch während laufender Talk-Videocalls.

## Service-Abhängigkeiten

```
Keycloak-DB → Keycloak
                  │
    ┌─────────────┼─────────────────┐
    ▼             ▼                 ▼
MM-DB → Mattermost    NC-DB → Nextcloud ←── Collabora (WOPI)
    │                          │
    ▼                          ├── Talk (spreed App)
mm-keycloak-proxy              │
(Userinfo-Übersetzung)         ▼
                          spreed-signaling ← Janus ← NATS
                               │
                               ▼
                            coturn (TURN/STUN)

Traefik Ingress Controller (routet alle *.localhost Domains)
```
