# Vaultwarden — Passwort-Manager

## Übersicht

Vaultwarden ist ein inoffizieller, selbst gehosteter Bitwarden-kompatibler Server. Alle Standard-Bitwarden-Clients (Browser-Extension, Desktop-App, Mobile-Apps) funktionieren sofort – es ist kein zusätzliches Setup erforderlich. Vaultwarden speichert alle Passwörter, Notizen und Dokumente in der lokalen PostgreSQL-Datenbank des Workspace MVP.

**Wichtig:** Vaultwarden hat KEINE Website-UI – es gibt nur ein Backend für die Bitwarden-Apps/Extensions und ein separates **Admin-Panel** zum Verwalten von Benutzern und Organizationen.

| Umgebung | URL |
|----------|-----|
| Dev (k3d) | `http://vault.localhost` |
| Produktion | `https://vault.korczewski.de` |

**Image:** `vaultwarden/server:1.35.3-alpine`

**Abhängigkeiten:** PostgreSQL (Datenbank), Keycloak (optionales OIDC SSO)

**Namespace:** `workspace`

---

## OIDC-Integration (Single Sign-On)

Vaultwarden kann über Keycloak per OpenID Connect (OIDC) authentifizieren lassen. Dies ermöglicht den Login mit dem Workspace-Account statt separate Passwörter zu verwalten.

### Konfiguration

Die OIDC-Integration wird via Umgebungsvariablen konfiguriert:

| Variable | Wert (Dev) | Beschreibung |
|----------|-----------|-------------|
| `SSO_ENABLED` | `true` | OIDC aktivieren |
| `SSO_ONLY` | `false` | OIDC ist optional – Passwort-Login bleibt verfügbar |
| `SSO_CLIENT_ID` | `vaultwarden` | Client-ID im Keycloak-Realm |
| `SSO_CLIENT_SECRET` | aus Secret | OIDC-Secret aus Keycloak (wird bei Import substituiert) |

### OIDC-Ablauf

1. **Nutzer öffnet Bitwarden-App/Extension** und klickt auf „Mit SSO anmelden"
2. **App leitet zu Keycloak weiter** (Login-Seite)
3. **Keycloak authentifiziert den Nutzer** mit seinem Workspace-Account
4. **Keycloak gibt einen Token an Vaultwarden zurück**
5. **Vaultwarden erstellt/aktualisiert das Konto** basierend auf Keycloak-Daten
6. **Bitwarden-App erhält Zugang** — Passwörter sind jetzt im Vault sichtbar

**Einschränkung:** Bitwarden-Clients müssen die **Server-URL** auf `http://vault.localhost` (Dev) oder `https://vault.korczewski.de` (Prod) konfigurieren, sonst können sie nicht mit der lokal gehosteten Instanz sprechen.

---

## Admin-Panel

Vaultwarden hat ein separates Admin-Panel zum Verwalten von Benutzern, Organizationen und Logs. Der Zugang erfolgt über einen Token (nicht über SSO).

### Admin-Zugang

- **URL:** `http://vault.localhost/admin` (Dev) oder `https://vault.korczewski.de/admin` (Prod)
- **Token:** `ADMIN_TOKEN` aus dem Secret `workspace-secrets` (Key: `VAULTWARDEN_ADMIN_TOKEN`)

Das Token wird als URL-Parameter übermittelt:

```
http://vault.localhost/admin?token=<ADMIN_TOKEN>
```

### Admin-Panel Funktionen

| Funktion | Beschreibung |
|----------|-------------|
| **Users** | Benutzer anzeigen, erstellen, deaktivieren, löschen |
| **Organizations** | Organisationen verwalten (Gruppen für gemeinsame Passwörter) |
| **Invitations** | Einladungs-Links für neue Benutzer erstellen |
| **Logs** | Authentifizierungs- und Sicherheitslogs einsehen |
| **Diagnostics** | System-Status und Fehler-Diagnose |

---

## Bitwarden-Client konfigurieren

### Browser-Extension (Chrome, Firefox, Edge, Safari)

1. **Bitwarden-Extension öffnen**
2. **Zahnrad-Symbol (Einstellungen)** → **Server-Einstellungen**
3. **Server-URL ändern:**
   - Dev: `http://vault.localhost`
   - Prod: `https://vault.korczewski.de`
4. **Speichern**
5. **Extension neu laden** (browser refresh)
6. **Konto erstellen oder mit SSO anmelden**

### Desktop-App (Windows, macOS, Linux)

