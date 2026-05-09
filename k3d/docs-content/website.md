# Website — Astro + Svelte

## Übersicht

Die Website ist das Herzstück des Workspace MVP. Sie ist eine Astro SSR-Anwendung mit eingebautem Chat/Messaging-System und integriert sich direkt über PostgreSQL mit dem Workspace. Es gibt zwei Website-Instanzen:

- **mentolder.de** – Hauptinstanz (Coaching-Plattform)
- **korczewski.de** – Branding-Variante

Beide teilen die gleiche Architektur, unterscheiden sich aber in Branding und Inhalten.

| Parameter | Dev | Produktion |
|-----------|-----|-----------|
| URL | `http://web.localhost` | `https://web.mentolder.de` (oder korczewski.de) |
| Namespace | `website` | `website` |
| Tech-Stack | Astro 5.7 + Svelte 5.0 + TypeScript | gleich |
| Datenbank | PostgreSQL `website` (shared-db) | gleich |
| Container-Image | `workspace-website:latest` | wie Dev |
| SSO | Keycloak OIDC (`website`-Client) | gleich |

**Abhängigkeiten:**
- PostgreSQL (shared-db, Datenbank `website`)
- Keycloak (OIDC-Provider)
- Nodemailer (E-Mail-Versand, via Mailpit in Dev)

---

## Verzeichnisstruktur

```
website/                        # mentolder.de Haupt-Instanz
├── src/
│   ├── pages/                 # Astro-Seiten und API-Routes
│   ├── components/            # Svelte-Komponenten (Chat, UI)
│   ├── layouts/               # Page Layouts
│   └── lib/                   # Utilities, Datenbankfunktionen
├── public/                    # Statische Assets
├── astro.config.mjs           # Astro-Konfiguration (SSR, Adapter)
├── package.json               # Node-Dependencies
├── Dockerfile                 # Multi-Stage Build
└── tsconfig.json

korczewski-website/             # korczewski.de Branding-Variante
└── [gleiche Struktur, unterschiedliches Branding]
```

**Wichtige Dateien:**
- `src/lib/db.ts` – PostgreSQL-Verbindung (node-postgres `pg`)
- `src/pages/api/chat.ts` – Chat/Messaging-API
- `src/pages/login.astro` – Keycloak OIDC Login-Seite
- `Dockerfile` – Docker Multi-Stage Build (Node.js 22 Alpine)

---

## Funktionen

### Chat & Messaging
Das Chat-System ist direkt in die Website eingebaut (nicht als separater Service). Nutzer können:
- In Echtzeit chatten (WebSocket oder Polling)
- Chat-Nachrichten in PostgreSQL speichern
- Chat-Fenster in Astro-Komponenten rendern

### SSO & Authentifizierung
- Login über Keycloak (OIDC Authorization Code Flow mit PKCE)
- Automatische Benutzer-Synchronisierung mit Keycloak-Daten
- Session-Management via HTTP Cookies (Astro Built-In)

### Booking-System (Portal)
Falls aktiviert:
- Termine buchen (über Nextcloud Calendar API)
- Kalender-Integration

### Admin-Interface
- Admin-Nutzer (konfiguriert via `PORTAL_ADMIN_USERNAME` in ConfigMap)
- Zugriff auf Admin-Panel für Projekt- und Benutzer-Verwaltung

---

## Lokale Entwicklung

### Dev-Server starten (Hot-Reload)
```bash
task website:dev
```
Dies startet den Astro Dev-Server auf `http://localhost:4321` mit Hot-Reload für Svelte-Komponenten und Astro-Seiten.

**Voraussetzungen:**
- Node.js (LTS empfohlen, siehe `Dockerfile`)
- npm

```bash
cd website/
npm ci          # Dependencies installieren (locked via package-lock.json)
npm run dev     # Astro Dev-Server
```

