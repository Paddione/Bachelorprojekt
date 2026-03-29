# Architektur

## Systemübersicht

Das Homeoffice MVP ist eine Kubernetes-basierte Plattform (k3d/k3s), die vier Kerndienste hinter einem NGINX Ingress Controller bereitstellt. Alle Services laufen im Namespace `homeoffice` und werden durch zentrales Identity Management (Keycloak) per OIDC/SSO verbunden.

```
Browser
   │
   ├── auth.localhost ──────┐
   ├── chat.localhost ──────┤
   ├── files.localhost ─────┤
   ├── meet.localhost ──────┤
   │                        ▼
   │              ┌──────────────────┐
   │              │  NGINX Ingress   │  Reverse Proxy (k3d-managed)
   │              │  Controller      │
   │              └────────┬─────────┘
   │                       │
   │    ┌──────────────────┼──────────────────┬──────────────────┐
   │    ▼                  ▼                  ▼                  ▼
   │ ┌──────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
   │ │Keycloak  │  │ Mattermost   │  │  Nextcloud   │  │   Jitsi Web      │
   │ │  :8080   │  │   :8065      │  │    :80       │  │    :80           │
   │ └────┬─────┘  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘
   │      │               │                 │                    │
   │      ▼               ▼                 ▼                    │
   │ ┌──────────┐  ┌──────────────┐  ┌──────────────┐           │
   │ │  PG DB   │  │    PG DB     │  │    PG DB     │           │
   │ │  :5432   │  │    :5432     │  │    :5432     │           │
   │ └──────────┘  └──────────────┘  └──────────────┘           │
   │                                                             │
   │       ┌────────────────┐              ┌─────────────────────┼──────────┐
   │       │ mm-keycloak    │              ▼                     ▼          ▼
   │       │ -proxy :8081   │         ┌────────┐          ┌─────────┐ ┌────────┐
   │       │ (userinfo)     │         │Prosody │          │ Jicofo  │ │  JVB   │
   │       └────────────────┘         │ (XMPP) │          │         │ │:10000  │
   │                                  └────────┘          └─────────┘ └────┬───┘
   │                                                                       │
   │ ┌──────────────────────┐                                              │
   │ │ jitsi-keycloak       │                                              │
   │ │ -adapter :9000       │──── OIDC→JWT Bridge ─────────────────────────┘
   │ │ (/oidc)              │
   │ └──────────────────────┘
```

## Authentifizierungsfluss (OIDC / SSO)

```
Benutzer
   │
   ▼
Mattermost / Nextcloud / Jitsi
   │  "Mit Keycloak anmelden"
   ▼
Keycloak (OIDC Provider, Realm "homeoffice")
   │  Prüft Credentials gegen interne User-Datenbank
   ▼
Keycloak → ID-Token → Dienst erstellt lokale Session
```

1. Benutzer klickt "Mit Keycloak anmelden"
2. Redirect zu Keycloak (OIDC Authorization Code Flow)
3. Keycloak prüft Credentials gegen die interne User-Datenbank
4. Bei Erfolg: ID-Token mit Claims (email, username) an den Dienst
5. Dienst erstellt lokale Session

### Service-spezifische SSO-Anbindung

| Service | Methode | Besonderheit |
|---------|---------|-------------|
| Mattermost | GitLab OAuth-Protokoll | mm-keycloak-proxy übersetzt Keycloak-Userinfo auf GitLab-Format |
| Nextcloud | `oidc_login` App | Muss nach Erstdeployment manuell installiert werden |
| Jitsi | jitsi-keycloak-adapter | OIDC→JWT Bridge, alle User erhalten Moderator-Rechte |

## Kubernetes-Namespace

Alle Services laufen im Namespace `homeoffice`. Routing erfolgt über einen NGINX Ingress Controller (installiert via Helm). Domains sind zentral in `k3d/configmap-domains.yaml` konfiguriert — niemals Hostnamen hartcodieren.

| Domain | Service | Port |
|--------|---------|------|
| auth.localhost | Keycloak | 8080 |
| chat.localhost | Mattermost | 8065 |
| files.localhost | Nextcloud | 80 |
| meet.localhost | Jitsi Web + Keycloak Adapter (/oidc) | 80 / 9000 |

## Persistenz

| Service | Volume-Typ | Beschreibung |
|---------|-----------|-------------|
| Keycloak DB | PersistentVolumeClaim | `keycloak-db-data` |
| Mattermost DB | PersistentVolumeClaim | `mattermost-db-data` |
| Mattermost Uploads | PersistentVolumeClaim | `mattermost-data` |
| Nextcloud DB | PersistentVolumeClaim | `nextcloud-db-data` |
| Nextcloud Dateien | PersistentVolumeClaim | `nextcloud-data` |

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
