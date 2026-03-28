# Homeoffice MVP

Docker Compose-basierte Kollaborationsplattform für kleine Teams — Mattermost (Chat), Nextcloud (Dateien), Keycloak (SSO) und Jitsi (Video) hinter einem Traefik Reverse Proxy mit automatischem HTTPS.

## Schnellstart

### Linux / WSL2

```bash
git clone https://github.com/Paddione/homeoffice-mvp.git && cd homeoffice-mvp
./scripts/setup.sh --quickstart
```

### Windows / PowerShell

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
git clone https://github.com/Paddione/homeoffice-mvp.git; cd homeoffice-mvp
.\scripts\setup-windows.ps1
```

Vollständige Anleitung: [Deployment](docs/deployment.md)

## Dokumentation

| Dokument | Beschreibung |
|----------|-------------|
| [Architektur](docs/architecture.md) | Systemübersicht, Service-Diagramm, Netzwerk und Datenfluss |
| [Deployment](docs/deployment.md) | Schritt-für-Schritt Anleitung zur Installation |
| [Konfiguration](docs/configuration.md) | Alle Umgebungsvariablen (`.env`) im Detail |
| [Services](docs/services.md) | Docker-Services und deren Zusammenspiel |
| [Keycloak & SSO](docs/keycloak.md) | Identity Management, OIDC-Clients, LDAP-Federation |
| [Firewall & Netzwerk](docs/firewall.md) | Firewall-Regeln, Router Port-Forwarding, WSL2-Proxy |
| [Migration](docs/migration.md) | Import von Slack, Teams, Google Workspace |
| [Backup](docs/backup.md) | Automatische Datensicherung (Filen.io, SMB/NAS) |
| [Skripte](docs/scripts.md) | Referenz aller Skripte, Parameter und Befehle |
| [Tests](docs/tests.md) | Automatisiertes Test-Framework (37 Anforderungen) |
| [Sicherheit](docs/security.md) | Sicherheitsrichtlinien und Best Practices |
| [Fehlerbehebung](docs/troubleshooting.md) | Häufige Probleme und Lösungsansätze |

## Architektur

```
Internet
   |
   +-- Port 80/TCP --+
   +-- Port 443/TCP -+
   |                  v
   |            +----------+
   |            | Traefik  |  Reverse Proxy + Auto-HTTPS (Let's Encrypt)
   |            +----+-----+
   |                 |
   |    +------------+------------+--------------+
   |    v            v            v              v
   | +------+  +----------+  +----------+  +----------+
   | |Matte-|  |Nextcloud |  |Keycloak  |  |  Jitsi   |
   | |rmost |  |          |  |  (SSO)   |  |  Meet    |
   | +------+  +----------+  +----------+  +----------+
   |
   +-- Port 10000/UDP ---> Jitsi JVB (Video/Audio)

+----------+         +----------+
| DuckDNS  |         |  Backup  |
| alle 5m  |         | 02:00UTC |
+----------+         +----------+
```

Details: [Architektur](docs/architecture.md)

## Skalierung

Die Plattform ist für kleine Teams (5–30 Nutzer) auf einem einzelnen Host ausgelegt. Skalierungsoptionen:

- **Vertikal**: CPU/RAM des Hosts erhöhen; Postgres-Limits über Umgebungsvariablen anpassen (`POSTGRES_MAX_CONNECTIONS`, `shared_buffers`)
- **Horizontal**: Mattermost und Nextcloud können auf separate Hosts aufgeteilt werden — jeweils eigener Docker Compose Stack mit gemeinsamer Datenbank
- **Jitsi JVB**: Zusätzliche Videobridges über `JVB_ADVERTISE_IPS` und separate JVB-Container anbinden
- **Traefik**: Unterstützt Load Balancing über mehrere Backend-Instanzen via Docker Labels

## Projektstruktur

```
homeoffice-mvp/
  docker-compose.yml          # Service-Definitionen
  .env.example                # Vorlage fuer Umgebungsvariablen
  realm-homeoffice.json       # Keycloak Realm-Konfiguration
  scripts/                    # Setup, Migration, Import, Backup
  tests/                      # Automatisierte Tests (Bash + Playwright)
  docs/                       # Dokumentation
  data/                       # Laufzeitdaten (gitignored)
```