**Environment-Variablen (für Dev):**
Diese werden via ConfigMap `website-config` in Kubernetes injiziert:
```
KEYCLOAK_URL=http://keycloak.workspace.svc.cluster.local:8080
KEYCLOAK_REALM=workspace
NEXTCLOUD_URL=http://nextcloud.workspace.svc.cluster.local
SMTP_HOST=mailpit
SMTP_PORT=1025
```

### Debugging
- Browser DevTools für Frontend (Svelte Components)
- `npm run test:api` für API-Tests
- Pod-Logs: `task workspace:logs -- website`

---

## Build & Deployment

### Docker-Image bauen
```bash
task website:build
```
Erstellt das Docker-Image `workspace-website:latest` via Dockerfile:
1. **Build-Stage:** Node.js 22 Alpine
   - `npm ci` – Dependencies
   - `npm run build` – Astro-Build (SSR)
2. **Runtime-Stage:** Node.js 22 Alpine Slim
   - Nur `/dist` kopieren
   - Entrypoint: `node ./dist/server/entry.mjs`

### Image in k3d importieren
```bash
task website:build:import
```
Importiert das gebaute Image in die k3d-Registry, damit k3d darauf zugreifen kann.

### In Kubernetes deployen
```bash
task website:deploy
```
1. Registriert das Image in k3d (via `website:build:import`)
2. Wendet das Website-Deployment an (`k3d/website.yaml`)
3. Wartet auf Ready-Status

### Komplettes Rebuild & Redeploy
```bash
task website:redeploy
```
Kombiniert alle Schritte in einem: Bauen → Importieren → Deployen.

**Wichtig:** Vor `website:deploy` den Branch prüfen – nicht von Feature-Branches mit `k3d/website.yaml`-Änderungen deployen (siehe Feedback in CLAUDE.md).

---

## Kubernetes-Konfiguration

### Namespace
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: website
```
Die Website läuft in einem separaten Namespace (`website`), nicht im `workspace`-Namespace.

### Deployment
Siehe `k3d/website.yaml`:
- **Replicas:** 1 (Dev) / höher in Prod (mit HPA)
- **Image:** `workspace-website:latest` (oder with-tag in Prod)
- **Ports:** 3000 (intern), 80/443 (via Ingress/Traefik)
- **Liveness Probe:** HTTP GET `/` (3000)
- **Readiness Probe:** HTTP GET `/` (3000)

### ConfigMap
Alle Umgebungsvariablen kommen aus ConfigMap `website-config` (Namespace `website`):
```yaml
BRAND: "mentolder"                              # Brand-ID (für Branding-Variante)
KEYCLOAK_URL: "http://keycloak.workspace..."  # Intern
KEYCLOAK_REALM: "workspace"
NEXTCLOUD_URL: "http://nextcloud.workspace..."
SMTP_HOST: "mailpit"                           # Dev nur
FROM_EMAIL: "contact@mentolder.de"
BRAND_NAME: "Mentolder"
CONTACT_EMAIL: "p.korczewski@gmail.com"
# ... weitere
```

### Service
```yaml
apiVersion: v1
kind: Service
metadata:
  name: website
  namespace: website
spec:
  type: ClusterIP
  ports:
    - port: 80
      targetPort: 3000
