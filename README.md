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

> **Hinweis:** Nach der Docker Desktop Installation ist ein **Neustart** erforderlich.
> Danach das Script erneut ausführen.
## Dokumentation

Die vollständige Dokumentation liegt in [`docs/`](docs/README.md):

