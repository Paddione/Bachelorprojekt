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

| Dienst | Funktion | Dev-URL | Admin-Zugang |
|--------|----------|---------|--------------|
| **Keycloak** | Benutzerverwaltung & SSO | [auth.localhost](http://auth.localhost) | [auth.localhost/admin](http://auth.localhost/admin) |
| **Nextcloud** | Dateien, Kalender, Talk | [files.localhost](http://files.localhost) | [files.localhost/settings/admin](http://files.localhost/settings/admin) |
| **Collabora** | Office-Editor (in NC eingebettet) | [office.localhost](http://office.localhost) | Konfiguration via Nextcloud |
| **Whiteboard** | Digitales Whiteboard | [board.localhost](http://board.localhost) | — |
| **Vaultwarden** | Passwort-Safe | [vault.localhost](http://vault.localhost) | [vault.localhost/admin](http://vault.localhost/admin) |
| **Website / Portal** | Unternehmenswebsite + Messaging | [web.localhost](http://web.localhost) | [web.localhost/admin](http://web.localhost/admin) |
| **Dokumentation** | Dieses Handbuch | [docs.localhost](http://docs.localhost) | SSO-geschützt (Keycloak) |
| **Mailpit** | Ausgehende E-Mails (Dev) | [mail.localhost](http://mail.localhost) | Direktzugang (keine Auth) |
| **Claude Code KI** | KI-Status & MCP-Dashboard | [ai.localhost](http://ai.localhost) | MCP-Status-Dashboard |

> **Produktion:** Ersetze `localhost` durch Deine konfigurierte Domain (z. B. `auth.meinunternehmen.de`). Die Domain wird in `.env` als `PROD_DOMAIN` gesetzt.

---

## Benutzer verwalten (Keycloak)

Alle Benutzerkonten werden zentral in Keycloak gepflegt. Jede Änderung gilt sofort für alle Dienste (SSO).

### Neuen Benutzer anlegen

1. Öffne [auth.localhost/admin](http://auth.localhost/admin) → Realm **workspace**
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

Das Admin-Panel ist erreichbar unter [web.localhost/admin](http://web.localhost/admin) (Keycloak-Login mit `workspace-admins`-Gruppe erforderlich).

### Verfügbare Admin-Bereiche

| Bereich | Pfad | Funktion |
|---------|------|----------|
| **Startseite** | `/admin/startseite` | Startseiten-Texte und Hero-Bereich bearbeiten |
| **Leistungen** | `/admin/angebote` | Dienstleistungen und Preise verwalten |
| **Über mich** | `/admin/uebermich` | Profilseite bearbeiten |
| **Referenzen** | `/admin/referenzen` | Kundenstimmen und Referenzen |
| **FAQ** | `/admin/faq` | Häufig gestellte Fragen pflegen |
| **Rechtliches** | `/admin/rechtliches` | Impressum, Datenschutz, AGB |
| **Inbox** | `/admin/inbox` | Eingehende Kontaktanfragen |
| **Nachrichten** | `/admin/nachrichten` | Direkte Nachrichten und Chat-Räume |
| **Räume** | `/admin/raeume` | Chat-Räume verwalten |
| **Kunden** | `/admin/clients` | Kundenverwaltung |
| **Projekte** | `/admin/projekte` | Projektmanagement mit Gantt-Diagramm |
| **Termine** | `/admin/termine` | Terminbuchungen und Kalender |
| **Zeiterfassung** | `/admin/zeiterfassung` | Arbeitszeiterfassung |
| **Rechnungen** | `/admin/rechnungen` | Rechnungen und Stripe-Zahlungen |
| **Follow-ups** | `/admin/followups` | Wiedervorlagen und Erinnerungen |
| **Meetings** | `/admin/meetings` | Aufgezeichnete Meetings und Transkripte |
| **Kalender** | `/admin/kalender` | Kalenderübersicht |
| **Monitoring** | `/admin/monitoring` | Live-Übersicht: Pod-Status und Ressourcen |
| **Bugs** | `/admin/bugs` | Bug-Reports und Ticket-Tracking |

### Kunden-Detail-Ansicht

Unter `/admin/clients/{id}` ist eine umfassende Kundenübersicht verfügbar:
- Kontaktdaten und Kommunikationshistorie
- Zugehörige Projekte und Aufgaben
- Offene und bezahlte Rechnungen
- Direktnachrichten (DMs)
- Gebuchte Leistungen

---

## Stripe-Zahlungen

Stripe ist die Zahlungsplattform für Leistungen und Rechnungen. Zahlungen werden auf der Leistungen-Seite oder über den CTA der Homepage abgewickelt.

**Einrichtung (einmalig):**
```bash
task workspace:stripe-setup
```

**Konfiguration:**
- Stripe-Keys in `workspace-secrets` als Kubernetes Secret gespeichert
- Webhook-Endpoint: `/api/stripe/webhook` (Ereignis: `checkout.session.completed`)
- Zahlungsstatus in der Admin-Oberfläche unter `/admin/rechnungen`

Weitere Details: [Stripe-Integration](stripe.md)

---

## Monitoring & Systemstatus

### Live-Monitoring im Admin-Panel

Das Admin-Panel unter [web.localhost/admin/monitoring](http://web.localhost/admin/monitoring) zeigt:
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

1. Prüfe ob der Dienst als OIDC-Client in Keycloak registriert ist: [auth.localhost/admin](http://auth.localhost/admin) → Clients
2. Prüfe die Redirect-URIs des Clients
3. Dienst neustarten: `task workspace:restart -- <dienst>`

### Wie füge ich eine neue Domain hinzu?

1. `k3d/configmap-domains.yaml` und `prod/configmap-domains.yaml` anpassen
2. Ingress-Regel in `k3d/ingress.yaml` ergänzen
3. `task workspace:validate` ausführen
4. PR erstellen und nach Merge deployen: `task workspace:deploy`

### Wie aktualisiere ich die Dokumentation?

Die Docs-Seite lädt Markdown-Dateien aus `docs/`. Nach einer Änderung:
```bash
# Nach PR-Merge auf main:
kubectl patch configmap docs-content -n workspace --patch-file /dev/stdin <<EOF
... (Inhalt aus CI/Deploy-Skript)
EOF
kubectl rollout restart deployment/docs -n workspace
```

Weitere Details: Siehe [Docs-Deployment Referenz](../memory/reference_docs_deployment.md).

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
