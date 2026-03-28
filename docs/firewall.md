# Firewall & Netzwerk

Damit das Deployment von außen erreichbar ist, müssen drei Ports freigegeben werden — in der Host-Firewall **und** im Router.

## Portübersicht

| Port | Protokoll | Dienst | Pflicht |
|------|-----------|--------|---------|
| 80 | TCP | HTTP → automatisch Redirect auf HTTPS (Let's Encrypt) | Ja |
| 443 | TCP | HTTPS — alle Web-Dienste via Traefik | Ja |
| 10000 | UDP | Jitsi JVB Mediendaten (Video/Audio) | Ja, für Video |

> Ports 80 und 443 werden auf die **interne IP des Docker-Hosts** weitergeleitet.
> Port 10000/UDP direkt auf denselben Host — kein NAT-Problem dank DuckDNS.

---

## Linux — UFW Firewall

```bash
# Regeln anlegen
sudo ./scripts/firewall-linux.sh setup

# Status anzeigen
./scripts/firewall-linux.sh status

# Regeln wieder entfernen
sudo ./scripts/firewall-linux.sh remove
```

Das Skript gibt die Ports 80/tcp, 443/tcp und 10000/udp frei und aktiviert UFW falls nötig. Bereits vorhandene Regeln werden nicht dupliziert.

Details: [`scripts/firewall-linux.sh`](../scripts/firewall-linux.sh)

---

## Windows — Firewall

PowerShell **als Administrator** ausführen (`Win + X → PowerShell (Administrator)`):

```powershell
# Regeln anlegen
.\scripts\firewall-windows.ps1 -Action Setup

# Status anzeigen
.\scripts\firewall-windows.ps1 -Action Status

# Regeln wieder entfernen
.\scripts\firewall-windows.ps1 -Action Remove
```

Das Skript erstellt eingehende Firewall-Regeln für die drei Ports (benannt `Homeoffice MVP - *`).

Details: [`scripts/firewall-windows.ps1`](../scripts/firewall-windows.ps1)

### WSL2-Hinweis

WSL2 läuft in einer virtuellen Maschine. Wenn Docker innerhalb von WSL2 läuft, muss zusätzlich ein Port-Proxy eingerichtet werden, damit Windows den Traffic an WSL2 weiterleitet:

```powershell
# Port-Proxy einrichten (WSL2-IP wird automatisch ermittelt)
.\scripts\wsl2-portproxy.ps1 -Action Setup

# Status anzeigen
.\scripts\wsl2-portproxy.ps1 -Action Status

# Port-Proxy entfernen
.\scripts\wsl2-portproxy.ps1 -Action Remove
```

> **Wichtig:** Die WSL2-IP kann sich nach einem Neustart ändern. Bei Verbindungsproblemen `Setup` erneut ausführen.

Details: [`scripts/wsl2-portproxy.ps1`](../scripts/wsl2-portproxy.ps1)

---

## Router — Port-Forwarding

Im Router muss **Port-Forwarding** auf die interne IP des Docker-Hosts eingerichtet werden.

### Interne IP ermitteln

```bash
# Linux / WSL
./scripts/check-connectivity.sh --local
# Zeigt die Host-IP am Ende der Ausgabe
```

```powershell
# Windows PowerShell
(Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -notlike "169.*" } |
  Select-Object -First 1).IPAddress
```

### Fritzbox (Beispiel)

> Heimnetz → Netzwerk → Portfreigaben → Neue Portfreigabe

| Bezeichnung | Protokoll | Extern | Intern | Ziel-IP |
|---|---|---|---|---|
| Homeoffice HTTP | TCP | 80 | 80 | `<Docker-Host IP>` |
| Homeoffice HTTPS | TCP | 443 | 443 | `<Docker-Host IP>` |
| Homeoffice Jitsi | UDP | 10000 | 10000 | `<Docker-Host IP>` |

> **Tipp:** Dem Docker-Host eine **statische IP** im Router zuweisen
> (Fritzbox: Heimnetz → Netzwerk → IP-Adressen → Immer dieselbe IP vergeben),
> damit das Port-Forwarding nach Neustart noch stimmt.

---

## Erreichbarkeit testen

```bash
# Alle Dienste von außen prüfen (liest Domains aus .env)
./scripts/check-connectivity.sh

# Nur lokale Ports prüfen
./scripts/check-connectivity.sh --local
```

Das Skript prüft:
- HTTPS-Erreichbarkeit aller fünf Dienste
- Jitsi JVB UDP-Port 10000
- Host-IP für Router-Konfiguration

Details: [`scripts/check-connectivity.sh`](../scripts/check-connectivity.sh)

> **Hinweis:** Den HTTPS-Test von einem **externen Netzwerk** ausführen (z.B. Mobilfunk-Hotspot), um das Port-Forwarding zu verifizieren.
