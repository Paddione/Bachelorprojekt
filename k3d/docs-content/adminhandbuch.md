# Adminhandbuch — Workspace

Dieses Handbuch richtet sich an Plattform-Administratoren, die den Workspace betreiben. Für Endnutzer-Themen siehe das [Benutzerhandbuch](benutzerhandbuch.md). Für die vollständige Referenz aller Admin-UI-Bereiche siehe das [Admin-Webinterface](admin-webinterface.md).

## Voraussetzungen

| Werkzeug | Zweck |
|----------|-------|
| `kubectl` | Kubernetes CLI mit Kontext für den Ziel-Cluster (`mentolder` oder `korczewski`) |
| `task` (go-task) | Aufgaben-Orchestrierer (`Taskfile.yml`) |
| `argocd` CLI | GitOps-Sync und Diff (Hub: `mentolder`) |
| `kubeseal` | Erzeugen von SealedSecrets für Produktion |
| `git` | Quellcode-Verwaltung; alle Änderungen laufen über Pull Requests |

Für lokale Entwicklung zusätzlich Docker und [k3d](https://k3d.io); siehe [Beitragen & CI/CD](contributing.md).

---

## Umgebungen

Der Workspace läuft in zwei Produktionsumgebungen, jede auf einem eigenen Hetzner-k3s-Cluster mit eigener Domain. Auswahl erfolgt über die Umgebungsvariable `ENV=` an task-Aufrufen.

| Umgebung | Cluster | Domain | Secrets |
|----------|---------|--------|---------|
| `mentolder` | k3s (Hetzner) | `mentolder.de` | Bitnami Sealed Secrets |
| `korczewski` | k3s (Hetzner) | `korczewski.de` | Bitnami Sealed Secrets |
| `dev` | k3d (lokal) | `localhost` | Klartext (nur Entwicklung) |

> **Wichtig:** Env-sensitive Tasks (`workspace:deploy`, `workspace:post-setup`, `website:deploy`, `docs:deploy`, `workspace:talk-setup`) setzen `ENV=dev` als Default. Der Kontext-Check greift nur bei `ENV != dev`. Setze bei Produktionsarbeit daher **immer explizit** `ENV=mentolder` oder `ENV=korczewski` — sonst landet ein Deploy auf dem aktuell aktiven `kubectl`-Kontext.

Details: [Umgebungen](environments.md).

---

## Erstmalige Einrichtung

### Produktion (mentolder / korczewski)

Die Produktionsumgebungen werden via ArgoCD aus `main` synchronisiert (siehe **Deployment in Produktion**). Bei einem Push auf `main` syncen die Cluster automatisch. Manuelles initiales Setup eines neuen Cluster-Tenants ist in [Umgebungen → Neue Umgebung einrichten](environments.md#neue-umgebung-einrichten) beschrieben.

### Lokale Entwicklung (k3d)

```bash
git clone https://github.com/Paddione/Bachelorprojekt.git
cd Bachelorprojekt
task workspace:up                # Cluster + MVP + Office-Stack + MCP + Billing
```

Schrittweise:

```bash
task cluster:create              # k3d-Cluster mit lokaler Registry erstellen
task workspace:deploy            # Alle Workspace-Services deployen
task workspace:post-setup        # Nextcloud-Apps aktivieren und konfigurieren
task workspace:vaultwarden:seed  # Vaultwarden mit Secret-Templates befüllen
task mcp:deploy                  # MCP-Server für Claude Code deployen
task website:deploy              # Astro-Website bauen und deployen
```

---

## Dienste-Übersicht mit Admin-Zugängen

In Produktion ist `{DOMAIN}` entweder `mentolder.de` oder `korczewski.de`. Lokal stehen dieselben Endpunkte unter `*.localhost` zur Verfügung.

| Dienst | URL | Admin-Zugang |
|--------|-----|--------------|
| Portal & Website | `https://web.{DOMAIN}` | `https://web.{DOMAIN}/admin` (Gruppe `workspace-admins` erforderlich) |
| Keycloak (SSO) | `https://auth.{DOMAIN}` | `https://auth.{DOMAIN}/admin` (Realm `workspace`) |
| Nextcloud | `https://files.{DOMAIN}` | `https://files.{DOMAIN}/settings/admin` |
| Collabora | `https://office.{DOMAIN}` | Konfiguration über Nextcloud (WOPI) |
| Whiteboard | `https://board.{DOMAIN}` | — |
| Vaultwarden | `https://vault.{DOMAIN}` | `https://vault.{DOMAIN}/admin` (Token-Login) |
| Dokumentation | `https://docs.{DOMAIN}` | SSO-geschützt (Keycloak) |
| Mailpit | `http://mail.localhost` | nur in Entwicklung verfügbar |

MCP-Serverstatus (Claude-Code-Backend) läuft intern und ist nicht als Web-UI für Endnutzer vorgesehen — Details: [MCP-Server](claude-code.md).

---

## Benutzerverwaltung

### Keycloak Admin-UI

Alle Benutzerkonten werden zentral in Keycloak gepflegt. Jede Änderung gilt sofort für alle Dienste (Single Sign-On).

Aufruf: `https://auth.mentolder.de/admin` bzw. `https://auth.korczewski.de/admin` → Realm **workspace**

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
  --url https://auth.mentolder.de \
  --admin admin \
  --pass <ADMIN_PASSWORT>

# Trockenlauf (keine Änderungen)
scripts/import-users.sh --csv users.csv --dry-run
```

CSV-Format: `username,email,firstname,lastname`

Fehlende Gruppen werden automatisch erstellt. Importierte Benutzer erhalten temporäre Passwörter.

### Admin-User einrichten

```bash
scripts/admin-users-setup.sh
```

Provisioniert die in der Umgebung definierten Admin-Benutzer (`KC_USER1`, `KC_USER2`) im workspace-Realm. Idempotent — bei bereits vorhandenen Benutzern wird nur aktualisiert.

---

## Website-Admin-Panel

Das Admin-Panel ist erreichbar unter `https://web.mentolder.de/admin` bzw. `https://web.korczewski.de/admin` (Workspace-Login mit Gruppe `workspace-admins` erforderlich). Eine vollständige Referenz aller Bereiche — Kunden, Projekte, Termine, Rechnungen, Meetings, Inhaltsverwaltung — findet sich im separaten [Admin-Webinterface-Handbuch](admin-webinterface.md).

Kurzreferenz der wichtigsten Bereiche:

| Bereich | Pfad | Funktion |
|---------|------|----------|
| Inbox | `/admin/inbox` | Eingehende Kontaktanfragen |
| Nachrichten | `/admin/nachrichten` | Chat-Räume und Direktnachrichten |
| Kunden | `/admin/clients` | Kundenverwaltung |
| Projekte | `/admin/projekte` | Projektmanagement mit Gantt-Diagramm |
| Termine | `/admin/termine` | Buchungen und Slot-Whitelist |
| Rechnungen | `/admin/rechnungen` | Stripe-Zahlungen und ZUGFeRD-PDF |
| Meetings | `/admin/meetings` | Aufgezeichnete Meetings und Transkripte |
| Monitoring | `/admin/monitoring` | Live-Übersicht: Pod-Status und Ressourcen |
| Bugs | `/admin/bugs` | Bug-Reports und Ticket-Tracking |

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

# Status anzeigen
php occ status
```

### Apps nach Deploy aktivieren

```bash
task workspace:post-setup
```

Aktiviert: calendar, contacts, user_oidc, richdocuments (Collabora), whiteboard, notify_push, talk. Details: [Nextcloud](nextcloud.md).

---

## Stripe-Zahlungen einrichten

```bash
task workspace:stripe-setup
```

Registriert Stripe als Zahlungs-Gateway in der Website-Brand-Konfiguration. Stripe-Keys werden als Secret ausgerollt (in Dev direkt, in Produktion als SealedSecret in `environments/sealed-secrets/<env>.yaml`). Webhook-Endpunkt: `/api/stripe/webhook`. Details: [Stripe](stripe.md).

### E-Rechnung (XRechnung / ZUGFeRD)

Drei Profile stehen zur Auswahl beim Versand und Download:

| Profil | Verwendung | URL |
|---|---|---|
| `factur-x-minimum` | B2C / interne Archivierung | `/api/billing/invoice/<id>/pdf?profile=factur-x-minimum` |
| `xrechnung-cii` | B2G (Bund/Länder), CII-Syntax | `/api/billing/invoice/<id>/pdf?profile=xrechnung-cii` |
| `xrechnung-ubl` | B2G, UBL-2.1-Syntax (z. B. ZRE/OZG-RE) | `/api/billing/invoice/<id>/pdf?profile=xrechnung-ubl` |

Für `xrechnung-*` muss die **Leitweg-ID** des Empfängers im Kundenstamm gesetzt sein
(Format `<grob>-[<fein>-]<prüfziffer>` nach KoSIT 2.0.2). Sonst antwortet die API mit HTTP 422.

**Leitweg-ID setzen:** `PATCH /api/admin/billing/customers/<customer-id>/leitweg` mit
`{ "leitwegId": "991-01234-44" }` oder `{ "leitwegId": null }` zum Entfernen. Validierung
erfolgt serverseitig.

**XML statt PDF:** `/api/billing/invoice/<id>/zugferd?profile=<profile>` liefert nur das XML.

**Validierung lokaler Dateien:**

```bash
task billing:validate-einvoice -- ./rechnung.pdf
task billing:validate-einvoice -- ./factur-x.xml
```

Erwartet: `Mustang … is a valid E-Invoice (Factur-X / XRechnung).`

---

## Monitoring & Observability

### Live-Übersicht im Admin-Panel

Das Admin-Panel unter `https://web.{DOMAIN}/admin/monitoring` zeigt Pod-Status, CPU- und RAM-Auslastung sowie Kubernetes-Events. Die Daten werden über die MCP-Kubernetes-Integration abgerufen. Im lokalen k3d-Cluster ist diese Ansicht nur eingeschränkt nutzbar.

### Kommandozeile

```bash
task workspace:status              # Pods, Services, Ingress, PVCs
task workspace:logs -- keycloak    # Logs eines Services anzeigen
task workspace:logs -- nextcloud
task workspace:logs -- website
```

### Service neu starten

```bash
task workspace:restart -- nextcloud
task workspace:restart -- keycloak
task workspace:restart -- vaultwarden
```

---

## Secrets-Management (Produktion)

In den Produktionsumgebungen werden **keine Klartext-Secrets** eingecheckt. Es kommt der Bitnami Sealed Secrets Controller zum Einsatz: Klartext-Secrets werden mit dem öffentlichen Schlüssel des Controllers verschlüsselt und als `SealedSecret`-Ressource in Git abgelegt.

**Workflow für ein neues oder rotiertes Secret:**

```bash
# 1. Klartext-Secrets generieren oder editieren (schreibt environments/.secrets/<env>.yaml)
task env:generate ENV=mentolder

# 2. Als SealedSecret verschlüsseln (schreibt environments/sealed-secrets/<env>.yaml)
task env:seal ENV=mentolder

# 3. Verschlüsselte Datei committen (sicher für Git)
git add environments/sealed-secrets/mentolder.yaml

# 4. Konfiguration validieren
task env:validate ENV=mentolder
```

**Wichtig:** Ein SealedSecret ist cluster- und namespace-spezifisch — eine für `mentolder` verschlüsselte Datei funktioniert nicht auf `korczewski` und umgekehrt. Der private Schlüssel verlässt den jeweiligen Cluster nie.

**Nicht den `$patch: delete`-Block in `prod/kustomization.yaml` entfernen** — er strippt die Dev-Platzhalter aus `k3d/secrets.yaml`, sodass die SealedSecrets-gemanagten Produktions-Secrets bei jedem Deploy erhalten bleiben.

Details: [Umgebungen](environments.md).

---

## Deployment in Produktion

### ArgoCD (GitOps)

Die Produktion läuft vollständig über ArgoCD. Ein Push auf `main` triggert den Sync auf die Ziel-Cluster. Der ArgoCD-Hub läuft auf dem `mentolder`-Cluster und verwaltet beide Produktions-Cluster via Cluster-Secrets.

```bash
# Sync-Status aller Apps anzeigen
task argocd:status

# Manueller Sync
task argocd:sync -- workspace-mentolder
task argocd:sync -- workspace-korczewski

# Diff zwischen Git und Live-Zustand
task argocd:diff -- workspace-mentolder
```

> ArgoCD-Tasks sind auf den Hub-Cluster (`mentolder`) festgelegt (`--context mentolder`). `argocd:*`-Aufrufe greifen nicht direkt auf `korczewski` zu.

### Overlays

- `prod/` ist Basis für die Umgebungen und enthält den `$patch: delete`-Block — **nicht allein anwenden**
- `prod-mentolder/` und `prod-korczewski/` sind die tatsächlich applizierbaren Overlays
- `k3d/office-stack` (Collabora) und `k3d/coturn-stack` sind eigenständige ArgoCD-Apps (`argocd/applicationset-office.yaml`) — sie liegen nicht in der Basis-Kustomization

### Docs-ConfigMap aktualisieren

ArgoCD synct die Docs-ConfigMap **nicht automatisch**. Nach Änderungen an `docs-site/` oder `k3d/docs-content/` den Rollout manuell auslösen:

```bash
kubectl rollout restart deploy/docs -n workspace --context <env>
```

Details: [ArgoCD](argocd.md).

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

Backup-Inhalt: PostgreSQL-Dumps (alle Datenbanken), Nextcloud-Daten, Vaultwarden-Vault. Details: [Backup & Wiederherstellung](backup.md).

---

## Routineaufgaben — Schnellreferenz

| Aufgabe | Befehl |
|---------|--------|
| Cluster starten / stoppen | `task cluster:start` / `task cluster:stop` |
| Alle Services deployen | `task workspace:deploy ENV=<env>` |
| Website neu bauen und deployen | `task website:redeploy ENV=<env>` |
| Post-Deploy-Setup | `task workspace:post-setup ENV=<env>` |
| Datenbankshell öffnen | `task workspace:psql -- website` |
| Vaultwarden-Seed ausführen | `task workspace:vaultwarden:seed` |
| DSGVO-Compliance prüfen | `task workspace:dsgvo-check` |
| Erreichbarkeit aller Services prüfen | `task workspace:check-connectivity` |
| Container-Update-Status prüfen | `task workspace:check-updates` |
| Alle Tests ausführen | `./tests/runner.sh local` |

Vollständige Task-Referenz: [Deployment & Taskfile](operations.md).

---

## Häufige Admin-Fragen

### Ein Service startet nicht

```bash
task workspace:logs -- <service>
kubectl describe pod -n workspace -l app=<service>
kubectl get events -n workspace --sort-by='.lastTimestamp'
```

Häufige Ursachen: Datenbankverbindung fehlgeschlagen, fehlendes Secret, unaufgelöste `${VAR}`-Platzhalter in Manifest oder Realm-JSON (Keycloak), unzureichende Ressourcen.

### Keycloak-Login funktioniert nicht für einen Dienst

1. Prüfe, ob der Dienst als OIDC-Client in Keycloak registriert ist: `https://auth.{DOMAIN}/admin` → Clients
2. Prüfe die Redirect-URIs des Clients (exakt, inkl. Protokoll und Pfad)
3. Dienst neu starten: `task workspace:restart -- <dienst>`

Details: [Keycloak & SSO](keycloak.md).

### Wie füge ich eine neue Domain hinzu?

1. `k3d/configmap-domains.yaml` oder die umgebungsspezifischen Overlay-Patches anpassen
2. Ingress-Regel in `k3d/ingress.yaml` ergänzen
3. `task workspace:validate` ausführen
4. Falls ein Envvar neu eingeführt wird: in `environments/schema.yaml` deklarieren und in den `envsubst`-Listen der betroffenen Tasks ergänzen
5. PR erstellen und nach Merge deployen (in Produktion via ArgoCD-Sync)

### Wie richte ich eine neue Produktionsumgebung ein?

Schritt-für-Schritt in [Umgebungen → Neue Umgebung einrichten](environments.md#neue-umgebung-einrichten).

### Secrets rotieren

Siehe oben **Secrets-Management** — Klartext in `.secrets/<env>.yaml` aktualisieren, erneut `task env:seal ENV=<env>` ausführen, Commit + ArgoCD-Sync.

---

## Weiterführende Dokumentation

| Thema | Dokument |
|-------|----------|
| Systemarchitektur | [Architektur](architecture.md) |
| Umgebungen und Secrets | [Umgebungen](environments.md) |
| Alle Services (technisch) | [Services](services.md) |
| Keycloak & SSO | [Keycloak](keycloak.md) |
| Nextcloud | [Nextcloud](nextcloud.md) |
| Admin-Webinterface (vollständig) | [Admin-Webinterface](admin-webinterface.md) |
| Projektmanagement (API) | [Projekt-Verwaltung](admin-projekte.md) |
| MCP-Server (Claude Code) | [MCP-Server](claude-code.md) |
| Deployment & Taskfile | [Operations](operations.md) |
| ArgoCD (GitOps) | [ArgoCD](argocd.md) |
| Sicherheit & DSGVO | [Sicherheit](security.md) · [DSGVO](dsgvo.md) |
| Skripte & Automatisierung | [Skripte](scripts.md) |
| Fehlerbehebung | [Fehlerbehebung](troubleshooting.md) |
| Testframework | [Tests](tests.md) |
