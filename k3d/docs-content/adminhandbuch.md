# Adminhandbuch — Workspace

## Voraussetzungen

| Werkzeug | Zweck |
|----------|-------|
| Docker | Container-Runtime für k3d |
| k3d | Lokaler Kubernetes-Cluster |
| kubectl | Kubernetes CLI |
| task (go-task) | Aufgaben-Orchestrierer |
| git | Quellcode-Verwaltung |

Für die Produktionsumgebung zusätzlich: Zugang zum k3s-Cluster (Hetzner) und `kubectl` mit gesetztem Kontext.

---

## Erstmalige Einrichtung

```bash
git clone https://github.com/Paddione/Bachelorprojekt.git
cd Bachelorprojekt

# Cluster erstellen und Stack deployen
task cluster:create
task workspace:deploy

# Post-Deploy-Setup (Nextcloud-Apps aktivieren: Kalender, Kontakte, OIDC, Collabora)
task workspace:post-setup

# Optionale Dienste
task workspace:vaultwarden:seed   # Vaultwarden mit Secret-Templates befüllen
task mcp:deploy                   # Claude Code MCP-Server-Pods deployen
task website:deploy               # Astro-Website bauen und deployen
```

Alternativ als Einzeiler:

```bash
task workspace:up   # Cluster + MVP + MCP in einem Schritt
```

---

## Dienste-Übersicht mit Admin-Links

| Dienst | URL (Dev) | Admin-Zugang |
|--------|-----------|--------------|
| Keycloak | `auth.localhost` | `auth.localhost/admin` |
| Nextcloud | `files.localhost` | `files.localhost/settings/admin` |
| Collabora | `office.localhost` | Konfiguration via Nextcloud |
| Whiteboard | `board.localhost` | — |
| Vaultwarden | `vault.localhost` | `vault.localhost/admin` |
| Website / Portal | `web.localhost` | `web.localhost/admin` |
| Mailpit | `mail.localhost` | Direktzugang (keine Auth) |
| KI-Assistent | `ai.localhost` | MCP-Status-Dashboard |
| Dokumentation | `docs.localhost` | SSO-geschützt (Keycloak) |

---

## Benutzerverwaltung

### Keycloak Admin-UI

Alle Benutzerkonten werden zentral in Keycloak gepflegt. Jede Änderung gilt sofort für alle Dienste (SSO).

Aufruf: `http://auth.localhost/admin` → Realm **workspace**

#### Neuen Benutzer anlegen

1. Navigiere zu **Benutzer → Benutzer hinzufügen**
2. Felder ausfüllen: Benutzername (Kleinbuchstaben, kein Leerzeichen), E-Mail, Vorname, Nachname
3. Reiter **Zugangsdaten** → temporäres Passwort vergeben (Pflicht zur Änderung beim ersten Login)
4. Reiter **Gruppen** → Benutzer zuweisen:
   - `workspace-users` — normaler Mitarbeiter-Zugang
   - `workspace-admins` — Administratorzugang (Website-Admin-Panel, erweiterte Rechte)

#### Passwort zurücksetzen

Keycloak Admin → **Benutzer** → Benutzer auswählen → Reiter **Zugangsdaten** → **Passwort zurücksetzen** → temporäres Passwort eingeben → **Temporär: Ja** → Speichern.

#### Benutzer deaktivieren

Keycloak Admin → **Benutzer** → Benutzer auswählen → Reiter **Details** → Schalter **Aktiviert** ausschalten → Speichern. Der Benutzer kann sich sofort nicht mehr anmelden; Daten bleiben erhalten.

### Massenimport via CSV

```bash
scripts/import-users.sh --csv users.csv \
  --url http://auth.localhost \
  --admin admin \
  --pass devadmin

# Trockenlauf (keine Änderungen)
scripts/import-users.sh --csv users.csv --dry-run
```

CSV-Format: `username,email,firstname,lastname`

Fehlende Gruppen werden automatisch erstellt. Importierte Benutzer erhalten temporäre Passwörter.

### Admin-User einrichten

```bash
scripts/admin-users-setup.sh
```

Provisioniert die in `.env` definierten Admin-Benutzer (`KC_USER1`, `KC_USER2`) im workspace-Realm. Idempotent — bei bereits vorhandenen Benutzern wird nur aktualisiert.

---

## Website-Admin-Panel

Das Admin-Panel ist erreichbar unter `https://web.{DOMAIN}/admin` (Keycloak-Login mit `workspace-admins`-Gruppe erforderlich).

| Bereich | Pfad | Funktion |
|---------|------|----------|
| Inbox | `/admin/inbox` | Eingehende Kontaktanfragen |
| Nachrichten | `/admin/nachrichten` | Chat-Räume und Direktnachrichten |
| Räume | `/admin/raeume` | Chat-Räume verwalten |
| Kunden | `/admin/clients` | Kundenverwaltung |
| Projekte | `/admin/projekte` | Projektmanagement mit Gantt-Diagramm |
| Termine | `/admin/termine` | Terminbuchungen und Kalender |
| Zeiterfassung | `/admin/zeiterfassung` | Arbeitszeiterfassung |
| Rechnungen | `/admin/rechnungen` | Rechnungen und Stripe-Zahlungen |
| Meetings | `/admin/meetings` | Aufgezeichnete Meetings und Transkripte |
| Monitoring | `/admin/monitoring` | Live-Übersicht: Pod-Status und Ressourcen |
| Bugs | `/admin/bugs` | Bug-Reports und Ticket-Tracking |
| Startseite | `/admin/startseite` | Startseiten-Texte bearbeiten |
| Leistungen | `/admin/angebote` | Dienstleistungen und Preise |