1. **Bitwarden Desktop öffnen**
2. **Zahnrad-Symbol (Settings)** → **Server-Einstellungen** (links oben)
3. **Self-Hosted-Environment einschalten**
4. **Server-URL eingeben:**
   - Dev: `http://vault.localhost`
   - Prod: `https://vault.korczewski.de`
5. **Speichern und neu starten**
6. **Konto erstellen oder mit SSO anmelden**

### Mobile-Apps (iOS, Android)

1. **Bitwarden-App öffnen** → **Einstellungen** (unten rechts)
2. **Server** oder **Self-Hosted** (abhängig von App-Version)
3. **Server-URL eingeben:**
   - Dev: `http://vault.localhost`
   - Prod: `https://vault.korczewski.de`
4. **Speichern**
5. **App neu starten**
6. **Konto erstellen oder mit SSO anmelden**

### Passwörter importieren

Wenn du bereits einen anderen Passwort-Manager nutzt (1Password, LastPass, KeePass, etc.):

1. **Im anderen Manager:** Passwörter als **CSV-Datei** exportieren
2. **Vaultwarden Web-Vault öffnen:** `http://vault.localhost` (kein Admin-Panel)
3. **Einstellungen** → **Daten importieren**
4. **Format wählen** (z.B. „1Password (CSV)", „Bitwarden (JSON)", etc.)
5. **CSV-Datei hochladen**
6. **Bestätigen** — Passwörter werden importiert

---

## Seed-Job: Produktions-Secrets als Template

Der Seed-Job (`vaultwarden-seed-job.yaml`) ist ein Kubernetes Job, der Vaultwarden nach dem Start mit Production-Secret-Templates befüllt. Ziel ist es, häufig benötigte Service-URLs (Nextcloud, Keycloak, Collabora, etc.) als Passwort-Einträge vorab zu speichern.

### Was der Seed macht

1. **Bitwarden CLI installiert** (npm)
2. **Mit Admin-Account einloggt** (aus Secret: `BW_EMAIL`, `BW_PASSWORD`)
3. **Ordner erstellt:**
   - `Infrastructure`
   - `Services`
   - `MCP Keys`
4. **Service-URLs seeded:**
   - Nextcloud (Dateien + Talk)
   - Collabora Office
   - Keycloak (SSO)
   - Invoice Ninja (Abrechnung)
   - Portal und Admin-Bereich
   - Claude Code KI
   - Docs

### Seed-Job ausführen

```bash
task workspace:vaultwarden:seed
```

Dies führt den Job manuell aus (nützlich nach Deployment oder wenn man neue Service-URLs hinzufügen will).

### Seed-Job Logs prüfen

```bash
task workspace:vaultwarden:seed-logs
```

Zeigt die Ausgabe des Seed-Jobs, um zu überprüfen, ob alle Services erfolgreich seeded wurden.

### Seed-Credentials zurücksetzen

Die Seed-Credentials sind in der Secret `vaultwarden-seed-credentials` definiert:

- **Email:** `admin@workspace.local` (Standard, ändert sich nicht)
- **Master-Passwort:** `CHANGE_ME_AFTER_FIRST_LOGIN` (Placeholder)

**Wichtig:** Nach dem ersten Deployment solltest du das Admin-Passwort im Admin-Panel ändern:

1. **Admin-Panel öffnen:** `http://vault.localhost/admin?token=<TOKEN>`
2. **Users** → **admin@workspace.local** → **Passwort ändern**

---

## Datenspeicher & Persistierung

Vaultwarden speichert Daten an zwei Orten:

| Datenart | Speicherort |
|----------|------------|
| **Passwörter, Notizen, Dokumente** | PostgreSQL Database (`vaultwarden` DB) |
| **Anhänge (Premium)** | PersistentVolumeClaim `vaultwarden-data-pvc` (5 Gi) |

Die Datenbank wird regelmäßig gebackupt (siehe PostgreSQL-Dokumentation).

---

## Betrieb

### Status & Logs

```bash
# Vaultwarden-Pod prüfen
task workspace:status | grep vaultwarden

# Logs ansehen (aktuelle Container-Ausgabe)
task workspace:logs -- vaultwarden

# Pod neu starten
task workspace:restart -- vaultwarden

# Health-Check: Sollte 200 antworten
curl http://vault.localhost/alive
```

### Health-Checks

Vaultwarden hat einen einfachen Health-Endpoint:

```bash
curl http://vault.localhost/alive
# Ausgabe: Vault is alive! (oder ähnlich)
```

### Ressourcen

| Ressource | Anforderung | Limit |
|-----------|-----------|-------|
| CPU | 100m | 500m |
| Memory | 256 Mi | 512 Mi |

