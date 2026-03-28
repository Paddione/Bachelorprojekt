# Homeoffice MVP — Docker Compose Deployment Guide

---

## 🔥 Firewall & Router — Portfreigaben

Damit das Deployment von außen erreichbar ist, müssen folgende Ports freigegeben werden.

### Übersicht

| Port | Protokoll | Dienst | Pflicht |
|------|-----------|--------|---------|
| 80 | TCP | HTTP → automatisch Redirect auf HTTPS | ✅ |
| 443 | TCP | HTTPS (alle Web-Dienste via Traefik) | ✅ |
| 10000 | UDP | Jitsi JVB Mediendaten (Video/Audio) | ✅ für Video |

> Port 80 und 443 müssen auf die **interne IP des Docker-Hosts** weitergeleitet werden.
> Port 10000/UDP direkt auf denselben Host — kein NAT-Problem dank DuckDNS.

---

### 🪟 Windows — Firewall-Regeln (PowerShell)

Als Administrator ausführen (`Win + X → Windows PowerShell (Administrator)`):

```powershell
# ── Eingehende Regeln (Inbound) ──────────────────────────────────

# HTTP (Port 80) — Let's Encrypt Challenge + Redirect
New-NetFirewallRule `
  -DisplayName "Homeoffice MVP - HTTP" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 80 `
  -Action Allow `
  -Profile Any

# HTTPS (Port 443) — alle Web-Dienste
New-NetFirewallRule `
  -DisplayName "Homeoffice MVP - HTTPS" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 443 `
  -Action Allow `
  -Profile Any

# Jitsi JVB (Port 10000/UDP) — Video/Audio-Mediendaten
New-NetFirewallRule `
  -DisplayName "Homeoffice MVP - Jitsi JVB UDP" `
  -Direction Inbound `
  -Protocol UDP `
  -LocalPort 10000 `
  -Action Allow `
  -Profile Any

# ── Ausgehende Regeln (Outbound) — normalerweise nicht nötig ─────
# Windows erlaubt ausgehenden Traffic standardmäßig.
# Nur nötig wenn ausgehender Traffic geblockt ist:

# New-NetFirewallRule -DisplayName "Homeoffice MVP - Outbound 443" `
#   -Direction Outbound -Protocol TCP -RemotePort 443 -Action Allow -Profile Any
```

**Regeln wieder entfernen:**
```powershell
Remove-NetFirewallRule -DisplayName "Homeoffice MVP - HTTP"
Remove-NetFirewallRule -DisplayName "Homeoffice MVP - HTTPS"
Remove-NetFirewallRule -DisplayName "Homeoffice MVP - Jitsi JVB UDP"
```

**Regeln prüfen:**
```powershell
Get-NetFirewallRule | Where-Object { $_.DisplayName -like "Homeoffice MVP*" } |
  Select-Object DisplayName, Enabled, Direction, Action |
  Format-Table -AutoSize
```

> **WSL2-Hinweis:** WSL2 läuft in einer virtuellen Maschine. Wenn Docker in WSL2 läuft,
> muss zusätzlich ein Port-Proxy eingerichtet werden:
>
> ```powershell
> # WSL2-IP ermitteln
> $wslIp = (wsl hostname -I).Trim().Split(" ")[0]
>
> # Port-Proxy: Windows 80/443/10000 → WSL2
> netsh interface portproxy add v4tov4 listenport=80   listenaddress=0.0.0.0 connectport=80   connectaddress=$wslIp
> netsh interface portproxy add v4tov4 listenport=443  listenaddress=0.0.0.0 connectport=443  connectaddress=$wslIp
> netsh interface portproxy add v4tov4 listenport=10000 listenaddress=0.0.0.0 connectport=10000 connectaddress=$wslIp
>
> # Prüfen
> netsh interface portproxy show all
>
> # Entfernen
> netsh interface portproxy delete v4tov4 listenport=80  listenaddress=0.0.0.0
> netsh interface portproxy delete v4tov4 listenport=443 listenaddress=0.0.0.0
> netsh interface portproxy delete v4tov4 listenport=10000 listenaddress=0.0.0.0
> ```

---

### 🐧 Linux — UFW Firewall-Regeln

```bash
# Ports freigeben
sudo ufw allow 80/tcp    comment "Homeoffice MVP HTTP"
sudo ufw allow 443/tcp   comment "Homeoffice MVP HTTPS"
sudo ufw allow 10000/udp comment "Homeoffice MVP Jitsi JVB"

