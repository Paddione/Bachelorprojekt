# Adminhandbuch — Workspace

Dieses Handbuch richtet sich an Plattform-Administratoren, die den Workspace betreiben. Für Endnutzer-Themen siehe das [Benutzerhandbuch](benutzerhandbuch.md). Für die vollständige Referenz aller Admin-UI-Bereiche siehe das [Admin-Webinterface](admin-webinterface.md).

## Voraussetzungen

| Werkzeug | Zweck |
|----------|-------|
| `kubectl` | Kubernetes CLI mit Kontext für den Ziel-Cluster (`mentolder` oder `korczewski`) |
| `task` (go-task) | Aufgaben-Orchestrierer (`Taskfile.yml`) |
| `kubeseal` | Erzeugen von SealedSecrets für Produktion |
| `git` + `gh` | Quellcode; alle Änderungen über Pull Requests |

Für lokale Entwicklung zusätzlich Docker und [k3d](https://k3d.io); siehe [Beitragen & CI/CD](contributing.md).

---

## Umgebungen

Der Workspace läuft auf **zwei getrennten physischen k3s-Clustern** (seit PR #621/#622, 2026-05-09). Jeder Cluster hat seine eigene Domain, eigene Datenbank und eigene SealedSecrets-Schlüssel. Die Auswahl erfolgt über `ENV=` an task-Aufrufen.

| Umgebung | Cluster | Domain | Namespace | Secrets |
|----------|---------|--------|-----------|---------|
| `mentolder` | k3s (9 Nodes, Hetzner + Home-LAN via WireGuard) | `mentolder.de` | `workspace` | Bitnami Sealed Secrets |
| `korczewski` | k3s (3 Nodes, Hetzner) | `korczewski.de` | `workspace-korczewski` | Bitnami Sealed Secrets |
| `dev` | k3d (lokal, auf `gekko-hetzner-2`) | `dev.mentolder.de` | `workspace-dev` | Klartext (nur Entwicklung) |

> **Wichtig:** Env-sensitive Tasks setzen `ENV=dev` als Standard-Default. Bei Produktionsarbeit **immer explizit** `ENV=mentolder` oder `ENV=korczewski` setzen — sonst landet der Deploy auf dem aktiven kubectl-Kontext.

> **Keine Cross-Cluster-Propagation:** DB-Passwort-Rotationen, Schema-Änderungen und OIDC-Client-Konfigurationen müssen **explizit auf beiden Clustern** ausgeführt werden. Jeder Cluster hat seinen eigenen `shared-db`.

Details: [Umgebungen](environments.md).

---

## Erstmalige Einrichtung

### Produktion (mentolder / korczewski)

Produktionsumgebungen werden manuell ausgerollt. Workloads werden nur aktualisiert, wenn du es explizit auslöst (`task feature:*`). Die Reihenfolge beim Erstaufbau ist zwingend:

```bash
task sealed-secrets:install ENV=<env>      # 1. Controller vor allem anderen
task env:fetch-cert ENV=<env>              # 2. Sealing-Zertifikat holen
task env:seal ENV=<env>                    # 3. Secrets verschlüsseln
task cert:install ENV=<env>               # 4. cert-manager + DNS-01 Webhook
task cert:secret -- <ipv64-key> ENV=<env>  # 5. ACME-Schlüssel speichern
task workspace:deploy ENV=<env>            # 6. Alles ausrollen
task workspace:office:deploy ENV=<env>     # 7. Collabora (separates Overlay)
task workspace:post-setup ENV=<env>        # 8. Nextcloud-Apps aktivieren
task workspace:talk-setup ENV=<env>        # 9. Talk-HPB + CoTURN konfigurieren
task workspace:admin-users-setup ENV=<env> # 10. Admin-Benutzer anlegen
```

Ausführliche Anleitung: [Umgebungen → Neue Umgebung](environments.md#neue-umgebung-einrichten).

### Lokale Entwicklung (k3d)

```bash
git clone https://github.com/Paddione/Bachelorprojekt.git
cd Bachelorprojekt
task workspace:up   # Vollautomatisch: Cluster + MVP + Office + MCP + Post-Config
```

Schrittweise:

```bash
task cluster:create              # k3d-Cluster erstellen
task workspace:deploy            # Alle Services deployen
task workspace:post-setup        # Nextcloud-Apps aktivieren
task workspace:vaultwarden:seed  # Vaultwarden befüllen
task mcp:deploy                  # MCP-Server für Claude Code deployen
task website:deploy              # Astro-Website bauen und deployen
```

---

## Dienste-Übersicht mit Admin-Zugängen

`{DOMAIN}` ist `mentolder.de` oder `korczewski.de`. Lokal stehen dieselben Endpunkte unter `*.localhost`.

| Dienst | URL | Admin-Zugang |
|--------|-----|--------------|
| Portal & Website | `https://web.{DOMAIN}` | `https://web.{DOMAIN}/admin` (Gruppe `workspace-admins`) |
| Keycloak (SSO) | `https://auth.{DOMAIN}` | `https://auth.{DOMAIN}/admin` → Realm `workspace` |
| Nextcloud | `https://files.{DOMAIN}` | `https://files.{DOMAIN}/settings/admin` |
| Collabora | `https://office.{DOMAIN}` | Konfiguration über Nextcloud (WOPI) |
| Vaultwarden | `https://vault.{DOMAIN}` | `https://vault.{DOMAIN}/admin` (Token-Login) |
| Whiteboard | `https://board.{DOMAIN}` | — |
| DocuSeal | `https://sign.{DOMAIN}` | `https://sign.{DOMAIN}` (Admin-Konto) |
| Dokumentation | `https://docs.{DOMAIN}` | SSO-geschützt (Keycloak) |
| LiveKit | `https://livekit.{DOMAIN}` | Admin-Steuerseite: `https://web.{DOMAIN}/admin/stream` |
| Arena | `https://arena-ws.korczewski.de` | nur auf korczewski |
| Mailpit | `http://mail.localhost` | nur in Entwicklung |

---

## Benutzerverwaltung

### Keycloak Admin-UI

Alle Benutzerkonten werden zentral in Keycloak gepflegt. Änderungen gelten sofort für alle Dienste (Single Sign-On).

Aufruf: `https://auth.mentolder.de/admin` bzw. `https://auth.korczewski.de/admin` → Realm **workspace**

#### Neuen Benutzer anlegen

1. **Benutzer → Benutzer hinzufügen**
2. Felder: Benutzername (Kleinbuchstaben, kein Leerzeichen), E-Mail, Vorname, Nachname
3. Reiter **Zugangsdaten** → temporäres Passwort vergeben (Pflicht zur Änderung beim ersten Login)
4. Reiter **Gruppen** → Benutzer zuweisen:
   - `workspace-users` — normaler Mitarbeiter-Zugang
   - `workspace-admins` — Administratorzugang (Website-Admin-Panel, erweiterte Rechte)
   - `/dev-access` — Zugang zur Dev-Umgebung `dev.mentolder.de`

#### Passwort zurücksetzen

**Benutzer** → Benutzer auswählen → **Zugangsdaten** → **Passwort zurücksetzen** → Temporär: Ja → Speichern.

#### Benutzer deaktivieren

**Benutzer** → Benutzer auswählen → **Details** → Schalter **Aktiviert** ausschalten → Speichern. Daten bleiben erhalten.

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

### Admin-User einrichten

```bash
task workspace:admin-users-setup ENV=<env>
```

Provisioniert die in der Umgebung definierten Admin-Benutzer (`KC_USER1`, `KC_USER2`). Idempotent — bei bereits vorhandenen Benutzern wird nur aktualisiert.

### Keycloak-Realm synchronisieren

Nach Änderungen an der Realm-JSON oder OIDC-Client-Settings:

```bash
task keycloak:sync ENV=<env>
```

Details: [Keycloak](keycloak.md).

---

## Website-Admin-Panel

Das Admin-Panel ist erreichbar unter `https://web.{DOMAIN}/admin` (Login mit Gruppe `workspace-admins` erforderlich). Eine vollständige Referenz aller Bereiche findet sich im [Admin-Webinterface-Handbuch](admin-webinterface.md).

| Bereich | Pfad | Funktion |
|---------|------|----------|
| Inbox | `/admin/inbox` | Eingehende Kontaktanfragen |
| Nachrichten | `/admin/nachrichten` | Kundenkommunikation und Direktnachrichten |
| Räume | `/admin/raeume` | Gruppenkanäle verwalten |
| Kunden | `/admin/clients` | Kundenverwaltung (Keycloak-Integration) |
| Projekte | `/admin/projekte` | Projektmanagement mit Gantt-Diagramm |
| Kalender | `/admin/kalender` | Aufgabenkalender (Monatsansicht) |
| Termine | `/admin/termine` | Buchungen und Slot-Konfiguration |
| Follow-ups | `/admin/followups` | Wiedervorlagen und Erinnerungen |
| Zeiterfassung | `/admin/zeiterfassung` | Arbeitszeiterfassung mit CSV-Export |
| Rechnungen | `/admin/rechnungen` | ZUGFeRD-PDF, E-Rechnung, SEPA-Lastschrift |
| Meetings | `/admin/meetings` | Aufgezeichnete Meetings und Transkripte |
| Monitoring | `/admin/monitoring` | Live-Kubernetes-Cluster-Übersicht (beide Cluster) |
| Bugs | `/admin/bugs` | Bug-Reports und Ticket-Tracking |
| Stream | `/admin/stream` | LiveKit-Livestream-Steuerung |
| Startseite | `/admin/startseite` | Inhalte der Startseite bearbeiten |
| Leistungen | `/admin/angebote` | Dienstleistungen und Preise pflegen |
| Über mich | `/admin/uebermich` | „Über mich"-Seite bearbeiten |
| Referenzen | `/admin/referenzen` | Kundennachweise verwalten |
| Kontakt | `/admin/kontakt` | Kontaktseite bearbeiten |
| FAQ | `/admin/faq` | Häufige Fragen bearbeiten |
| Rechtliches | `/admin/rechtliches` | Impressum, Datenschutz, AGB, Barrieref. |

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
php occ app:enable <app>                         # App aktivieren
php occ user:setting <user> files quota <limit>  # Speicherlimit setzen
php occ maintenance:mode --on                    # Wartungsmodus an
php occ maintenance:mode --off                   # Wartungsmodus aus
php occ status                                   # Systemstatus anzeigen
```

### Apps nach Deploy aktivieren

```bash
task workspace:post-setup ENV=<env>
```

Aktiviert: calendar, contacts, user_oidc, richdocuments (Collabora), whiteboard, notify_push, talk.

### Talk-Infrastruktur konfigurieren

```bash
task workspace:talk-setup ENV=<env>        # HPB-Signaling + CoTURN
task workspace:recording-setup ENV=<env>   # Aufzeichnungs-Backend
task workspace:whiteboard-setup ENV=<env>  # Whiteboard-App
task workspace:systembrett-setup ENV=<env> # Brett-Integration in Talk
```

Details: [Nextcloud](nextcloud.md) · [Talk HPB](talk-hpb.md).

---

## E-Rechnung (XRechnung / ZUGFeRD)

Drei Profile stehen beim Rechnungsversand und -download zur Auswahl:

| Profil | Verwendung | Endpoint |
|--------|-----------|----------|
| `factur-x-minimum` | B2C / interne Archivierung | `/api/billing/invoice/<id>/pdf?profile=factur-x-minimum` |
| `xrechnung-cii` | B2G (Bund/Länder), CII-Syntax | `/api/billing/invoice/<id>/pdf?profile=xrechnung-cii` |
| `xrechnung-ubl` | B2G, UBL-2.1-Syntax (ZRE/OZG-RE) | `/api/billing/invoice/<id>/pdf?profile=xrechnung-ubl` |

Für `xrechnung-*` muss die **Leitweg-ID** des Empfängers gesetzt sein (Format `<grob>-[<fein>-]<prüfziffer>` nach KoSIT 2.0.2):

```bash
# Leitweg-ID setzen
PATCH /api/admin/billing/customers/<customer-id>/leitweg
{ "leitwegId": "991-01234-44" }

# Nur XML abrufen
GET /api/billing/invoice/<id>/zugferd?profile=<profile>

# Lokal validieren
task billing:validate-einvoice -- ./rechnung.pdf
task billing:validate-einvoice -- ./factur-x.xml
```

---

## Monitoring & Observability

### Live-Übersicht im Admin-Panel

`https://web.{DOMAIN}/admin/monitoring` zeigt Pod-Status, CPU- und RAM-Auslastung sowie Kubernetes-Events — für beide Cluster. Die Daten werden über die MCP-Kubernetes-Integration abgerufen.

### Kommandozeile

```bash
task workspace:status ENV=<env>            # Pods, Services, Ingress, PVCs
task workspace:logs ENV=<env> -- keycloak  # Logs eines Services
task workspace:logs ENV=<env> -- nextcloud
task workspace:logs ENV=<env> -- website
task health                                # Cross-Cluster-Connectivity beider Cluster
task clusters:status                       # Einzeiliger Status beider Cluster
```

### Service neu starten

```bash
task workspace:restart ENV=<env> -- nextcloud
task workspace:restart ENV=<env> -- keycloak
task workspace:restart ENV=<env> -- vaultwarden
```

---

## Secrets-Management (Produktion)

Produktions-Secrets werden **nie im Klartext** eingecheckt. Der Bitnami Sealed Secrets Controller verschlüsselt sie clusterspezifisch.

> **Wichtig:** Ein SealedSecret ist cluster-spezifisch — eine für `mentolder` verschlüsselte Datei funktioniert **nicht** auf `korczewski`. Jede Rotation muss auf beiden Clustern separat durchgeführt werden.

**Workflow für neue oder rotierte Secrets:**

```bash
# 1. Klartext-Secrets editieren
task env:generate ENV=mentolder

# 2. Als SealedSecret verschlüsseln
task env:seal ENV=mentolder

# 3. Verschlüsselte Datei committen (sicher für Git)
git add environments/sealed-secrets/mentolder.yaml

# 4. Konfiguration validieren
task env:validate ENV=mentolder

# 5. Auf den Cluster anwenden (ohne Workload-Roll)
task secrets:sync
```

> **Fußangel:** Den `$patch: delete`-Block in `prod/kustomization.yaml` **niemals entfernen** — er strippt Dev-Platzhalter aus `k3d/secrets.yaml`, sodass SealedSecrets-gemanagte Produktions-Secrets bei jedem Deploy erhalten bleiben.

Details: [Umgebungen](environments.md).

---

## Deployment in Produktion

### Workloads ausrollen

```bash
task feature:deploy               # Alle Services auf BEIDEN Clustern (empfohlen)
task workspace:deploy ENV=mentolder   # Nur mentolder
task workspace:deploy ENV=korczewski  # Nur korczewski
task feature:website              # Website neu bauen + rollen (beide Cluster)
task feature:brett                # Brett neu bauen + rollen (beide Cluster)
task feature:livekit              # LiveKit DNS-Pinning + Rollen (beide Cluster)
```

### Kustomize-Overlays

- `prod/` — gemeinsame Patches; **niemals allein anwenden** (enthält den `$patch: delete`-Block)
- `prod-mentolder/` / `prod-korczewski/` — die tatsächlich applizierbaren Overlays
- `k3d/office-stack` (Collabora) und `k3d/coturn-stack` werden separat via `task workspace:office:deploy ENV=<env>` ausgerollt

### Docs-Image aktualisieren

Der Docs-Inhalt ist im Docker-Image eingebaut — nach Änderungen an `k3d/docs-content/` muss das Image neu gebaut werden:

```bash
task docs:deploy   # Baut Image, pusht, rollt beide Cluster
```

> `docs:configmap:apply` hat keine Wirkung auf laufende Pods — immer `docs:deploy` verwenden.

---

## Backups

Backups werden automatisch per Kubernetes CronJob erstellt.

```bash
# Sofortiges Backup auslösen
task workspace:backup ENV=<env>

# Verfügbare Snapshots auflisten
task workspace:backup:list ENV=<env>

# Einzelne Datenbank wiederherstellen
task workspace:restore -- <db> <timestamp> ENV=<env>
# db: keycloak | nextcloud | vaultwarden | website | docuseal | all
```

Backup-Inhalt: PostgreSQL-Dumps (alle Datenbanken), Nextcloud-Daten, Vaultwarden-Vault.

Details: [Backup & Wiederherstellung](backup.md).

---

## LiveKit — Livestream-Betrieb

LiveKit läuft auf `hostNetwork` und ist via `nodeAffinity` auf die Pin-Node `gekko-hetzner-3` (mentolder) fixiert. Admin-Steuerseite: `https://web.{DOMAIN}/admin/stream`. Zuschauer-Seite: `https://web.{DOMAIN}/portal/stream`.

```bash
task livekit:status ENV=<env>           # Pods, Services, Ingress, Recordings
task livekit:logs ENV=<env>             # livekit-server Logs
task livekit:logs ENV=<env> -- ingress  # RTMP-Ingress Logs
task livekit:logs ENV=<env> -- egress   # Recording-Egress Logs
task livekit:recordings ENV=<env>       # MP4-Liste im Egress-PVC
task livekit:end-stream ENV=<env>       # Notfall: Server neu starten
task livekit:dns-pin ENV=<env>          # DNS auf Pin-Node zeigen (APPLY=true zum Anwenden)
task livekit:firewall-open NODE=<ip>    # ufw-Ports öffnen (7880/7881 TCP, 50000-60000/30000-40000 UDP)
```

> **DNS-Pinning ist erforderlich.** Ohne Pinning treffen Browser-Clients ~66% der Zeit auf einen Nicht-LiveKit-Node → ICE-Fehler, kein Stream.

Details: [Livestream](livestream.md).

---

## Brett (Systembrett)

Brett ist der 3D-Systembrett-Service unter `brett.{DOMAIN}`. Er läuft auf beiden Clustern.

```bash
task brett:build                  # Image bauen (+ k3d-Import in dev)
task brett:deploy ENV=<env>       # Bauen, pushen, ausrollen
task brett:logs ENV=<env>         # Brett-Logs
task brett:bot-setup ENV=<env>    # /brett Slash-Command in Nextcloud Talk registrieren
```

Details: [Systembrett](systembrett.md).

---

## Arena-Server (Multiplayer)

Der Arena-Server läuft **ausschließlich auf dem korczewski-Cluster** (`arena-ws.korczewski.de`). Beide Websites können darauf zugreifen; der Server validiert JWT von beiden Keycloak-Realms.

```bash
task arena:build                  # Image bauen
task arena:deploy ENV=korczewski  # Bauen, pushen, ausrollen
task feature:arena                # Kurzform: Build + Deploy auf korczewski
task arena:status ENV=korczewski  # Pod + Service-Status
task arena:logs ENV=korczewski    # Logs
task arena:db ENV=korczewski      # psql in das arena-Schema
```

> `task arena:deploy ENV=mentolder` bricht mit Erklärung ab — Arena läuft nur auf korczewski.

Details: [Arena](arena.md).

---

## Coaching-Pipeline & Wissensdatenbank

Die Coaching-Pipeline verarbeitet PDF/EPUB-Bücher in Wissens-Chunks und macht sie über pgvector abrufbar.

```bash
# Buch hochladen und verarbeiten
task coaching:ingest -- <file.pdf> <slug> --title="Titel" --author="Autor"

# KI-Klassifikation (benötigt Anthropic-API oder lokales Ollama)
task coaching:classify -- --slug=<slug>
task coaching:classify -- --all

# Embeddings neu indizieren
task knowledge:reindex ENV=<env>
# Mit Quellauswahl: SOURCE=prs|markdown|bugs|all
```

Entwürfe zur Prüfung: `https://web.mentolder.de/admin/knowledge/drafts`

> **Lokale Klassifikation:** Bei fehlendem Anthropic-API-Schlüssel — lokales Ollama + Docker-LiteLLM als Übersetzer. Details: [Coaching-Pipeline](coaching-pipeline.md).

---

## Datenbankzugang (PostgreSQL)

```bash
task workspace:psql ENV=<env> -- <db>          # psql-Shell öffnen
task workspace:port-forward ENV=<env>          # DB auf localhost:5432 forwarden
task workspace:db:drop -- <dbname> ENV=<env>   # DB löschen (mit Bestätigung)
task workspace:db:restore -- <db> <ts> ENV=<env>  # Backup einspielen
task workspace:sync-db-passwords ENV=<env>     # Rollen-Passwörter abgleichen
```

Verfügbare Datenbanken: `keycloak`, `nextcloud`, `vaultwarden`, `website`, `docuseal`, `arena`, `bachelorprojekt`.

Schema-Diagramm erzeugen: `task db:diagram`

---

## Routineaufgaben — Schnellreferenz

| Aufgabe | Befehl |
|---------|--------|
| Alle Services deployen (beide Cluster) | `task feature:deploy` |
| Nur Website deployen (beide Cluster) | `task feature:website` |
| Post-Deploy-Setup | `task workspace:post-setup ENV=<env>` |
| DB-Shell öffnen | `task workspace:psql ENV=<env> -- website` |
| Keycloak-Realm synchronisieren | `task keycloak:sync ENV=<env>` |
| DB-Passwörter abgleichen | `task workspace:sync-db-passwords ENV=<env>` |
| DSGVO-Compliance prüfen | `task workspace:dsgvo-check` |
| Beide Cluster prüfen | `task health` |
| Alle Tests ausführen | `./tests/runner.sh local` |
| Docs deployen | `task docs:deploy` |
| Vaultwarden-Seed | `task workspace:vaultwarden:seed` |
| Nextcloud-Branding neu anwenden | `task workspace:theme ENV=<env>` |
| Smoke-Tests nach Deploy | `task workspace:verify:all-prods` |

Vollständige Task-Referenz: [Operations](operations.md).

---

## Häufige Admin-Fragen

### Ein Service startet nicht

```bash
task workspace:logs ENV=<env> -- <service>
kubectl describe pod -n workspace -l app=<service>
kubectl get events -n workspace --sort-by='.lastTimestamp'
```

Häufige Ursachen: Datenbankverbindung fehlgeschlagen, fehlendes Secret, unaufgelöste `${VAR}`-Platzhalter in Manifests oder Realm-JSON, unzureichende Ressourcen.

### Keycloak-Login funktioniert nicht für einen Dienst

1. OIDC-Client in Keycloak prüfen: **Clients** → Client auswählen
2. Redirect-URIs prüfen (exakt, inkl. Protokoll und Pfad)
3. `task keycloak:sync ENV=<env>` ausführen
4. Dienst neu starten: `task workspace:restart ENV=<env> -- <dienst>`

Details: [Keycloak & SSO](keycloak.md).

### Wie füge ich eine neue Domain/Hostname hinzu?

1. `k3d/configmap-domains.yaml` anpassen
2. Ingress-Regel in `k3d/ingress.yaml` ergänzen
3. `task workspace:validate` ausführen
4. Falls neuer Envvar: in `environments/schema.yaml` deklarieren und in `envsubst`-Listen der betroffenen Tasks ergänzen
5. PR erstellen, nach Merge: `task feature:deploy`

### Wie richte ich eine neue Produktionsumgebung ein?

Schritt-für-Schritt: [Umgebungen → Neue Umgebung einrichten](environments.md#neue-umgebung-einrichten).

### Secrets rotieren

Klartext in `.secrets/<env>.yaml` aktualisieren → `task env:seal ENV=<env>` → Commit → `task secrets:sync`. Details: oben unter Secrets-Management.

### LiveKit — ICE schlägt fehl / kein Stream

1. `task livekit:dns-pin ENV=<env>` → DNS auf Pin-Node zeigen lassen
2. Firewall prüfen: 7880/7881 TCP und 50000-60000 UDP + 30000-40000 UDP offen?
3. `task livekit:status ENV=<env>` → Pods auf der richtigen Node (`gekko-hetzner-3`)?

### Nach Cluster-Reset funktionieren Secrets nicht

Nach jedem Cluster-Reset rotiert der Sealed-Secrets-Controller seinen Keypair. Pflichtschritte:

```bash
task env:fetch-cert ENV=<env>  # neues Zertifikat holen
task env:seal ENV=<env>        # Secrets neu verschlüsseln
# committen + secrets:sync
```

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
| MCP-Server (Claude Code) | [Claude Code](claude-code.md) |
| Deployment & Taskfile | [Operations](operations.md) |
| Sicherheit & DSGVO | [Sicherheit](security.md) · [DSGVO](dsgvo.md) |
| Backup & Wiederherstellung | [Backup](backup.md) |
| Livestream (LiveKit) | [Livestream](livestream.md) |
| Systembrett (Brett) | [Systembrett](systembrett.md) |
| Arena-Server | [Arena](arena.md) |
| Fehlerbehebung | [Fehlerbehebung](troubleshooting.md) |
| Testframework | [Tests](tests.md) |
