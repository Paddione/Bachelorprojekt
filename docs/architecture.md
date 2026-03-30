# Architektur

## Systemübersicht

Das Homeoffice MVP ist eine Kubernetes-basierte Plattform (k3d/k3s), die drei Kerndienste plus Talk HPB und Collabora hinter dem Traefik Ingress Controller (in k3s integriert) bereitstellt. Alle Services laufen im Namespace `homeoffice` und werden durch zentrales Identity Management (Keycloak) per OIDC/SSO verbunden.

```
Browser
   │
   ├── auth.localhost ──────────┐
   ├── chat.localhost ──────────┤
   ├── files.localhost ─────────┤
   ├── office.localhost ────────┤
   ├── signaling.localhost ─────┤
   │                            ▼
   │              ┌──────────────────────┐
   │              │  Traefik Ingress     │  Reverse Proxy (k3d-managed)
   │              │  Controller          │
   │              └──────────┬───────────┘
   │                         │
   │    ┌────────────────────┼──────────────────┬───────────────────┐
   │    ▼                    ▼                  ▼                   ▼
   │ ┌──────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐
   │ │Keycloak  │  │ Mattermost   │  │  Nextcloud   │  │  Collabora      │
   │ │  :8080   │  │   :8065      │  │  + Talk :80  │  │  Online :9980   │
   │ └────┬─────┘  └──────┬───────┘  └──────┬───────┘  └─────────────────┘
   │      │               │                 │
   │      ▼               ▼                 ▼
   │ ┌──────────┐  ┌──────────────┐  ┌──────────────┐
   │ │  PG DB   │  │    PG DB     │  │    PG DB     │
   │ │  :5432   │  │    :5432     │  │    :5432     │
   │ └──────────┘  └──────────────┘  └──────────────┘
   │
   │       ┌────────────────┐         ┌───────────────────────────────┐
   │       │ mm-keycloak    │         │  Talk High Performance Backend │
   │       │ -proxy :8081   │         │                               │
   │       │ (userinfo)     │         │  spreed-signaling :8080       │
   │       └────────────────┘         │       ▼                       │
   │                                  │  Janus :8188 (WebRTC SFU)     │
   │                                  │  NATS :4222 (Message Bus)     │
   │                                  │  coturn :3478 (TURN/STUN)     │
   │                                  └───────────────────────────────┘
```

## Authentifizierungsfluss (OIDC / SSO)

```
Benutzer
   │
   ▼
Mattermost / Nextcloud (+ Talk)
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
| Talk | Nextcloud-OIDC-Session | Erbt SSO automatisch von Nextcloud — kein separater Adapter nötig |

## Kubernetes-Namespace

Alle Services laufen im Namespace `homeoffice`. Routing erfolgt über den Traefik Ingress Controller (in k3s integriert). Domains sind zentral in `k3d/configmap-domains.yaml` konfiguriert — niemals Hostnamen hartcodieren.

| Domain | Service | Port |
|--------|---------|------|
| auth.localhost | Keycloak | 8080 |
| chat.localhost | Mattermost | 8065 |
| files.localhost | Nextcloud (+ Talk) | 80 |
| office.localhost | Collabora Online | 9980 |
| signaling.localhost | Talk HPB (spreed-signaling) | 8080 |

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