# Status prüfen
sudo ufw status verbose

# UFW aktivieren falls nicht aktiv
sudo ufw enable
```

---

### 🌐 Router — Port-Forwarding (Fritzbox Beispiel)

Im Router muss **Port-Forwarding** auf die interne IP des Docker-Hosts eingerichtet werden.

**Fritzbox:**
> Heimnetz → Netzwerk → Portfreigaben → Neue Portfreigabe

| Bezeichnung | Protokoll | Extern | Intern | Ziel-IP |
|---|---|---|---|---|
| Homeoffice HTTP | TCP | 80 | 80 | `<Docker-Host IP>` |
| Homeoffice HTTPS | TCP | 443 | 443 | `<Docker-Host IP>` |
| Homeoffice Jitsi | UDP | 10000 | 10000 | `<Docker-Host IP>` |

**Interne IP des Hosts ermitteln:**
```bash
# Linux / WSL
ip route get 1 | awk '{print $7; exit}'

# Windows PowerShell
(Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -notlike "169.*" } |
  Select-Object -First 1).IPAddress
```

> **Tipp:** Weise dem Docker-Host eine **statische IP** im Router zu
> (Fritzbox: Heimnetz → Netzwerk → IP-Adressen → Immer dieselbe IP vergeben),
> damit das Port-Forwarding nach Neustart noch stimmt.

---

### ✅ Alles testen

```bash
# Von außen (z.B. vom Handy im Mobilnetz):
curl -I https://chat.DEINE-DOMAIN.duckdns.org   # Mattermost
curl -I https://files.DEINE-DOMAIN.duckdns.org  # Nextcloud
curl -I https://auth.DEINE-DOMAIN.duckdns.org   # Keycloak

# Jitsi JVB UDP-Erreichbarkeit testen (von einem anderen Rechner):
nc -u -z -v DEINE-DOMAIN.duckdns.org 10000
```

---

## 🚚 Migration von bestehenden Systemen

Bevor oder nach dem Deployment können vorhandene Daten aus Slack, Teams und anderen Systemen importiert werden.

### Migration Assistant (interaktives Menü)

```bash
# Voraussetzungen (einmalig)
sudo apt install curl jq python3 unzip   # Linux / WSL
brew install curl jq python3 unzip       # macOS

# Starten
chmod +x scripts/migrate.sh
./scripts/migrate.sh

# Nur Vorschau — keine Änderungen
./scripts/migrate.sh --dry-run
```

Beim ersten Start:
1. **Server-URLs + Zugangsdaten eingeben** (Mattermost, Nextcloud, LLDAP)
2. **Automatischer Scan** — sucht auf dem lokalen Rechner nach:
   - Slack-Export-ZIPs und lokalem Slack-Cache
   - Teams GDPR-Export und lokalem Teams-Cache
   - Bestehenden Mattermost/Nextcloud-Clients
3. **Quelle auswählen oder Pfad manuell eingeben**
4. **Import starten**

Läuft auf: Linux, macOS, Windows (WSL)

---

### Slack → Mattermost

**Schritt 1: Export erstellen** (braucht Workspace Admin-Rechte)
> Slack → Settings & Permissions → Import/Export Data → Export → All Messages

**Schritt 2: Importieren**
```bash
./scripts/migrate.sh
# → [1] Slack importieren → ZIP-Datei auswählen
```

Was wird importiert:
- ✅ Alle öffentlichen und privaten Kanäle
- ✅ Kanal-Nachrichten mit Zeitstempeln
- ✅ User-Konten (werden in Mattermost angelegt)
- ✅ @mentions und ~channel-Links umgewandelt
- ⚠️ Dateien/Anhänge: nur als Referenz, kein Binary-Upload

---

### Microsoft Teams → Mattermost + Nextcloud

**Schritt 1: GDPR-Export anfordern** (kein Admin nötig)
> myaccount.microsoft.com → Datenschutz → Daten herunterladen
> Auswählen: Teams Chat, Dateien, Kalender, Kontakte → ZIP herunterladen

**Schritt 2: Importieren**
```bash
./scripts/migrate.sh
# → [2] Teams importieren → ZIP-Datei auswählen
```

Was wird importiert:

| Quelle | Ziel | Format |
|---|---|---|
| Teams Chats / Kanäle | Mattermost | Nachrichten mit Zeitstempeln |
| Dateien & Anhänge | Nextcloud `/Teams-Import/` | WebDAV Upload |
| Kalender | Nextcloud Calendar | iCal `.ics` |
| Kontakte | Nextcloud Contacts | vCard `.vcf` |

---

### Benutzer → LLDAP

```bash
# CSV-Import
./scripts/migrate.sh → [3] Benutzer importieren

