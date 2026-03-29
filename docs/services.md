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

- OIDC-Clients für Mattermost, Nextcloud und Jitsi (Secrets aus `k3d/secrets.yaml`)
- Integrierte Benutzerverwaltung (Keycloak als alleiniger User Store)
- Brute-Force-Schutz und E-Mail-Login

Details: [Keycloak & SSO](keycloak.md)

## Mattermost (Chat)

| Eigenschaft | Wert |
|------------|------|
| Deployment | `mattermost` + `mattermost-db` |
| Image | `mattermost/mattermost-enterprise-edition:9.7` + `postgres:16-alpine` |
| Port | 8065 (via Ingress auf `chat.localhost`) |
| Funktion | Chat, Channels, Dateifreigabe, Jitsi-Integration |

Mattermost ist die Chat-Plattform (Slack-Alternative). Login erfolgt per Keycloak SSO über das GitLab-OAuth-Protokoll — der `mm-keycloak-proxy` übersetzt Keycloak-Userinfo ins GitLab-Format.

**Zusatz-Komponente:** `mm-keycloak-proxy` (NGINX, Port 8081) — übersetzt `/userinfo`-Responses und leitet `/token`-Anfragen weiter.

## Nextcloud (Dateien)

| Eigenschaft | Wert |
|------------|------|
| Deployment | `nextcloud` + `nextcloud-db` |
| Image | `nextcloud:28-apache` + `postgres:16-alpine` |
| Port | 80 (via Ingress auf `files.localhost`) |
| Funktion | Dateisynchronisation, Kalender, Kontakte |

Nextcloud ist die Datei-Plattform (Google Drive-Alternative). Login per Keycloak SSO über die `oidc_login` App.

**Wichtig:** Nach dem ersten Deployment muss die OIDC-App manuell installiert werden:
```bash
kubectl exec -n homeoffice deploy/nextcloud -- php occ app:install oidc_login
```

## Jitsi (Videokonferenzen)

Jitsi besteht aus fünf Deployments:

| Deployment | Image | Funktion |
|------------|-------|----------|
| `jitsi-web` | `jitsi/web:stable-9111` | Web-Frontend |
| `jitsi-prosody` | `jitsi/prosody:stable-9111` | XMPP-Server (Signaling) |
| `jitsi-jicofo` | `jitsi/jicofo:stable-9111` | Conference Focus (Steuerung) |
| `jitsi-jvb` | `jitsi/jvb:stable-9111` | Videobridge (Media, UDP 10000) |
| `jitsi-keycloak-adapter` | `ghcr.io/nordeck/jitsi-keycloak-adapter-v2` | OIDC→JWT Bridge |

Der `jitsi-keycloak-adapter` übersetzt Keycloak OIDC-Tokens in Jitsi-kompatible JWTs. Alle authentifizierten Benutzer erhalten automatisch Moderator-Rechte.

**Routing:** `meet.localhost/oidc/*` → Adapter, `meet.localhost/*` → Jitsi Web

## Service-Abhängigkeiten

```
Keycloak-DB → Keycloak
                  │
    ┌─────────────┼─────────────────┐
    ▼             ▼                 ▼
MM-DB → Mattermost    NC-DB → Nextcloud
    │
    ▼
mm-keycloak-proxy (Userinfo-Übersetzung)

Prosody → Jicofo → JVB → Jitsi-Web
                          │
                          ▼
              jitsi-keycloak-adapter (OIDC→JWT)

NGINX Ingress Controller (routet alle *.localhost Domains)
```
