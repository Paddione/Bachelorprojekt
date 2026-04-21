# Collabora Online — Office Suite

## Übersicht

Collabora Online ist das integrierte Büro-Programm des Workspace MVP. Es basiert auf LibreOffice und ermöglicht das Öffnen, Anzeigen und gemeinsame Bearbeiten von Office-Dokumenten direkt im Browser – ohne zusätzliche Software auf dem lokalen Rechner.

**Wichtig:** Collabora hat KEINE eigene Benutzeroberfläche. Ein direkter Aufruf von `http://office.localhost` antwortet mit `OK` und bestätigt damit nur, dass der Dienst läuft. Alle Dokumentenbearbeitung erfolgt über Nextcloud (über das WOPI-Protokoll).

| Umgebung | URL |
|----------|-----|
| Dev (k3d) | http://office.localhost |
| Produktion | https://office.korczewski.de |

**Image:** `ghcr.io/paddione/collabora-code:25.04.9.4.1-setcap`

**Abhängigkeiten:** Nextcloud (WOPI-Client, enthält die `richdocuments`-App)

**Namespace:** `workspace-office` (dediziert, da Collabora CAP_SYS_ADMIN benötigt)

---

## WOPI-Integration mit Nextcloud

Das WOPI-Protokoll (Web Open Platform Interface) ist die Schnittstelle zwischen Nextcloud und Collabora. So funktioniert der Ablauf:

1. **Nutzer öffnet Dokument in Nextcloud**
   - Nutzer navigiert zu einem Dokument (z.B. `.docx`, `.xlsx`, `.odp`) in Nextcloud Files
   - Nextcloud erkennt den Dateityp und zeigt einen „Mit Collabora öffnen"-Button

2. **Nextcloud generiert WOPI-Token**
   - Nextcloud erzeugt ein zeitgebundenes, verschlüsseltes WOPI-Token
   - Dieses Token gibt Collabora Zugriff auf die Datei im Backend

3. **Collabora lädt Dokument via WOPI**
   - Nextcloud sendet einen Request an Collabora mit Datei-URL, Token und Metadaten
   - Collabora authentifiziert sich mit dem Token und lädt die Datei von Nextcloud

4. **Editor im Browser (iframe)**
   - Collabora startet einen rich-text Editor (auf Basis von LibreOffice Core)
   - Dieser Editor läuft als iframe innerhalb der Nextcloud-Oberfläche
   - Alle Änderungen werden in Echtzeit via WOPI zurück an Nextcloud synchronisiert

**WOPI-Endpunkte:**
- Capabilities: `http://office.localhost/hosting/capabilities`
- WASM: `http://office.localhost/hosting/wasm`
- Discovery: `http://office.localhost/hosting/discovery`

---

## Unterstützte Dateiformate

Collabora unterstützt die folgenden Office-Formate:

| Kategorie | Formate |
|-----------|---------|
| **Writer** (Text) | `.odt`, `.docx`, `.doc`, `.rtf`, `.txt` |
| **Calc** (Tabellen) | `.ods`, `.xlsx`, `.xls`, `.csv` |
| **Impress** (Präsentationen) | `.odp`, `.pptx`, `.ppt` |
| **Draw** (Zeichnungen) | `.odg`, `.svg` |
| **Anzeige-only** | `.pdf` |

**Hinweis:** Microsoft-Formate (`.docx`, `.xlsx`, `.pptx`) werden durch Konvertierung in das ODF-Format intern verarbeitet und sind voll bearbeitbar.

---

## Konfiguration

### Umgebungsvariablen

Die Konfiguration erfolgt via Umgebungsvariablen, die in `k3d/office-stack/collabora.yaml` definiert sind:

| Variable | Wert (Dev) | Beschreibung |
|----------|-----------|-------------|
| `aliasgroup1` | `http://nextcloud.workspace` | Trusted WOPI-Host (Nextcloud) |
| `server_name` | `office.localhost` | Hostname für den Server |
| `extra_params` | `--o:ssl.termination=false` | SSL-Konfiguration (dev: keine TLS) |
| `username` | `admin` | Admin-Benutzer für die Admin-Konsole |
| `password` | aus Secret | Admin-Passwort |
| `dictionaries` | `de_DE en_US` | Rechtschreib-/Grammatikprüfung (Deutsch + Englisch) |