---

## Nextcloud-Administration

### occ-Befehle ausführen

```bash
kubectl exec -n workspace deploy/nextcloud \
  -c nextcloud -- \
  setpriv --reuid=999 --regid=999 --clear-groups \
  php occ <befehl>
```

Nützliche occ-Befehle:

```bash
# App aktivieren
php occ app:enable <app>

# Nutzer-Storage-Limit setzen
php occ user:setting <user> files quota <limit>

# Wartungsmodus ein-/ausschalten
php occ maintenance:mode --on
php occ maintenance:mode --off

# OIDC neu konfigurieren
php occ config:app:set user_oidc ...
```

### Apps nach Deploy aktivieren

```bash
task workspace:post-setup
```

Aktiviert: Calendar, Contacts, OIDC-Login, Richdocuments (Collabora), Whiteboard, Talk.

---

## Stripe-Zahlungen einrichten

```bash
task workspace:stripe-setup
```

Registriert Stripe als Zahlungsgateway. Stripe-Keys werden in `workspace-secrets` als Kubernetes Secret gespeichert. Webhook-Endpunkt: `/api/stripe/webhook`.

---

## Monitoring & Observability

### Live-Übersicht im Admin-Panel

Das Admin-Panel unter `web.{DOMAIN}/admin/monitoring` zeigt Pod-Status, CPU- und RAM-Auslastung sowie Kubernetes-Events.

### Kommandozeile

```bash
task workspace:status              # Pods, Services, Ingress, PVCs
task workspace:logs -- keycloak    # Logs eines Services anzeigen
task workspace:logs -- nextcloud
task workspace:logs -- website
```

### Service neustarten

```bash
task workspace:restart -- nextcloud
task workspace:restart -- keycloak
task workspace:restart -- vaultwarden
```

---

## Backups

Backups werden automatisch per Kubernetes CronJob erstellt.

```bash
# Status prüfen
kubectl get cronjobs -n workspace
kubectl get jobs -n workspace | grep backup

# Manuelles Backup auslösen
kubectl create job \
  --from=cronjob/backup-job \
  manual-backup-$(date +%Y%m%d) \
  -n workspace
```

Backup-Inhalt: PostgreSQL-Dumps (alle Datenbanken), Nextcloud-Dateien, Vaultwarden-Vault.

---

## Routineaufgaben — Schnellreferenz

| Aufgabe | Befehl |
|---------|--------|
| Cluster starten | `task cluster:start` |
| Alle Services deployen | `task workspace:deploy` |
| Website neu bauen und deployen | `task website:redeploy` |
| Post-Deploy-Setup | `task workspace:post-setup` |
| Datenbankshell öffnen | `task workspace:psql -- website` |
| Vaultwarden-Seed ausführen | `task workspace:vaultwarden:seed` |
| DSGVO-Compliance prüfen | `task workspace:dsgvo-check` |
| Alle Tests ausführen | `./tests/runner.sh local` |
| Erreichbarkeit aller Services prüfen | `scripts/check-connectivity.sh --local` |
| Container-Update-Status prüfen | `scripts/check-updates.sh` |

---

## Produktions-Deployment (Hetzner / k3s)

Im Produktionsbetrieb synchronisiert ArgoCD den Stack automatisch nach einem Git-Push auf `main`.

```bash
# Manueller Sync
task argocd:sync -- workspace-hetzner

# Status aller Apps
task argocd:status

# Diff zwischen Git und Live-Zustand
task argocd:diff -- workspace-hetzner
```

Umgebung wechseln: `KUBECONFIG` auf den Prod-Cluster setzen.

---

## Häufige Admin-Fragen

### Ein Service startet nicht

```bash
task workspace:logs -- <service>
kubectl describe pod -n workspace -l app=<service>
kubectl get events -n workspace --sort-by='.lastTimestamp'
```

Häufige Ursachen: Datenbankverbindung fehlgeschlagen, fehlendes Secret, unzureichende Ressourcen.

### Keycloak-Login funktioniert nicht für einen Dienst

1. Prüfe ob der Dienst als OIDC-Client in Keycloak registriert ist: `auth.{DOMAIN}/admin` → Clients
2. Prüfe die Redirect-URIs des Clients
3. Dienst neustarten: `task workspace:restart -- <dienst>`

### Wie füge ich eine neue Domain hinzu?

1. `k3d/configmap-domains.yaml` anpassen
2. Ingress-Regel in `k3d/ingress.yaml` ergänzen
3. `task workspace:validate` ausführen
4. PR erstellen und nach Merge deployen

---

## Weiterführende Dokumentation

| Thema | Dokument |
|-------|----------|
| Systemarchitektur | [Architektur](architecture.md) |
| Alle Services (technisch) | [Services](services.md) |
| Keycloak & SSO | [Keycloak](keycloak.md) |
| Datenbankmodelle | [Datenbank](database.md) |
| Sicherheit & DSGVO | [Sicherheit](security.md) |
| Projektmanagement (API) | [Projektmanagement-Admin](admin-projekte.md) |
| Skripte & Automatisierung | [Skripte](scripts.md) |
| Fehlerbehebung | [Fehlerbehebung](troubleshooting.md) |
| Testframework | [Tests](tests.md) |
| Claude Code MCP-Actions | [MCP Actions](mcp-actions.md) |
