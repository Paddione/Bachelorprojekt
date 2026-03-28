# Fehlerbehebung

Alle hier referenzierten Befehle finden sich unter [Skripte](scripts.md).

## Container starten nicht

### Allgemeine Diagnose

Container-Status und Logs pruefen — siehe [Skripte → Docker Compose](scripts.md#docker-compose--allgemeine-befehle).

### "Port already in use"

Ein anderer Prozess belegt Port 80, 443 oder 10000. Den Prozess mit den Diagnose-Befehlen identifizieren und beenden — siehe [Skripte → Diagnose](scripts.md#diagnose).

Haeufige Ursache: Apache, nginx oder ein anderer Webserver laeuft bereits.

### "permission denied" bei acme.json

`acme.json` muss Berechtigung `600` haben. Der Pre-Flight Check (`setup.sh --fix`) repariert dies automatisch — siehe [Skripte → setup.sh](scripts.md#scriptssetupsh--pre-flight-check).

## SSL-Zertifikate

### "Certificate not valid" im Browser

- **Ursache:** Let's Encrypt konnte kein Zertifikat ausstellen
- **Pruefen:** Port 443 von aussen erreichbar? DuckDNS-Domain korrekt?
- **Loesung:** Port 443/TCP in Router und Firewall freigeben — siehe [Firewall & Netzwerk](firewall.md)
- **Logs:** Traefik-Logs pruefen — siehe [Skripte → Docker Compose](scripts.md#docker-compose--allgemeine-befehle)

### Zertifikat erneuern

Traefik erneuert automatisch. Falls manuell noetig: SSL-Zertifikate zuruecksetzen — siehe [Skripte → Diagnose](scripts.md#diagnose).

## Keycloak

### Realm wurde nicht importiert

- **Ursache:** OIDC-Secrets waren beim ersten Start nicht in `.env` gesetzt
- **Pruefen:** Keycloak Admin → Realms → "homeoffice" vorhanden?
- **Loesung:** Keycloak-Volume zuruecksetzen und Secrets in `.env` setzen — siehe [Skripte → Diagnose](scripts.md#diagnose)

### Benutzer erscheinen nicht in Keycloak

- **Pruefen:** Keycloak Admin Console → Users → Benutzer suchen
- **Haeufige Ursache:** Benutzer wurde noch nicht angelegt
- **Loesung:** Benutzer ueber Keycloak Admin Console oder Import-Skript anlegen — siehe [Keycloak & SSO](keycloak.md#benutzerverwaltung)

### "Invalid redirect URI" beim Login

- **Ursache:** Domain in `.env` stimmt nicht mit Keycloak-Client ueberein
- **Pruefen:** `MM_DOMAIN` / `NC_DOMAIN` in `.env` mit Redirect-URIs in Keycloak vergleichen
- **Loesung:** Wert in `.env` korrigieren, Keycloak-Container neustarten — siehe [Skripte → Docker Compose](scripts.md#docker-compose--allgemeine-befehle)

## Mattermost

### OIDC-Login funktioniert nicht

1. Keycloak erreichbar? Erreichbarkeitstest ausfuehren — [Skripte → check-connectivity.sh](scripts.md#scriptscheck-connectivitysh--erreichbarkeitstest)
2. Client "mattermost" in Keycloak vorhanden?
3. Secret in Mattermost = Secret in Keycloak?
4. Redirect-URI korrekt konfiguriert?

### "413 Request Entity Too Large"

Upload-Limit ist 50 MB (Traefik Buffering-Middleware). Fuer groessere Dateien:
- Datei ueber Nextcloud teilen
- Oder: Traefik-Middleware in `docker-compose.yml` anpassen

## Nextcloud

### "Access through untrusted domain"

- **Ursache:** Domain nicht als Trusted Domain konfiguriert
- **Loesung:** `NC_DOMAIN` in `.env` pruefen (muss exakt uebereinstimmen)

### WebDAV-Fehler

WebDAV-Erreichbarkeit mit Diagnose-Befehlen testen — siehe [Skripte → Diagnose](scripts.md#diagnose).

## Jitsi

### Video/Audio funktioniert nicht

- **Port 10000/UDP** muss von aussen erreichbar sein (Router-Forwarding!)
- **JVB_ADVERTISE_IPS** muss auf die oeffentliche Domain zeigen
- **Firewall:** Port 10000/UDP freigeben — siehe [Firewall & Netzwerk](firewall.md)

### Konferenz startet, aber kein Bild/Ton

- Meist ein NAT/Firewall-Problem mit UDP Port 10000
- Browser-Konsole pruefen (F12) auf WebRTC-Fehler

## DuckDNS

### DNS wird nicht aktualisiert

DuckDNS-Logs pruefen und manuell testen — siehe [Skripte → Diagnose](scripts.md#diagnose).

Antwort sollte `OK` enthalten. `KO` = Token oder Subdomain falsch.

## Backup

### Backup laeuft nicht

Backup-Logs pruefen und manuelles Backup anstoßen — siehe [Skripte → Datenbank-Backup](scripts.md#datenbank-backup) und [Skripte → Docker Compose](scripts.md#docker-compose--allgemeine-befehle).

### "Failed to create file system for smb:"

- SMB-Server erreichbar? SMB-Verbindung testen — siehe [Skripte → Diagnose](scripts.md#diagnose)
- Credentials in `.env` korrekt? — siehe [Konfiguration → SMB](configuration.md#smb--nas-netzwerk)

## Allgemeine Tipps

- **Alles neustarten:** Stack stoppen und neu starten
- **Einzelnen Service neustarten:** Nur betroffenen Container neustarten
- **Container-Shell oeffnen:** Fuer manuelle Inspektion
- **Alle Logs verfolgen:** Alle Services gleichzeitig beobachten
- **Komplett zuruecksetzen:** Volumes und Daten loeschen (Datenverlust!)

Alle Befehle: [Skripte → Docker Compose](scripts.md#docker-compose--allgemeine-befehle) und [Skripte → Diagnose](scripts.md#diagnose)