# Oder direkt:
./scripts/import-users.sh --csv meine-user.csv --url http://localhost:17170

# Aus bestehendem LDAP exportieren und importieren:
ldapsearch -x -H ldap://alter-server -b "dc=firma,dc=de" > export.ldif
./scripts/import-users.sh --ldif export.ldif
```

---

## 🐳 Docker Compose Deployment

### Voraussetzungen
- Docker + Docker Compose v2
- Port 80, 443, 10000/UDP in der Firewall offen
- Account bei [duckdns.org](https://www.duckdns.org/) (kostenlos)

### Schnellstart

```bash
# 1. Konfiguration anlegen
cp .env.example .env
nano .env   # Alle CHANGE_ME_* und Domain-Werte ausfüllen

# 2. Verzeichnisse und acme.json anlegen
#    (acme.json muss chmod 600 haben, sonst verweigert Traefik den Start)
STORAGE=${STORAGE_PATH:-./data}
mkdir -p ${STORAGE}/mattermost ${STORAGE}/nextcloud ${STORAGE}/traefik/letsencrypt
touch ${STORAGE}/traefik/letsencrypt/acme.json
chmod 600 ${STORAGE}/traefik/letsencrypt/acme.json

# 3. Starten
docker compose up -d

# 4. Status prüfen
docker compose ps
docker compose logs -f duckdns   # DuckDNS-Updates beobachten
```

### DuckDNS einrichten

Da DuckDNS keine Sub-Subdomains unterstützt (`chat.myhome.duckdns.org` geht nicht), bekommt jeder Dienst eine eigene Subdomain:

1. Account auf https://www.duckdns.org/ anlegen
2. Diese **5 Subdomains** anlegen (Namen frei wählbar, empfohlenes Schema):
   - `bachelorprojekt-chat`
   - `bachelorprojekt-auth`
   - `bachelorprojekt-files`
   - `bachelorprojekt-meet`
   - `bachelorprojekt-ldap`
3. Token von der Startseite kopieren
4. In `.env` eintragen:
   ```
   MM_DOMAIN=bachelorprojekt-chat.duckdns.org
   KC_DOMAIN=bachelorprojekt-auth.duckdns.org
   NC_DOMAIN=bachelorprojekt-files.duckdns.org
   JITSI_DOMAIN=bachelorprojekt-meet.duckdns.org
   LLDAP_DOMAIN=bachelorprojekt-ldap.duckdns.org
   DUCKDNS_TOKEN=dein-token
   DUCKDNS_SUBDOMAINS=bachelorprojekt-chat,bachelorprojekt-auth,bachelorprojekt-files,bachelorprojekt-meet,bachelorprojekt-ldap
   JVB_ADVERTISE_IPS=bachelorprojekt-meet.duckdns.org
   JITSI_XMPP_SUFFIX=bachelorprojekt-meet.duckdns.org
   ```

Der DuckDNS-Container aktualisiert automatisch alle 5 Minuten alle 5 IPs gleichzeitig.

### Externen Speicher einbinden (Optional)

Trage in `.env` den Pfad zu deinem Speichermedium ein:
```
STORAGE_PATH=/mnt/nas/homeoffice
# oder
STORAGE_PATH=/mnt/usb/homeoffice
```

Folgende Dienste legen ihre Daten dort ab:
- `Mattermost` → `$STORAGE_PATH/mattermost/` (Uploads, Plugins)
- `Nextcloud` → `$STORAGE_PATH/nextcloud/` (alle Dateien)
- `Traefik` → `$STORAGE_PATH/traefik/letsencrypt/` (SSL-Zertifikate)

Ohne `STORAGE_PATH` wird `./data/` neben der `docker-compose.yml` verwendet.

### Nach dem Start: User-Import & LDAP einrichten

#### Option A — User aus CSV / LDIF importieren (Bulk-Import)

```bash
# Voraussetzungen
apt install curl jq

