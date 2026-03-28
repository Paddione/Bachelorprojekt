## Schnellstart

### One-Liner (Linux / WSL2)

```bash
# Voraussetzung: git, curl — der Rest wird automatisch installiert
git clone https://github.com/Paddione/homeoffice-mvp.git && cd homeoffice-mvp
./scripts/setup.sh --quickstart
```

Das Script:
1. Installiert fehlende Abhängigkeiten (Docker, Docker Compose, openssl, jq)
2. Fragt Projektname, DuckDNS-Token und E-Mail ab
3. Generiert 12 sichere Secrets automatisch
4. Erstellt Datenverzeichnisse + acme.json, richtet UFW-Firewall ein
5. Führt den vollständigen Pre-Flight Check mit Auto-Fix durch
6. Validiert die Konfiguration und startet den Stack

### One-Liner (Windows / PowerShell)

```powershell
# PowerShell als Administrator öffnen
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
git clone https://github.com/Paddione/homeoffice-mvp.git; cd homeoffice-mvp
.\scripts\setup-windows.ps1
```

Das Script:
1. Prüft/installiert Docker Desktop (via winget) und git
2. Fragt Projektname, DuckDNS-Token und E-Mail ab
3. Generiert 12 sichere Secrets automatisch
4. Erstellt alle Datenverzeichnisse + acme.json
5. Richtet Windows-Firewall-Regeln ein
6. Validiert die Konfiguration und startet den Stack

> **Hinweis:** Nach der Docker Desktop Installation ist ein **Neustart** erforderlich.
> Danach das Script erneut ausführen.

### Manuelle Installation

```bash
# 1. Konfiguration
cp .env.example .env
nano .env                        # Alle CHANGE_ME_* Werte ausfüllen

# 2. Firewall einrichten (Ports 80, 443, 10000/UDP)
sudo ./scripts/setup.sh firewall setup          # Linux (UFW)
# .\scripts\setup-windows.ps1 -Action Firewall-Setup  # Windows (als Admin)

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
| [Tests](docs/tests.md) | Automatisiertes Test-Framework (Bash + Playwright) |
| [Sicherheit](docs/security.md) | Sicherheitshinweise und Best Practices |
| [Fehlerbehebung](docs/troubleshooting.md) | Häufige Probleme und Lösungen |

## Skripte

| Skript | Beschreibung |
|--------|-------------|
| `scripts/setup.sh` | Linux: Check, Fix, Quickstart, Firewall, SMB — alles in einem |
| `scripts/setup-windows.ps1` | Windows: Docker Desktop, Firewall, .env, Quickstart |
| `scripts/wsl2-portproxy.ps1` | WSL2 Port-Proxy einrichten / entfernen |
| `scripts/check-connectivity.sh` | Erreichbarkeit aller Dienste testen |
| `scripts/migrate.sh` | Daten-Migration (Slack, Teams, Google) |
| `scripts/import-users.sh` | Benutzer-Import in LLDAP (CSV/LDIF) |

## Tests

```bash
# Alle lokalen Tests ausführen (startet und stoppt Docker Compose)
./tests/runner.sh local

# Nur bestimmte Anforderungen testen
./tests/runner.sh local FA-01 SA-03

# Produktionstests gegen Live-Deployment
./tests/runner.sh prod

# Ergebnisse: tests/results/<datum>-<tier>.json + .md
```

Details: [docs/tests.md](docs/tests.md)