### Trusted Domains (aliasgroup)

Die Variable `aliasgroup1` muss alle Hosts enthalten, die auf Collabora via WOPI zugreifen dürfen. In der Konfiguration:

- **Dev:** `http://nextcloud.workspace` (Kubernetes Service-DNS)
- **Prod:** `https://files.korczewski.de` (externe HTTPS-URL)

Diese werden zur Deployment-Zeit via `envsubst` (Dev) oder Kustomize-CMP (Prod) injiziert.

### Security Capabilities

Collabora läuft in einem eigenen Namespace (`workspace-office`) mit erweiterten Linux-Capabilities:

```
CAP_SYS_ADMIN   — für Bind-Mounts (systemplate in Document Jail)
CAP_MKNOD       — für Device Nodes im Jail
CAP_SETUID      — für user namespace remapping
CAP_SETGID      — für group namespace remapping
CAP_CHOWN       — für Datei-Ownership in Jails
CAP_FOWNER      — für Datei-Attribute ohne Owner-Check
CAP_SYS_CHROOT  — für chroot (Document Jail)
```

Diese sind im Custom-Image `ghcr.io/paddione/collabora-code:25.04.9.4.1-setcap` baked-in (nicht zur Laufzeit hinzugefügt), damit coolwsd als Non-Root-User (`cool`) läuft.

---

## Betrieb

### Status & Logs

```bash
# Collabora-Pod-Status ansehen
task workspace:status | grep collabora

# Logs (aktuelle Container-Ausgabe)
task workspace:logs -- collabora

# Pod neu starten
task workspace:restart -- collabora

# Health-Check: Collabora sollte auf /hosting/capabilities mit 200 antworten
curl http://office.localhost/hosting/capabilities

# Einfache Verbindungsprüfung
curl http://office.localhost/
# Ergebnis: OK (das ist normal und bedeutet, Collabora läuft)
```

### Ressourcen

| Ressource | Anforderung | Limit |
|-----------|------------|-------|
| CPU | 200m | — (no limit) |
| Memory | 256 Mi | 1 Gi |

Hinweis: Collabora ist speicher-intensiv. Wenn viele Dokumente gleichzeitig offen sind, kann der Speicher bis zur 1 Gi-Grenze anwachsen. Der Pod wird dann OOMKilled und restartet.

---

## Fehlerbehebung

### Collabora nicht erreichbar

**Problem:** Nextcloud zeigt „Collabora ist nicht erreichbar" oder Dokumente können nicht geöffnet werden.

**Lösungsschritte:**

1. **Pod läuft?**
   ```bash
   kubectl get pods -n workspace-office
   ```
   Sollte `collabora-xxxxx` mit Status `Running` anzeigen. Falls `CrashLoopBackOff`: Logs prüfen.

2. **Nextcloud sieht Collabora?**
   - Nextcloud Admin-Panel → **Office** → **Collabora Online**
   - WOPI-URL muss auf WOPI-Endpunkt zeigen: `http://office.localhost` (Dev)
   - **Verbindungstest** durchführen (Button im Admin-Panel)

3. **Network-Connectivity?**
   ```bash
   # Von Nextcloud-Pod aus testen
   kubectl exec -n workspace deploy/nextcloud -c nextcloud -- curl http://office.localhost/
   ```
   Sollte `OK` zurückgeben.

4. **Logs prüfen:**
   ```bash
   task workspace:logs -- collabora
   ```
   Fehler wie `Address already in use` oder `bind mount failed` deuten auf Konfigurationsprobleme hin.

### SSL/TLS-Fehler (Produktion)

**Problem:** Fehler wie `SSL_ERROR_BAD_CERT_DOMAIN` oder ähnliches.

**Ursachen & Lösungen:**

- **Falsche `aliasgroup1`:** Muss die Produktions-Domain enthalten (`https://files.korczewski.de`)
  - Prüfen in `prod/office-stack/collabora-patch.yaml` oder im deployen ConfigMap
  
