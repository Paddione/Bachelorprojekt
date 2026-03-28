# Homeoffice MVP

Docker-Compose-Stack für kleine Teams: Chat (Mattermost), Dateien (Nextcloud), SSO (Keycloak), Videokonferenzen (Jitsi), Benutzerverwaltung (LLDAP) — alles hinter Traefik mit automatischem HTTPS via Let's Encrypt und DuckDNS.

## Schnellstart

```bash
# 1. Konfiguration
cp .env.example .env
nano .env                        # Alle CHANGE_ME_* Werte ausfüllen

# 2. Firewall einrichten (Ports 80, 443, 10000/UDP)
sudo ./scripts/firewall-linux.sh setup          # Linux
# .\scripts\firewall-windows.ps1 -Action Setup  # Windows (als Admin)

# 3. Pre-Flight Check
./scripts/setup.sh --fix

# 4. Starten
docker compose up -d

# 5. Erreichbarkeit testen
./scripts/check-connectivity.sh
```

## Dokumentation

Die vollständige Dokumentation liegt in [`docs/`](docs/README.md):

| Dokument | Beschreibung |
|----------|-------------|
| [Architektur](docs/architecture.md) | Systemübersicht, Services, Netzwerk und Datenfluss |
| [Firewall & Netzwerk](docs/firewall.md) | Firewall-Regeln, Router Port-Forwarding, Erreichbarkeitstest |
| [Deployment](docs/deployment.md) | Schritt-für-Schritt Anleitung zur Installation |
| [Konfiguration](docs/configuration.md) | Alle Umgebungsvariablen im Detail |
| [Services](docs/services.md) | Beschreibung aller Docker-Services |
| [Keycloak & SSO](docs/keycloak.md) | Identity Management, OIDC-Clients, LDAP-Federation |
| [Migration](docs/migration.md) | Import von Slack, Teams, Google Workspace |
| [Backup](docs/backup.md) | Automatische Datensicherung (Filen.io, SMB/NAS) |
| [Skripte](docs/scripts.md) | Referenz aller Skripte und Hilfsbibliotheken |
| [Sicherheit](docs/security.md) | Sicherheitshinweise und Best Practices |
| [Fehlerbehebung](docs/troubleshooting.md) | Häufige Probleme und Lösungen |

## Skripte

| Skript | Beschreibung |
|--------|-------------|
| `scripts/setup.sh` | Pre-Flight Check und automatische Reparatur |
| `scripts/firewall-linux.sh` | Linux-Firewall (UFW) einrichten / entfernen |
| `scripts/firewall-windows.ps1` | Windows-Firewall einrichten / entfernen |
| `scripts/wsl2-portproxy.ps1` | WSL2 Port-Proxy einrichten / entfernen |
| `scripts/check-connectivity.sh` | Erreichbarkeit aller Dienste testen |
| `scripts/migrate.sh` | Daten-Migration (Slack, Teams, Google) |
| `scripts/import-users.sh` | Benutzer-Import in LLDAP (CSV/LDIF) |
| `scripts/setup-smb.sh` | SMB-Share für Backups einrichten |


