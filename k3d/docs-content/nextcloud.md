# Nextcloud — Dateiverwaltung, Kalender & Talk

## Übersicht

Nextcloud ist die zentrale Dateiverwaltungs- und Kollaborationsplattform des Workspace MVP. Es stellt folgende Funktionen bereit:

- **Dateien**: Hochladen, teilen, versionieren und gemeinsam bearbeiten
- **Kalender & Kontakte**: Gruppen- und Einzelkalender, Adressbuch
- **Talk**: Video- und Audioanrufe sowie Gruppen-Chat direkt im Browser
- **Office-Dokumente**: Gemeinsames Bearbeiten von Dokumenten, Tabellen und Präsentationen via Collabora Online
- **Whiteboard**: Kollaboratives Zeichnen und Brainstormen

| Umgebung | URL |
|----------|-----|
| Dev (k3d) | http://files.localhost |
| Produktion | https://files.korczewski.de |

**Image:** `nextcloud:33-apache`

**Abhängigkeiten:** PostgreSQL (Datenbank), Redis (Cache & Locking), Collabora (Office), Talk HPB/Signaling (Video-Calls)

---

## Aktivierte Apps

Die folgenden Apps werden einmalig nach dem Deployment via `task workspace:post-setup` aktiviert:

| App | Funktion | Aktiviert via |
|-----|----------|---------------|
| `calendar` | Kalender (CalDAV) | post-setup |
| `contacts` | Kontakte (CardDAV) | post-setup |
| `user_oidc` | Keycloak SSO-Login (OIDC) | post-setup |
| `richdocuments` | Office-Integration mit Collabora | post-setup |
| `whiteboard` | Kollaboratives Whiteboard | post-setup |
| `notify_push` | Client-Push via WebSocket | post-setup |
| `talk` | Video/Audio-Calls & Chat | post-setup |

---

## OIDC-Integration

Nextcloud nutzt die App `user_oidc` für die Anmeldung via Keycloak (Single Sign-On). Die Konfiguration erfolgt nicht im Admin-Panel, sondern als PHP-ConfigMap, die in den Container gemountet wird.

**Datei:** `k3d/nextcloud-oidc-dev.php` → gemountet als `/var/www/html/config/oidc.config.php`

### Konfigurationsparameter

| Parameter | Wert (Dev) |
|-----------|------------|
| Provider-URL | `http://keycloak:8080/realms/workspace` |
| Client-ID | `nextcloud` |
| Client-Secret | aus Secret `workspace-secrets` (Key: `NEXTCLOUD_OIDC_SECRET`) |
| Auto-Redirect | `true` (direkt zu Keycloak) |
| Button-Text | „Mit Keycloak anmelden" |
| Passwort-Formular | ausgeblendet in Produktion |
| TLS-Verifizierung | `false` (Dev-only; in Produktion aktivieren) |

### User-Mapping (Keycloak → Nextcloud)

| Nextcloud-Feld | Keycloak-Claim |
|----------------|----------------|
| Username (`id`) | `preferred_username` |
| Anzeigename | `name` |
| E-Mail | `email` |

Der Scope ist `openid email profile`. Passwort-Vergessen-Link ist deaktiviert (`lost_password_link: disabled`), da Passwörter ausschliesslich über Keycloak verwaltet werden.

---

## Redis-Cache

Redis wird als In-Memory-Cache und Distributed Locking Backend betrieben. Dies ist Voraussetzung für `notify_push` und verbessert die allgemeine Performance erheblich.

**Deployment:** `k3d/nextcloud-redis.yaml` — Redis 7 Alpine, rein In-Memory (kein Persistenz-AOF/RDB)

**Konfiguration in** `k3d/nextcloud-extra-config.php`:

```
memcache.local       → APCu
memcache.distributed → Redis
memcache.locking     → Redis
Redis-Host: nextcloud-redis.workspace.svc.cluster.local:6379
```

Redis-Limits: max. 256 MB RAM, Eviction-Policy `allkeys-lru`.

---

## Collabora-Integration

Die App `richdocuments` verbindet Nextcloud mit Collabora Online über das WOPI-Protokoll. Beim Öffnen eines Office-Dokuments in Nextcloud wird Collabora im Browser gestartet.

**Collabora-URL (Dev):** `http://office.localhost`

**Einrichtung nach dem Deployment:**

1. In Nextcloud Admin-Panel: **Office → Collabora Online**
2. WOPI-URL eintragen: `http://office.localhost` (Dev) bzw. `https://office.korczewski.de` (Prod)
3. Verbindungstest durchführen

Der `COLLABORA_DOMAIN` wird als Umgebungsvariable aus der ConfigMap `domain-config` in den Nextcloud-Container injiziert.

---

## Talk / Video-Calls

Talk ermöglicht Video- und Audioanrufe sowie Gruppen-Chat direkt in Nextcloud. Die Infrastruktur besteht aus mehreren Komponenten:

| Komponente | Funktion |
|------------|----------|
| `talk` (App) | Nextcloud-App für Chat & Calls |
| `spreed-signaling` (HPB) | High-Performance Backend für Signalisierung bei mehreren Teilnehmern |
| `coturn` | TURN/STUN-Server für NAT-Traversal (Firewall-Durchquerung) |
| `janus` + `nats` | Medienserver und Message-Broker |

### Signaling-Proxy

Da PHP/libcurl `*.localhost`-Adressen intern auf `127.0.0.1` auflöst, wird ein Apache-Proxy in Nextcloud konfiguriert (`nextcloud-signaling-proxy` ConfigMap). Dieser leitet PHP-seitige Signaling-Aufrufe (`/api/v1/`) intern an `spreed-signaling:8080` weiter, ohne den Browser-WebSocket-Traffic zu beeinflussen.

---

## Konfiguration

### Extra-Konfiguration

**Datei:** `k3d/nextcloud-extra-config.php` → gemountet als `/var/www/html/config/zz-extra.config.php`

| Parameter | Wert |
|-----------|------|
| `trusted_proxies` | RFC1918-CIDRs (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.1/32) |
| `forwarded_for_headers` | `HTTP_X_FORWARDED_FOR` |
| `default_phone_region` | `DE` |
| `maintenance_window_start` | `1` (Uhr; Wartung um 01:00 Uhr nachts) |
| `log_rotate_size` | 100 MB |

### SMTP-Konfiguration (Dev → Mailpit)

Nextcloud sendet E-Mails im Dev-Betrieb an Mailpit (kein echter Mailversand):

| Parameter | Wert |
|-----------|------|
| `SMTP_HOST` | `mailpit` |
| `SMTP_PORT` | `1025` |
| `MAIL_FROM_ADDRESS` | `nextcloud` |
| `MAIL_DOMAIN` | `workspace.local` |

Eingehende Mails sind unter http://mail.localhost einsehbar.

### Persistenz

| PVC | Zweck | Grösse |
|-----|-------|--------|
| `nextcloud-app` | Nextcloud-Anwendungsdaten, Apps | 2 Gi |
| `nextcloud-data-pvc` | Nutzerdaten (Dateien) | 50 Gi |

### Sidecars im Pod

Das Nextcloud-Deployment enthält zwei Container in einem Pod:

| Container | Funktion |
|-----------|----------|
| `nextcloud` | Hauptanwendung (Apache) |
| `nextcloud-cron` | Führt `cron.php` alle 5 Minuten aus |

---

## Betrieb

```bash
# Apps einmalig nach dem Deployment aktivieren
task workspace:post-setup

# Logs anzeigen
task workspace:logs -- nextcloud

# Pod neu starten
task workspace:restart -- nextcloud

# occ-Befehle ausführen (als www-data, UID 33)
kubectl exec -n workspace deploy/nextcloud -c nextcloud -- \
  setpriv --reuid=999 --regid=999 --clear-groups php occ <befehl>

# Beispiel: App-Liste anzeigen
kubectl exec -n workspace deploy/nextcloud -c nextcloud -- \
  setpriv --reuid=999 --regid=999 --clear-groups php occ app:list

# Beispiel: Nextcloud-Status
kubectl exec -n workspace deploy/nextcloud -c nextcloud -- \
  setpriv --reuid=999 --regid=999 --clear-groups php occ status
```

---

## Fehlerbehebung

### Datei-Upload schlägt fehl

- Max-Upload-Grösse prüfen: Standard ist 512 MB (konfigurierbar via PHP-INI)
- `trusted_proxies` in `nextcloud-extra-config.php` muss die Traefik-CIDR enthalten
- Ingress-Annotation `proxy-body-size` prüfen

### Talk-Video funktioniert nicht

- coturn-Pod-Status prüfen: `kubectl get pods -n workspace | grep coturn`
- TURN-Credentials in Nextcloud Admin unter **Talk → TURN-Server** kontrollieren
- HPB-Signaling-Logs: `task workspace:logs -- spreed-signaling`
- coturn-Logs: `task workspace:logs -- coturn`

### OIDC-Login schlägt fehl

- `user_oidc`-App in Nextcloud aktiviert? `task workspace:post-setup` erneut ausführen
- Keycloak-Client `nextcloud` vorhanden und Secret korrekt? Secret unter `workspace-secrets` Key `NEXTCLOUD_OIDC_SECRET` prüfen
- Keycloak-Pod läuft: `kubectl get pods -n workspace | grep keycloak`
- Provider-URL erreichbar: `http://keycloak:8080/realms/workspace/.well-known/openid-configuration`

### Collabora nicht erreichbar

- Pod-Status: `kubectl get pods -n workspace | grep collabora`
- WOPI-URL im Nextcloud Admin-Panel korrekt gesetzt?
- Logs: `task workspace:logs -- collabora`