- **SSL-Termination nicht gesetzt:** `extra_params` muss `--o:ssl.termination=true` enthalten
  - Wird in der Prod-Patch korrekt gesetzt

- **Zertifikat ungültig:** Wenn Collabora auf der Prod-Domain selbst ein TLS-Cert braucht
  - Aktuell nutzt `office.korczewski.de` das gleiche Wildcard-Cert wie andere Services
  - cert-manager sollte dieses automatisch provisionieren

### Dokument wird nicht geladen

**Problem:** Nutzer sieht einen leeren Editor oder „Datei kann nicht geladen werden".

**Ursachen:**

- **WOPI-Token abgelaufen** — Token sind 1 Stunde gültig
  - Lösung: Nutzer aktualisiert die Nextcloud-Seite und öffnet das Dokument erneut

- **Falsche WOPI-URL** — Nextcloud sendet Anfrage an falsche Collabora-Adresse
  - Nextcloud Admin-Panel → Office → URL prüfen

- **Datei-Berechtigung:** Nutzer hat keine Leseberechtigung auf die Datei in Nextcloud
  - Datei-Berechtigung in Nextcloud überprüfen (Sharing)

- **Zu großes Dokument** — Bei sehr großen Dateien kann das Laden timeout
  - Datei-Größe reduzieren oder Dokument aufteilen

### Pod startet nicht / crasht sofort

**Problem:** `collabora-xxxxx` ist im Status `CrashLoopBackOff` oder `ImagePullBackOff`.

**Lösungen:**

1. **Image nicht abrufbar?**
   ```bash
   kubectl describe pod -n workspace-office $(kubectl get pods -n workspace-office -l app=collabora -o jsonpath='{.items[0].metadata.name}')
   ```
   Falls `ImagePullBackOff`: Image-Pull-Secret prüfen, GHCR-Token aktualisieren.

2. **Insufficient Ressourcen?**
   - Node hat nicht genug Memory für 256Mi Request?
   - `kubectl top nodes` prüfen

3. **Capabilities-Fehler?**
   - Custom-Image mit Setcap wird benötigt
   - Sicherstellen, dass die korrekte Image-Version deployed ist

4. **Logs:**
   ```bash
   kubectl logs -n workspace-office deploy/collabora --previous
   ```

### Rechtschreib-/Grammatikprüfung funktioniert nicht

**Problem:** Rote Wellenlinien (Rechtschreibfehler) erscheinen nicht.

**Lösung:**

Die `dictionaries`-Variable muss das entsprechende Sprach-Pack enthalten:

```
dictionaries: "de_DE en_US"
```

Falls `de_DE` nicht vorhanden: Manifest ändern und Collabora neu deployen.

### Mehrere Nutzer können nicht gleichzeitig arbeiten

**Problem:** Nur ein Nutzer kann das Dokument zur Zeit öffnen.

**Ursache:** Das ist nicht automatisch – es liegt an der Nextcloud-Konfiguration.

**Lösung:**

- Nextcloud Admin → Office → Simultaneous Editing aktivieren
- Nach `post-setup` sollte dies automatisch konfiguriert sein

---

## Erweiterungen & Customization

Collabora wird vom upstream-Image `collabora/code` bereitgestellt. Das Custom-Image `ghcr.io/paddione/collabora-code:25.04.9.4.1-setcap` fügt Linux-Capabilities hinzu.

Falls zusätzliche Konfigurationen (z.B. benutzerdefinierte Toolbar, Add-Ons) erforderlich sind:

1. **Dockerfile erweitern** (im GitHub Repo unter `.github/workflows/build-collabora.yml`)
2. **Lokale Build-Pipeline:** `task collabora:build` (falls vorhanden)
3. **Image pushen** zu GHCR und in `collabora.yaml` updaten

---

## Verwandte Services

- **Nextcloud** (`k3d/nextcloud.yaml`) — enthält `richdocuments`-App, die Collabora aufruft
- **PostgreSQL** (`k3d/postgres.yaml`) — Nextcloud-Datenbank
- **Traefik Ingress** (`k3d/ingress.yaml`) — routet `office.localhost` zu Collabora Service

**Kein direkter Datenaustausch mit anderen Services** — Collabora kommuniziert nur mit Nextcloud via WOPI.