```

### Ingress
Über `k3d/configmap-domains.yaml` wird die Website-Domain (`web.localhost` oder `web.mentolder.de`) konfiguriert. Traefik routet automatisch basierend auf der Host-Header.

---

## Datenbank-Schema

Die Website verwendet PostgreSQL-Datenbank `website` auf `shared-db`. Wichtige Tabellen:

| Tabelle | Zweck |
|---------|-------|
| `users` | Registrierte Benutzer (mit Keycloak-Daten) |
| `chat_messages` | Chat-Nachrichten |
| `chat_conversations` | Chat-Konversationen / Kanäle |
| `projects` | Projekte (für Admin-Interface) |
| `meetings` | Meetings (für Booking-System) |
| `artifacts` | Meeting-Artefakte (Whiteboard, Dateien) |

Siehe `k3d/website-schema.yaml` für das komplette Schema.

---

## Betrieb

### Status prüfen
```bash
task website:status
```
Zeigt:
- Deployment-Status
- Pod-Replicas
- Image-Tag
- Neueste Events

### Logs
```bash
task website:logs
```
Oder manuell:
```bash
kubectl logs -n website deployment/website --tail=100 -f
```

### Pod neu starten
```bash
task website:restart
```
Erzeugt einen Rollout Restart (neue Pods).

### Namespace löschen
```bash
task website:teardown
```
Entfernt alle Website-Ressourcen (Deployment, ConfigMap, Service, Ingress, PVC).

### ConfigMap aktualisieren
Nach Änderungen an `k3d/website.yaml` (ConfigMap):
```bash
task workspace:deploy                          # oder
kubectl apply -f k3d/website.yaml -n website
kubectl rollout restart deployment/website -n website
```

---

## Fehlerbehebung

### Build schlägt fehl
**Problem:** `npm install` oder `npm run build` fehlgeschlagen
**Lösung:**
```bash
cd website/
rm -rf node_modules package-lock.json
npm ci
npm run build
```

### Pod startet nicht
**Problem:** `CrashLoopBackOff`
**Überprüfen:**
```bash
kubectl logs -n website pod/<pod-name>
kubectl describe pod -n website <pod-name>
```
Häufige Gründe:
- Keycloak nicht erreichbar
- Datenbank-Verbindung fehlgeschlagen
- Fehlende Umgebungsvariable

### Chat funktioniert nicht
**Problem:** Chat-Nachrichten werden nicht gespeichert
**Überprüfen:**
- PostgreSQL-Verbindung: `task workspace:psql -- website`
- Tabellenexistenz: `SELECT * FROM chat_messages LIMIT 1;`
- Website-Pod Logs

### Seite lädt nicht
**Problem:** HTTP 502 Bad Gateway oder Timeout
**Überprüfen:**
1. Pod läuft: `kubectl get pods -n website`
2. Ingress konfiguriert: `kubectl get ingress -n website`
3. Service erreichbar: `kubectl get svc -n website`

### Image nicht gefunden
**Problem:** `ErrImagePull`
**Lösung:**
```bash
task website:build
task website:build:import
task workspace:deploy                         # oder
kubectl rollout restart deployment/website -n website
```

### Keycloak OIDC Redirect-Loop
**Problem:** Nutzer werden endlos zu Keycloak umgeleitet
**Überprüfen:**
1. Keycloak-Client `website` existiert und hat korrekte Redirect-URIs
2. `KEYCLOAK_FRONTEND_URL` in ConfigMap korrekt gesetzt
3. Cookie-Domain in Astro-Config

---

## Deployment in Produktion

### Unterschiede Dev → Prod

| Aspekt | Dev | Prod |
|--------|-----|------|
| **Namespace** | `website` | `website` |
| **Domain** | `web.localhost` | `web.mentolder.de` oder korczewski.de |
| **TLS** | nein | ja (cert-manager) |
| **SMTP** | Mailpit | smtp.mailbox.org (oder ähnlich) |
| **Database** | lokal (k3d) | externe PostgreSQL |
| **Replicas** | 1 | 2-3 (mit HPA) |
| **Resource Limits** | gering | streng (CPU, Memory) |

### Prod Overlay
Siehe `prod/website/` für Production-Patches:
- TLS Cert (per cert-manager)
- Replica-Count erhöht
- Resource Limits gesetzt
- SMTP auf echten Server umgeleitet

### ArgoCD Sync
Falls die Website über ArgoCD deployed wird:
```bash
task argocd:sync -- workspace-website-prod
```

---

## Weitere Ressourcen

- **Astro Dokumentation:** https://docs.astro.build
- **Svelte 5:** https://svelte.dev/docs
- **node-postgres (pg):** https://node-postgres.com
- **Keycloak OIDC:** [Keycloak-Doku](keycloak.md)
