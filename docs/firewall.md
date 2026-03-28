# Firewall & Netzwerk

Damit das Deployment von aussen erreichbar ist, muessen drei Ports freigegeben werden — in der Host-Firewall **und** im Router.

## Portuebersicht

| Port | Protokoll | Dienst | Pflicht |
|------|-----------|--------|---------|
| 80 | TCP | HTTP → automatisch Redirect auf HTTPS (Let's Encrypt) | Ja |
| 443 | TCP | HTTPS — alle Web-Dienste via Traefik | Ja |
| 10000 | UDP | Jitsi JVB Mediendaten (Video/Audio) | Ja, fuer Video |

> Ports 80 und 443 werden auf die **interne IP des Docker-Hosts** weitergeleitet.
> Port 10000/UDP direkt auf denselben Host — kein NAT-Problem dank DuckDNS.

---

## Linux — UFW Firewall

Das Skript `setup.sh firewall` gibt die Ports 80/tcp, 443/tcp und 10000/udp frei und aktiviert UFW falls noetig. Bereits vorhandene Regeln werden nicht dupliziert.

Befehle und Parameter: [Skripte → setup.sh firewall](scripts.md#setupsh-firewall--linux-firewall-ufw)

---

## Windows — Firewall

PowerShell **als Administrator** ausfuehren. Das Skript `setup-windows.ps1` erstellt eingehende Firewall-Regeln fuer die drei Ports (benannt `Homeoffice MVP - *`).

Befehle und Parameter: [Skripte → setup-windows.ps1](scripts.md#setup-windowsps1--windows-setup--firewall)

### WSL2-Hinweis

WSL2 laeuft in einer virtuellen Maschine. Wenn Docker innerhalb von WSL2 laeuft, muss zusaetzlich ein Port-Proxy eingerichtet werden, damit Windows den Traffic an WSL2 weiterleitet.

> **Wichtig:** Die WSL2-IP kann sich nach einem Neustart aendern. Bei Verbindungsproblemen den Proxy erneut einrichten.

Befehle und Parameter: [Skripte → wsl2-portproxy.ps1](scripts.md#scriptswsl2-portproxyps1--wsl2-port-proxy)

---

## Router — Port-Forwarding

Im Router muss **Port-Forwarding** auf die interne IP des Docker-Hosts eingerichtet werden. Die Host-IP kann mit dem Connectivity-Check ermittelt werden — siehe [Skripte → check-connectivity.sh](scripts.md#scriptscheck-connectivitysh--erreichbarkeitstest).

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

Das Skript prueft HTTPS-Erreichbarkeit aller Dienste und Jitsi JVB UDP-Port 10000.

> **Hinweis:** Den HTTPS-Test von einem **externen Netzwerk** ausfuehren (z.B. Mobilfunk-Hotspot), um das Port-Forwarding zu verifizieren.

Befehle und Parameter: [Skripte → check-connectivity.sh](scripts.md#scriptscheck-connectivitysh--erreichbarkeitstest)