Falls viele Benutzer gleichzeitig aktiv sind, kann der Memory-Verbrauch anwachsen.

---

## Fehlerbehebung

### OIDC-Login schlägt fehl

**Problem:** Fehler wie „Invalid client credentials" oder Redirect funktioniert nicht.

**Lösungen:**

1. **Client-ID prüfen:** In Keycloak (`http://auth.localhost`) → Realm `workspace` → Clients → `vaultwarden`
   - Client-ID muss exakt `vaultwarden` sein

2. **Client-Secret stimmt überein:**
   - Keycloak-Client-Secret = `SSO_CLIENT_SECRET` in Vaultwarden Deployment
   - Wird bei Realm-Import via `envsubst` substituiert

3. **Redirect-URI konfiguriert:**
   - In Keycloak: `http://vault.localhost/identity/connect/oidc-signin`
   - Muss exakt im Client konfiguriert sein

4. **Server-URL stimmt:**
   - `SSO_IDENTITY_PROVIDER_REDIRECT_URL` sollte auf `http://vault.localhost` zeigen (oder Prod-URL)

5. **Logs prüfen:**
   ```bash
   task workspace:logs -- vaultwarden | grep -i oidc
   ```

### Bitwarden-Client verbindet nicht

**Problem:** Browser-Extension oder Desktop-App zeigt Fehler beim Verbinden.

**Lösungen:**

1. **Server-URL korrekt gesetzt?**
   - Dev: `http://vault.localhost` (nicht `https`!)
   - Prod: `https://vault.korczewski.de` (HTTPS erforderlich)

2. **Netzwerk-Konnektivität testen:**
   ```bash
   curl http://vault.localhost/alive
   ```
   Falls nicht erreichbar: Vaultwarden läuft nicht oder ist nicht routbar

3. **Browser-Console prüfen:**
   - F12 → Console Tab
   - Auf CORS-Fehler oder andere Netzwerk-Fehler prüfen

4. **App/Extension neu laden:**
   - Einstellungen speichern und App komplett neu starten

### Admin-Panel nicht erreichbar

**Problem:** `http://vault.localhost/admin?token=...` zeigt „401 Unauthorized" oder ähnlich.

**Lösungen:**

1. **Token prüfen:**
   ```bash
   kubectl get secret workspace-secrets -n workspace -o jsonpath='{.data.VAULTWARDEN_ADMIN_TOKEN}' | base64 -d
   ```
   - Token muss korrekt in der Admin-URL übergeben werden

2. **Admin-Token generieren** (falls gelöscht oder falsch):
   ```bash
   # Admin-Token neu generieren und in Secret speichern
   ADMIN_TOKEN=$(openssl rand -base64 32)
   kubectl patch secret workspace-secrets -n workspace --type merge -p "{\"data\": {\"VAULTWARDEN_ADMIN_TOKEN\": \"$(echo -n $ADMIN_TOKEN | base64)\"}}"
   task workspace:restart -- vaultwarden
   ```

3. **Logs prüfen:**
   ```bash
   task workspace:logs -- vaultwarden | tail -50
   ```

### Seed-Job schlägt fehl

**Problem:** `task workspace:vaultwarden:seed` zeigt Fehler.

**Lösungen:**

1. **Seed-Job Logs prüfen:**
   ```bash
   task workspace:vaultwarden:seed-logs
   ```

2. **Häufige Fehler:**
   - `Failed to login` — Admin-Account existiert nicht oder Passwort ist falsch
     - Lösung: Admin-Konto manuell in Vaultwarden erstellen
   - `npm install -g @bitwarden/cli` schlägt fehl — Node.js Problem oder npm-Registry nicht erreichbar
     - Lösung: Job neu starten oder Image-Update

3. **Admin-Konto erstellen (manuell):**
   - Öffne Bitwarden-App
   - Keycloak-Login oder E-Mail-Passwort: `admin@workspace.local`
   - Falls kein Admin existiert: Registriere den Account manuell

### Pod startet nicht / crasht sofort

**Problem:** Vaultwarden-Pod ist `CrashLoopBackOff` oder `ImagePullBackOff`.

**Lösungen:**

1. **Logs prüfen:**
   ```bash
   kubectl logs -n workspace deploy/vaultwarden --previous
   ```

2. **Häufige Fehler:**
   - `DATABASE_URL nicht gesetzt` — PostgreSQL Secret oder ConfigMap fehlt
   - `database connection failed` — PostgreSQL läuft nicht oder ist nicht erreichbar
   - `bind: address already in use` — Port 80 ist belegt (unwahrscheinlich in K3d)

