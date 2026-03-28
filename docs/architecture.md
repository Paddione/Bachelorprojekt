# Architektur

## Systemübersicht

Das Homeoffice MVP ist eine Docker Compose-basierte Plattform mit sechs Kerndiensten hinter einem Reverse Proxy. Alle Services teilen sich ein Docker-Netzwerk (`homeoffice`) und werden durch zentrales Identity Management (Keycloak) verbunden.

```
Internet
   │
   ├── Port 80/TCP ──┐
   ├── Port 443/TCP ─┤
   │                  ▼
   │            ┌──────────┐
   │            │ Traefik  │  Reverse Proxy + Auto-HTTPS (Let's Encrypt)
   │            └────┬─────┘
   │                 │
   │    ┌────────────┼────────────┬──────────────┐
   │    ▼            ▼            ▼              ▼
   │ ┌──────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
   │ │Matte-│  │Nextcloud │  │Keycloak  │  │  Jitsi   │
   │ │rmost │  │  :80     │  │  :8080   │  │  Web     │
   │ │:8065 │  │          │  │          │  │          │
   │ └──┬───┘  └────┬─────┘  └────┬─────┘  └────┬─────┘
   │    │           │             │              │
   │    ▼           ▼             ▼              │
   │ ┌──────┐  ┌──────────┐  ┌──────────┐       │
   │ │PG DB │  │  PG DB   │  │  PG DB   │       │
   │ │:5432 │  │  :5432   │  │  :5432   │       │
   │ └──────┘  └──────────┘  └──────────┘       │
   │                                             │
   │                              ┌──────────────┼──────────┐
   │                              ▼              ▼          ▼
   │                         ┌────────┐   ┌─────────┐ ┌────────┐
   │                         │Prosody │   │ Jicofo  │ │  JVB   │
   │                         │ (XMPP) │   │         │ │:10000  │
   │                         └────────┘   └─────────┘ └────┬───┘
   │                                                       │
   └── Port 10000/UDP ────────────────────────────────────-┘

┌──────────┐         ┌──────────┐
│ DuckDNS  │         │  Backup  │
│ Updater  │         │ (rclone) │
│ alle 5m  │         │ 02:00UTC │
└──────────┘         └──────────┘
```

## Authentifizierungsfluss (OIDC / SSO)

```
Benutzer
   │
   ▼
Mattermost / Nextcloud
   │  "Mit Keycloak anmelden"
   ▼
Keycloak (OIDC Provider)
   │  Prüft Credentials gegen interne User-Datenbank
   ▼
Keycloak → ID-Token → Mattermost / Nextcloud
```

1. Benutzer klickt "Mit Keycloak anmelden"
2. Redirect zu Keycloak (OIDC Authorization Code Flow)
3. Keycloak prüft Credentials gegen die interne User-Datenbank
4. Bei Erfolg: ID-Token mit Claims (email, username) an den Dienst
5. Dienst erstellt lokale Session

## Docker-Netzwerk

Alle Services laufen im Docker-Bridge-Netzwerk `homeoffice`. Nur zwei Ports sind nach außen exponiert:

| Port | Protokoll | Service | Grund |
|------|-----------|---------|-------|
| 80 | TCP | Traefik | HTTP → HTTPS Redirect + Let's Encrypt Challenge |
| 443 | TCP | Traefik | HTTPS für alle Web-Dienste |
| 10000 | UDP | Jitsi JVB | Video/Audio-Mediendaten (direkt, kein Proxy) |

Interne Kommunikation (z.B. Mattermost → Keycloak auf Port 8080) bleibt im Docker-Netzwerk.

## Datenfluss Backup

```
Mattermost-Daten ──┐
Nextcloud-Daten  ──┼──→ rclone sync ──┬──→ Filen.io (Cloud)
Traefik-Certs    ──┘                   └──→ SMB/NAS (Lokal)
```

Das Backup läuft täglich um 02:00 UTC. Beide Ziele sind optional und unabhängig konfigurierbar.

## Persistenz

| Service | Volume-Typ | Speicherort |
|---------|-----------|-------------|
| Mattermost Uploads | Bind Mount | `${STORAGE_PATH}/mattermost/` |
| Nextcloud Dateien | Bind Mount | `${STORAGE_PATH}/nextcloud/` |
| Traefik SSL-Certs | Bind Mount | `${STORAGE_PATH}/traefik/letsencrypt/` |
| Nextcloud App | Docker Volume | `nextcloud-app` |
| Jitsi Config | Docker Volumes | `jitsi-*` |
| Alle Datenbanken | Docker Volumes | `*-db-data` |