# Beispiel-CSV ansehen
cat scripts/users-example.csv

# CSV importieren (LLDAP läuft lokal auf Port 17170)
chmod +x scripts/import-users.sh
./scripts/import-users.sh --csv meine-user.csv \
  --url http://localhost:17170 \
  --pass <LLDAP_LDAP_USER_PASS>

# LDIF importieren (z.B. Export aus bestehendem LDAP/AD)
./scripts/import-users.sh --ldif export.ldif \
  --url http://localhost:17170 \
  --pass <LLDAP_LDAP_USER_PASS>

# Vorschau ohne Änderungen
./scripts/import-users.sh --csv meine-user.csv --dry-run
```

**CSV-Format:**
```
username,email,display_name,groups,first_name,last_name
anna.schmidt,anna@example.com,Anna Schmidt,"homeoffice_users;admins",Anna,Schmidt
```

- `groups`: semikolon-getrennt, werden automatisch angelegt
- Alle User bekommen ein Einmal-Passwort (`ChangeMe123!`) und müssen es beim ersten Login ändern

#### Option B — Bestehendes LDAP / Active Directory anbinden

Falls schon ein LDAP-Server (z.B. AD, OpenLDAP, 389ds) vorhanden ist, kann Keycloak direkt dort federieren — LLDAP wird dann als Zwischenschicht übersprungen:

1. Keycloak Admin → Realm `homeoffice` → **User Federation → Add provider → LDAP**
2. Konfiguration für **Active Directory:**

| Feld | Wert |
|---|---|
| Vendor | Active Directory |
| Connection URL | `ldap://dein-ad-server:389` (oder ldaps://…:636) |
| Bind DN | `cn=serviceaccount,dc=firma,dc=de` |
| Bind Credential | Service-Account-Passwort |
| Users DN | `cn=Users,dc=firma,dc=de` |
| Username LDAP attribute | `sAMAccountName` |
| UUID LDAP attribute | `objectGUID` |
| User Object Classes | `person,organizationalPerson,user` |

3. Konfiguration für **OpenLDAP / LLDAP:**

| Feld | Wert |
|---|---|
| Vendor | Other |
| Connection URL | `ldap://lldap:3890` |
| Bind DN | `uid=admin,ou=people,dc=${LLDAP_BASE_DOMAIN},dc=${LLDAP_BASE_TLD}` |
| Bind Credential | `LLDAP_LDAP_USER_PASS` |
| Users DN | `ou=people,dc=${LLDAP_BASE_DOMAIN},dc=${LLDAP_BASE_TLD}` |
| Username LDAP attribute | `uid` |
| UUID LDAP attribute | `entryUUID` |
| User Object Classes | `inetOrgPerson` |

4. **Test connection → Test authentication → Save → Sync all users**
5. Mattermost + Nextcloud erhalten die User automatisch über OIDC — kein weiterer Schritt

#### Option C — LDAP-Gruppen als Keycloak-Rollen mappen

Damit AD/LDAP-Gruppen direkt als Rollen in Mattermost/Nextcloud landen:

1. Keycloak → User Federation → LLDAP/AD → **Mappers → Add mapper**
2. Typ: `group-ldap-mapper`
3. LDAP Groups DN: `ou=groups,dc=…`
4. Group Name LDAP Attribute: `cn`
5. Save → **Sync LDAP Groups**


