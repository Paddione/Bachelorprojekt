<div class="page-hero">
  <span class="page-hero-icon">🛠️</span>
  <div class="page-hero-body">
    <div class="page-hero-title">Administrator-Handbuch</div>
    <p class="page-hero-desc">Einrichtung, Betrieb und Verwaltung des Workspace – für Administratoren ohne Kubernetes-Vorkenntnisse.</p>
    <div class="page-hero-meta">
      <span class="page-hero-tag">Für Administratoren</span>
      <span class="page-hero-tag">Betrieb</span>
    </div>
  </div>
  <a href="#/" class="page-hero-back">← Übersicht</a>
</div>

# Administrator-Handbuch – Workspace

Dieses Handbuch beschreibt die wichtigsten Administrationsaufgaben: Benutzer anlegen, Dienste überwachen, Backups verwalten und häufige Probleme beheben. Für tiefgehende technische Details zu Kubernetes-Manifesten und Architektur: [Architektur](architecture.md) und [Services](services.md).

---

## Dienstübersicht mit Admin-Links

| Dienst | Funktion | URL | Admin-Zugang |
|--------|----------|-----|--------------|
| **Keycloak** | Benutzerverwaltung & SSO | [{PROTO}://auth.{DOMAIN}]({PROTO}://auth.{DOMAIN}) | [{PROTO}://auth.{DOMAIN}/admin]({PROTO}://auth.{DOMAIN}/admin) |
| **Nextcloud** | Dateien, Kalender, Talk | [{PROTO}://files.{DOMAIN}]({PROTO}://files.{DOMAIN}) | [{PROTO}://files.{DOMAIN}/settings/admin]({PROTO}://files.{DOMAIN}/settings/admin) |
| **Collabora** | Office-Editor (in NC eingebettet) | [{PROTO}://office.{DOMAIN}]({PROTO}://office.{DOMAIN}) | Konfiguration via Nextcloud |
| **Whiteboard** | Digitales Whiteboard | [{PROTO}://board.{DOMAIN}]({PROTO}://board.{DOMAIN}) | — |
| **Vaultwarden** | Passwort-Safe | [{PROTO}://vault.{DOMAIN}]({PROTO}://vault.{DOMAIN}) | [{PROTO}://vault.{DOMAIN}/admin]({PROTO}://vault.{DOMAIN}/admin) |
| **Website / Portal** | Unternehmenswebsite + Messaging | [{PROTO}://web.{DOMAIN}]({PROTO}://web.{DOMAIN}) | [{PROTO}://web.{DOMAIN}/admin]({PROTO}://web.{DOMAIN}/admin) |
| **Dokumentation** | Dieses Handbuch | [{PROTO}://docs.{DOMAIN}]({PROTO}://docs.{DOMAIN}) | SSO-geschützt (Keycloak) |
| **Mailpit** | Ausgehende E-Mails (Dev) | [{PROTO}://mail.{DOMAIN}]({PROTO}://mail.{DOMAIN}) | Direktzugang (keine Auth) |
| **Claude Code KI** | KI-Status & MCP-Dashboard | [{PROTO}://ai.{DOMAIN}]({PROTO}://ai.{DOMAIN}) | MCP-Status-Dashboard |

---

## Benutzer verwalten (Keycloak)

Alle Benutzerkonten werden zentral in Keycloak gepflegt. Jede Änderung gilt sofort für alle Dienste (SSO).

### Neuen Benutzer anlegen

1. Öffne [{PROTO}://auth.{DOMAIN}/admin]({PROTO}://auth.{DOMAIN}/admin) → Realm **workspace**
2. Navigiere zu **Benutzer** → **Benutzer hinzufügen**
3. Felder ausfüllen:
   - **Benutzername**: Kleinbuchstaben, kein Leerzeichen
   - **E-Mail**: Pflichtfeld für Benachrichtigungen
   - **Vorname / Nachname**
4. Reiter **Zugangsdaten** → Temporäres Passwort vergeben (Benutzer muss es beim ersten Login ändern)
5. Reiter **Gruppen** → Benutzer der passenden Gruppe zuweisen:
   - `workspace-users` – normaler Mitarbeiter-Zugang
   - `workspace-admins` – Administratorzugang (Website-Admin-Panel, erweiterte Rechte)

### Passwort zurücksetzen

1. Keycloak Admin → **Benutzer** → Benutzer auswählen
2. Reiter **Zugangsdaten** → **Passwort zurücksetzen**
3. Temporäres Passwort eingeben → **Temporär: Ja** → Speichern

Der Benutzer wird beim nächsten Login aufgefordert, ein neues Passwort zu setzen.

### Benutzer deaktivieren

1. Keycloak Admin → **Benutzer** → Benutzer auswählen
2. Reiter **Details** → **Aktiviert**: Schalter ausschalten → Speichern

Der Benutzer kann sich sofort nicht mehr anmelden. Daten bleiben erhalten.

---

## Website-Admin-Panel

Das Admin-Panel ist erreichbar unter [{PROTO}://web.{DOMAIN}/admin]({PROTO}://web.{DOMAIN}/admin) (Keycloak-Login mit `workspace-admins`-Gruppe erforderlich).

### Verfügbare Admin-Bereiche

| Bereich | Pfad | Funktion |
|---------|------|----------|
| **Startseite** | [`/admin/startseite`]({PROTO}://web.{DOMAIN}/admin/startseite) | Startseiten-Texte und Hero-Bereich bearbeiten |
| **Leistungen** | [`/admin/angebote`]({PROTO}://web.{DOMAIN}/admin/angebote) | Dienstleistungen und Preise verwalten |
| **Über mich** | [`/admin/uebermich`]({PROTO}://web.{DOMAIN}/admin/uebermich) | Profilseite bearbeiten |
| **Referenzen** | [`/admin/referenzen`]({PROTO}://web.{DOMAIN}/admin/referenzen) | Kundenstimmen und Referenzen |
| **FAQ** | [`/admin/faq`]({PROTO}://web.{DOMAIN}/admin/faq) | Häufig gestellte Fragen pflegen |
| **Rechtliches** | [`/admin/rechtliches`]({PROTO}://web.{DOMAIN}/admin/rechtliches) | Impressum, Datenschutz, AGB |
| **Inbox** | [`/admin/inbox`]({PROTO}://web.{DOMAIN}/admin/inbox) | Eingehende Kontaktanfragen |
| **Nachrichten** | [`/admin/nachrichten`]({PROTO}://web.{DOMAIN}/admin/nachrichten) | Direkte Nachrichten und Chat-Räume |
| **Räume** | [`/admin/raeume`]({PROTO}://web.{DOMAIN}/admin/raeume) | Chat-Räume verwalten |
| **Kunden** | [`/admin/clients`]({PROTO}://web.{DOMAIN}/admin/clients) | Kundenverwaltung |
| **Projekte** | [`/admin/projekte`]({PROTO}://web.{DOMAIN}/admin/projekte) | Projektmanagement mit Gantt-Diagramm |
| **Termine** | [`/admin/termine`]({PROTO}://web.{DOMAIN}/admin/termine) | Terminbuchungen und Kalender |
| **Zeiterfassung** | [`/admin/zeiterfassung`]({PROTO}://web.{DOMAIN}/admin/zeiterfassung) | Arbeitszeiterfassung |
| **Rechnungen** | [`/admin/rechnungen`]({PROTO}://web.{DOMAIN}/admin/rechnungen) | Rechnungen und Stripe-Zahlungen |
| **Follow-ups** | [`/admin/followups`]({PROTO}://web.{DOMAIN}/admin/followups) | Wiedervorlagen und Erinnerungen |
| **Meetings** | [`/admin/meetings`]({PROTO}://web.{DOMAIN}/admin/meetings) | Aufgezeichnete Meetings und Transkripte |
| **Kalender** | [`/admin/kalender`]({PROTO}://web.{DOMAIN}/admin/kalender) | Kalenderübersicht |
| **Monitoring** | [`/admin/monitoring`]({PROTO}://web.{DOMAIN}/admin/monitoring) | Live-Übersicht: Pod-Status und Ressourcen |
| **Bugs** | [`/admin/bugs`]({PROTO}://web.{DOMAIN}/admin/bugs) | Bug-Reports und Ticket-Tracking |

### Kunden-Detail-Ansicht

Unter [`/admin/clients/{id}`]({PROTO}://web.{DOMAIN}/admin/clients) ist eine umfassende Kundenübersicht verfügbar:
- Kontaktdaten und Kommunikationshistorie
- Zugehörige Projekte und Aufgaben
- Offene und bezahlte Rechnungen
- Direktnachrichten (DMs)
- Gebuchte Leistungen

---

## Stripe-Zahlungen

Stripe ist die Zahlungsplattform für Leistungen und Rechnungen. Zahlungen werden auf der [Leistungen-Seite]({PROTO}://web.{DOMAIN}/leistungen) oder über den CTA der Homepage abgewickelt.

**Einrichtung (einmalig):**
```bash
task workspace:stripe-setup
```

**Konfiguration:**
- Stripe-Keys in `workspace-secrets` als Kubernetes Secret gespeichert
- Webhook-Endpoint: `/api/stripe/webhook` (Ereignis: `checkout.session.completed`)
- Zahlungsstatus in der Admin-Oberfläche unter [`/admin/rechnungen`]({PROTO}://web.{DOMAIN}/admin/rechnungen)

Weitere Details: [Stripe-Integration](stripe.md)

---

## Monitoring & Systemstatus

### Live-Monitoring im Admin-Panel

Das Admin-Panel unter [{PROTO}://web.{DOMAIN}/admin/monitoring]({PROTO}://web.{DOMAIN}/admin/monitoring) zeigt:
- Status aller Kubernetes-Pods (laufend / fehler / neustart)
- CPU- und RAM-Auslastung je Pod
- Aktuelle Kubernetes-Events (Warnungen, Restarts)

### Status über die Kommandozeile prüfen

```bash
task workspace:status          # Pods, Services, Ingress, PVCs
task workspace:logs -- keycloak   # Logs eines Services anzeigen
task workspace:logs -- nextcloud
task workspace:logs -- website
```

### Service neustarten

```bash
task workspace:restart -- nextcloud    # Nextcloud neustarten
task workspace:restart -- keycloak     # Keycloak neustarten
task workspace:restart -- vaultwarden  # Vaultwarden neustarten
```

---

## Backups

Backups werden automatisch per Kubernetes CronJob erstellt (`k3d/backup-cronjob.yaml`).

**Backup-Inhalt:**
- PostgreSQL-Datenbank-Dumps (alle Datenbanken)
- Nextcloud-Daten (Dateien)
- Vaultwarden-Vault

**Status prüfen:**
```bash
kubectl get cronjobs -n workspace
kubectl get jobs -n workspace | grep backup
```

**Manuelles Backup auslösen:**
```bash
kubectl create job --from=cronjob/backup-job manual-backup-$(date +%Y%m%d) -n workspace
```

---

## Häufige Aufgaben – Schnellreferenz

| Aufgabe | Befehl / Ort |
|---------|--------------|
| Cluster starten | `task cluster:start` |
| Alle Services deployen | `task workspace:deploy` |
| Website neu bauen & deployen | `task website:redeploy` |
| Post-Deploy-Setup (Nextcloud-Apps) | `task workspace:post-setup` |
| Datenbankshell öffnen | `task workspace:psql -- website` |
| Vaultwarden-Seed ausführen | `task workspace:vaultwarden:seed` |
| DSGVO-Compliance prüfen | `task workspace:dsgvo-check` |
| Alle Tests ausführen | `./tests/runner.sh local` |

---

## Häufig gestellte Fragen (Admin)

### Ein Service startet nicht – wie debugge ich?

```bash
task workspace:logs -- <servicename>    # Logs anzeigen
kubectl describe pod -n workspace -l app=<servicename>   # Events prüfen
```

Häufige Ursachen: Datenbankverbindung fehlgeschlagen, Secret nicht vorhanden, unzureichende Ressourcen.

### Nextcloud friert ein oder reagiert langsam

Nextcloud manchmal im Maintenance-Modus oder OPcache überlastet:
```bash
task workspace:restart -- nextcloud
```

Falls das nicht hilft: `task workspace:logs -- nextcloud` auf Datenbankfehler prüfen.

### Keycloak-Login funktioniert nicht für einen Dienst

1. Prüfe ob der Dienst als OIDC-Client in Keycloak registriert ist: [{PROTO}://auth.{DOMAIN}/admin]({PROTO}://auth.{DOMAIN}/admin) → Clients
2. Prüfe die Redirect-URIs des Clients
3. Dienst neustarten: `task workspace:restart -- <dienst>`

### Wie füge ich eine neue Domain hinzu?

1. `k3d/configmap-domains.yaml` und `prod/configmap-domains.yaml` anpassen
2. Ingress-Regel in `k3d/ingress.yaml` ergänzen
3. `task workspace:validate` ausführen
4. PR erstellen und nach Merge deployen: `task workspace:deploy`

---

## Weiterführende Dokumentation

| Thema | Dokument |
|-------|----------|
| Systemarchitektur | [Architektur](architecture.md) |
| Alle Services (technisch) | [Services](services.md) |
| Keycloak & SSO konfigurieren | [Keycloak & SSO](keycloak.md) |
| Datenbankmodelle | [Datenbankmodelle](database.md) |
| Sicherheit & DSGVO | [Sicherheit](security.md) |
| Datenschutz-Verarbeitungsverzeichnis | [Verarbeitungsverzeichnis (Art. 30)](verarbeitungsverzeichnis.md) |
| Projektmanagement (API) | [Projektmanagement-Admin](admin-projekte.md) |
| Stripe-Integration | [Stripe](stripe.md) |
| Skripte & Automatisierung | [Skripte](scripts.md) |
| Fehlerbehebung | [Fehlerbehebung](troubleshooting.md) |
| Testframework | [Tests](tests.md) |
| Claude Code MCP-Actions | [MCP Actions](mcp-actions.md) |
