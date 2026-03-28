# Homeoffice MVP — Dokumentation

Vollständige Dokumentation für das Homeoffice MVP Deployment.

## Inhaltsverzeichnis

| Dokument | Beschreibung |
|----------|-------------|
| [Architektur](architecture.md) | Systemübersicht, Services, Netzwerk und Datenfluss |
| [Deployment](deployment.md) | Schritt-für-Schritt Anleitung zur Installation |
| [Konfiguration](configuration.md) | Alle Umgebungsvariablen im Detail |
| [Services](services.md) | Beschreibung aller Docker-Services und deren Zusammenspiel |
| [Keycloak & SSO](keycloak.md) | Identity Management, OIDC-Clients, LDAP-Federation |
| [Migration](migration.md) | Import von Slack, Teams, Google Workspace |
| [Backup](backup.md) | Automatische Datensicherung (Filen.io, SMB/NAS) |
| [Skripte](scripts.md) | Referenz aller Skripte und Hilfsbibliotheken |
| [Sicherheit](security.md) | Sicherheitshinweise und Best Practices |
| [Fehlerbehebung](troubleshooting.md) | Häufige Probleme und Lösungen |

## Schnelleinstieg

```bash
# 1. Konfiguration anlegen
cp .env.example .env
nano .env                        # Alle CHANGE_ME_* Werte ausfüllen

# 2. Pre-Flight Check
./scripts/setup.sh --fix

# 3. Starten
docker compose up -d

# 4. Status prüfen
docker compose ps
```

Detaillierte Anleitung: [Deployment](deployment.md)
