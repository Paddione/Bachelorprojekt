# Fehlerbehebung

## Container starten nicht

### Allgemeine Diagnose

```bash
# Status aller Container
docker compose ps

# Logs eines fehlgeschlagenen Containers
docker compose logs <service-name>

# Konfiguration validieren
docker compose config --quiet && echo "OK" || echo "FEHLER"
```

### "Port already in use"

```bash
# Prozess auf Port 80 finden
sudo lsof -i :80
# oder
sudo ss -tlnp | grep :80

# Prozess beenden
sudo kill <PID>
```

Häufige Ursache: Apache, nginx oder ein anderer Webserver läuft bereits.

### "permission denied" bei acme.json

```bash
chmod 600 ${STORAGE_PATH:-./data}/traefik/letsencrypt/acme.json
```

Traefik verweigert den Start, wenn `acme.json` nicht `600` hat.

## SSL-Zertifikate

### "Certificate not valid" im Browser

- **Ursache:** Let's Encrypt konnte kein Zertifikat ausstellen
- **Prüfen:** Port 443 von außen erreichbar? DuckDNS-Domain korrekt?
- **Logs:** `docker compose logs traefik | grep -i acme`
- **Lösung:** Sicherstellen, dass Port 443/TCP im Router und in der Firewall freigegeben ist

### Zertifikat erneuern

Traefik erneuert automatisch. Falls manuell nötig:

```bash
# acme.json löschen und Traefik neustarten
rm ${STORAGE_PATH:-./data}/traefik/letsencrypt/acme.json
touch ${STORAGE_PATH:-./data}/traefik/letsencrypt/acme.json
chmod 600 ${STORAGE_PATH:-./data}/traefik/letsencrypt/acme.json
docker compose restart traefik
```

## Keycloak

### Realm wurde nicht importiert

- **Ursache:** OIDC-Secrets waren beim ersten Start nicht in `.env` gesetzt
- **Prüfen:** Keycloak Admin → Realms → "homeoffice" vorhanden?
- **Lösung:** Container und Volume löschen, Secrets setzen, neu starten:
  ```bash
  docker compose down keycloak keycloak-db
  docker volume rm homeoffice-mvp_keycloak-db-data
  # .env prüfen: MATTERMOST_OIDC_SECRET und NEXTCLOUD_OIDC_SECRET gesetzt?
  docker compose up -d keycloak
  ```

### LDAP-Sync funktioniert nicht

- **Prüfen:** Keycloak Admin → User Federation → LLDAP → "Test connection"
- **Häufige Ursache:** LLDAP-Container noch nicht bereit
- **Lösung:** Warten oder manuell synchronisieren: "Sync all users"

### "Invalid redirect URI" beim Login

- **Ursache:** Domain in `.env` stimmt nicht mit Keycloak-Client überein
- **Prüfen:** `MM_DOMAIN` / `NC_DOMAIN` in `.env` mit Redirect-URIs in Keycloak vergleichen
- **Lösung:** Wert in `.env` korrigieren, Keycloak-Container neustarten

## Mattermost

### OIDC-Login funktioniert nicht

1. Keycloak erreichbar? `curl -I https://<KC_DOMAIN>`
2. Client "mattermost" in Keycloak vorhanden?
3. Secret in Mattermost = Secret in Keycloak?
4. Redirect-URI korrekt konfiguriert?

### "413 Request Entity Too Large"

Upload-Limit ist 50 MB (Traefik Buffering-Middleware). Für größere Dateien:
- Datei über Nextcloud teilen
- Oder: Traefik-Middleware in `docker-compose.yml` anpassen

## Nextcloud

### "Access through untrusted domain"

- **Ursache:** Domain nicht als Trusted Domain konfiguriert
- **Lösung:** `NC_DOMAIN` in `.env` prüfen (muss exakt übereinstimmen)

### WebDAV-Fehler

```bash
# WebDAV-Erreichbarkeit testen
curl -u admin:<passwort> https://<NC_DOMAIN>/remote.php/dav/files/admin/
```

## Jitsi

### Video/Audio funktioniert nicht

- **Port 10000/UDP** muss von außen erreichbar sein (Router-Forwarding!)
- **Prüfen:** `nc -u -z -v <JITSI_DOMAIN> 10000`
- **JVB_ADVERTISE_IPS** muss auf die öffentliche Domain zeigen
- **Firewall:** Port 10000/UDP freigeben

### Konferenz startet, aber kein Bild/Ton

- Meist ein NAT/Firewall-Problem mit UDP Port 10000
- Browser-Konsole prüfen (F12) auf WebRTC-Fehler

## DuckDNS

### DNS wird nicht aktualisiert

```bash
# Logs prüfen
docker compose logs duckdns

# Manuell testen
curl "https://www.duckdns.org/update?domains=<subdomain>&token=<token>&verbose=true"
```

Antwort sollte `OK` enthalten. `KO` = Token oder Subdomain falsch.

## Backup

### Backup läuft nicht

```bash
# Logs prüfen
docker compose logs backup

# Manuell auslösen
docker compose exec backup sh -c '/backup.sh'
```

### "Failed to create file system for smb:"

- SMB-Server erreichbar? `ping <SMB_HOST>`
- Credentials korrekt? `smbclient -L //<SMB_HOST> -U <SMB_USER>`
- Port 445 offen? `nc -z -v <SMB_HOST> 445`

## Allgemeine Tipps

### Alles neustarten

```bash
docker compose down && docker compose up -d
```

### Einzelnen Service neustarten

```bash
docker compose restart <service-name>
```

### Container-Shell öffnen

```bash
docker compose exec <service-name> sh
# oder für bash:
docker compose exec <service-name> bash
```

### Alle Logs verfolgen

```bash
docker compose logs -f
```

### Volumes und Daten komplett zurücksetzen

> **ACHTUNG: Alle Daten gehen verloren!**

```bash
docker compose down -v
rm -rf ${STORAGE_PATH:-./data}/*
```