3. **Datenbank-Verbindung testen:**
   ```bash
   task workspace:psql -- vaultwarden
   # Oder: SELECT 1; zum Testen
   ```

### Passwörter-Synchronisierung zwischen Geräten funktioniert nicht

**Problem:** Änderungen auf einem Gerät erscheinen nicht auf anderen.

**Ursachen & Lösungen:**

- **Offline-Modus:** Apps sind offline und synchronisieren nicht
  - Lösung: Internet-Verbindung prüfen, App aktualisieren
  
- **Server-URL unterschiedlich:** Ein Gerät zeigt auf andere URL
  - Lösung: Alle Geräte auf gleiche Server-URL einstellen

- **Alte App-Version:** Vaultwarden-Server ist neuer als App
  - Lösung: Bitwarden-App aktualisieren

### Memory/Speicher-Auslastung hoch

**Problem:** Vaultwarden nimmt viel Memory, Pod wird OOMKilled.

**Lösungen:**

- **Memory-Limit erhöhen:**
  ```bash
  # In k3d/vaultwarden.yaml limits.memory ändern (z.B. auf 1Gi)
  ```

- **Große Anhänge reduzieren:**
  - Admin-Panel prüfen: Welche Benutzer haben große Attachments?
  - Alte/unnötige Anhänge löschen

---

## Umgebungsvariablen (Referenz)

| Variable | Beispiel | Beschreibung |
|----------|----------|-------------|
| `VAULTWARDEN_DB_PASSWORD` | (aus Secret) | PostgreSQL-Passwort für vaultwarden-Benutzer |
| `DATABASE_URL` | `postgresql://vaultwarden:...@shared-db:5432/vaultwarden` | Vollständige Datenbank-Connection-String |
| `ADMIN_TOKEN` | (aus Secret) | Token zum Zugriff auf `/admin` Panel |
| `DOMAIN` | `http://vault.localhost` (Dev) | Server-URL für SSO-Callback |
| `VAULT_DOMAIN` | (aus ConfigMap) | Alternative Server-URL (wird in Realm substituiert) |
| `SSO_ENABLED` | `true` | OIDC SSO aktivieren |
| `SSO_ONLY` | `false` | Passwort-Login bleibt verfügbar |
| `SSO_CLIENT_ID` | `vaultwarden` | Client-ID in Keycloak |
| `SSO_CLIENT_SECRET` | (aus Secret) | Client-Secret aus Keycloak |

---

## Sicherheit

### DSGVO/Datenschutz

Alle Passwörter und Daten werden in der lokalen PostgreSQL-Datenbank gespeichert und verlassen das Netzwerk nicht. Backups sollten lokal und verschlüsselt aufbewahrt werden.

### Verschlüsselung

- **Passwörter in der DB:** AES-256 verschlüsselt (Vaultwarden/Bitwarden-Standard)
- **Transport (Prod):** HTTPS via Traefik und cert-manager
- **Admin-Token:** Sollte stark und geheim gehalten werden

### Best Practices

1. **Admin-Token regelmäßig wechseln**
2. **Starke Master-Passwörter verwenden**
3. **Regelmäßige Backups der PostgreSQL-Datenbank**
4. **Keycloak SSO für Mehrbenutzer-Szenarien verwenden**
5. **Audit-Logs im Admin-Panel regelmäßig prüfen**

---

## Verwandte Services

- **Keycloak** (`k3d/keycloak.yaml`) — OIDC Identity Provider
- **PostgreSQL** (`k3d/postgres.yaml`) — Shared Database (vaultwarden DB)
- **Traefik Ingress** (`k3d/ingress.yaml`) — routet `vault.localhost` zu Vaultwarden Service

**Daten-Fluss:**

```
Bitwarden-App/Extension
    ↓ (OIDC)
Keycloak ← SSO Login
    ↓ (Authorization)
Vaultwarden API
    ↓ (Passwörter lesen/speichern)
PostgreSQL (vaultwarden DB)
```

---

## Relevante Dateien

| Datei | Zweck |
|-------|-------|
| `k3d/vaultwarden.yaml` | Deployment + Service + PVC |
| `k3d/vaultwarden-seed-job.yaml` | Seed-Job für Service-URLs |
| `k3d/vaultwarden-seed-credentials.yaml` | Admin-Credentials für Seed-Job |
| `k3d/realm-workspace-dev.json` | Keycloak Realm mit vaultwarden OIDC-Client |
| `scripts/import-users.sh` | (Optional) Massenimport von Benutzern |
