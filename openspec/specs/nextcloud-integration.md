# nextcloud-integration

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

## Purpose

Nextcloud ist die zentrale Dateiablage und Videokonferenz-Plattform der Workspace-Plattform.
Diese Spec beschreibt den Integrationsvertrag zwischen Nextcloud (Files + Talk) und den
umgebenden Plattformdiensten: Keycloak (SSO), Redis (Cache/Locking), PostgreSQL (Daten),
Collabora (Office), spreed-signaling/HPB (Talk-Signaling), CoTURN (TURN/ICE), dem
Talk-Transcriber und dem Talk-Recording-Backend.

---

## Requirements

### Requirement: OIDC-SSO via Keycloak

The system SHALL authenticate all Nextcloud users exclusively via Keycloak OIDC, mapping
`preferred_username` as user ID and `roles` as group attribute; the local password form
MUST remain hidden in production but MAY remain visible in dev.

#### Scenario: Erstzugang eines Keycloak-Benutzers
- **GIVEN** ein Nutzer ist in Keycloak im Realm `workspace` mit der Rolle `user` vorhanden
- **WHEN** er `https://<NC_DOMAIN>` aufruft
- **THEN** wird er automatisch zu Keycloak umgeleitet (`oidc_login_auto_redirect = true`)
- **AND** nach erfolgreichem Login wird sein Nextcloud-Account mit `preferred_username` als ID und `email`/`name` aus dem Token angelegt

#### Scenario: Admin-Gruppe aus Keycloak
- **GIVEN** ein Keycloak-Benutzer hat die Rolle `admin`
- **WHEN** er sich via OIDC anmeldet
- **THEN** wird er der Nextcloud-Administratorengruppe zugeordnet (`oidc_login_admin_group = 'admin'`)
- **AND** er kann nicht selbst seinen Displaynamen ändern (`allow_user_to_change_display_name = false`)

#### Scenario: Logout-Redirect
- **GIVEN** ein authentifizierter Nutzer klickt auf "Abmelden"
- **WHEN** Nextcloud den Logout-URL aufruft
- **THEN** wird die Session bei Keycloak beendet und der Browser kehrt zur Nextcloud-Startseite zurück (`post_logout_redirect_uri`)

---

### Requirement: Redis-basiertes Caching und Distributed Locking

The system SHALL use Redis for distributed memcache and file-locking so that concurrent
file operations do not corrupt data and response times remain acceptable under load.

#### Scenario: Redis-Verbindung beim Start
- **GIVEN** der Nextcloud-Pod startet
- **WHEN** er die Konfiguration aus `zz-extra.config.php` liest
- **THEN** nutzt er `nextcloud-redis.workspace.svc.cluster.local:6379` als `memcache.distributed` und `memcache.locking`
- **AND** APCu wird als lokaler In-Process-Cache (`memcache.local`) zusätzlich aktiviert

#### Scenario: Redis-Ausfall
- **GIVEN** der Redis-Pod ist nicht erreichbar
- **WHEN** Nextcloud eine Datei-Operation ausführt
- **THEN** schlägt das Locking fehl und Nextcloud zeigt einen Fehler, anstatt korrumpierende Parallel-Writes zuzulassen

---

### Requirement: PostgreSQL als primäre Datenbank

The system SHALL use a dedicated PostgreSQL database (`nextcloud` schema in the shared-db
instance) for all persistent application state; the DB password SHALL be injected at
runtime via environment variable, never hardcoded in a mounted config file.

#### Scenario: Passwort-Injektion
- **GIVEN** `workspace-secrets` enthält den Key `NEXTCLOUD_DB_PASSWORD`
- **WHEN** der Nextcloud-Pod (Haupt-Container und Cron-Sidecar) startet
- **THEN** liest `zz-db.config.php` das Passwort via `getenv('POSTGRES_PASSWORD')`
- **AND** der Cron-Sidecar erhält dieselbe Env-Variable, damit `cron.php` keine "no password supplied"-Fehler wirft

---

### Requirement: Hintergrundaufgaben via Cron-Sidecar

The system SHALL run `php cron.php` every 5 minutes inside a dedicated sidecar container
within the same Pod so that background jobs (file indexing, notifications, cleanup) execute
without depending on an external CronJob or web cron.

#### Scenario: Cron-Ausführung ohne root
- **GIVEN** der Cron-Sidecar läuft als UID 33 (www-data) ohne `CAP_SETUID`
- **WHEN** der 300-Sekunden-Sleep abläuft
- **THEN** wird `php -f /var/www/html/cron.php` direkt aufgerufen (kein `su`), und Fehler werden ignoriert (`|| true`), damit der Loop weiterläuft

---

### Requirement: Talk High Performance Backend (HPB) via spreed-signaling

The system SHALL route all Nextcloud Talk signaling through the spreed-signaling server,
which uses NATS as internal message bus and Janus as SFU; the signaling secret SHALL be
injected at pod startup via a sed-rendered config template, not committed in plaintext.

#### Scenario: In-Cluster PHP-Aufruf zum Signaling-Server
- **GIVEN** Nextcloud-PHP will den Signaling-Server unter `signaling.localhost` erreichen
- **WHEN** libcurl die Domain `*.localhost` intern auf 127.0.0.1 auflöst
- **THEN** leitet das Apache-Modul `signaling-proxy.conf` Anfragen auf `/api/v1/` an `http://spreed-signaling:8080/api/v1/` weiter
- **AND** Browser-WebSocket-Traffic geht direkt über Traefik und ist von diesem Proxy unberührt

#### Scenario: Janus-Colocation
- **GIVEN** Janus läuft im `coturn`-Namespace mit `hostNetwork: true` auf einem fixen Node
- **WHEN** spreed-signaling deployt wird
- **THEN** erzwingt eine `podAffinity`-Regel dass spreed-signaling auf demselben Kubernetes-Node landet wie Janus
- **AND** der WebSocket-Pfad zu `ws://janus.coturn:8188` bleibt lokal (kein DNAT über Kube-Proxy nötig)

---

### Requirement: Talk-Transkription via Transcriber-Bot

The system SHALL automatically detect active Talk calls via direct PostgreSQL queries against
`oc_talk_sessions`, join calls headlessly with a dedicated `transcriber-bot` account, record
audio via PulseAudio/ffmpeg, transcribe with Whisper, and POST the result to the website API.

#### Scenario: Automatische Raum-Mitgliedschaft
- **GIVEN** ein neuer Gruppen- oder öffentlicher Talk-Raum wird angelegt
- **WHEN** der `auto_join_loop` im Transcriber-Service läuft (alle 30 s)
- **THEN** wird `transcriber-bot` via direkten DB-INSERT in `oc_talk_attendees` Mitglied des Raums
- **AND** das Logging zeigt `[auto-join] added transcriber-bot to room <token>`

#### Scenario: Transkript-Speicherung nach Gesprächsende
- **GIVEN** alle aktiven Sessions in einem Raum beenden den Call (in_call = 0 oder last_ping > 120 s)
- **WHEN** `_finalize_and_teardown` aufgerufen wird
- **THEN** wird das zusammengesetzte Transkript (Text + Segmente + Meeting-Ressourcen) per POST an `WEBSITE_URL/api/meeting/save-transcript` gesendet
- **AND** Meeting-Ressourcen (Whiteboard-Dateien, Office-Aktivitäten, Talk-Attachments) werden aus den `oc_*`-Tabellen gelesen und beigefügt

#### Scenario: Webhook-basierter Trigger
- **GIVEN** Nextcloud Talk sendet ein `call_started`-Event an den Transcriber-Webhook
- **WHEN** die HMAC-SHA256-Signatur im Header `X-Nextcloud-Talk-Signature` korrekt ist
- **THEN** startet der Transcriber sofort eine neue Session für diesen Raum (sofern `MAX_SESSIONS` nicht erreicht)

---

### Requirement: Talk-Aufnahme via Recording-Backend

The system SHALL support call recording through the official `nextcloud/aio-talk-recording`
service, which authenticates with the spreed-signaling server via a shared `RECORDING_SECRET`
and saves recordings to the call creator's Nextcloud Files directory.

#### Scenario: Recording-Backend-Registrierung
- **GIVEN** der Talk-Recording-Pod läuft und `RECORDING_SECRET` ist aus `workspace-secrets` injiziert
- **WHEN** Nextcloud Talk via `occ config:app:set spreed recording_servers` konfiguriert wird
- **THEN** erreichet das Recording-Backend den Signaling-Server unter `spreed-signaling:8080` (WebSocket, `ws://`)
- **AND** Aufnahmen landen im Nextcloud-Dateiverzeichnis des Call-Erstellers

---

### Requirement: Dateiverzeichnis-Permissions und Startup-Reihenfolge

The system SHALL enforce correct filesystem permissions on the Nextcloud data directory
(`0770`, owned by `www-data`/UID 33) via init containers before the main container starts,
because local-path provisioner creates PVCs world-readable (`2777`) and Nextcloud refuses
to start (HTTP 503) on world-readable data directories.

#### Scenario: Init-Container-Sequenz beim Pod-Start
- **GIVEN** ein neuer Nextcloud-Pod startet mit einem frisch provisionierten local-path PVC
- **WHEN** die init container `fix-data-perms`, `fix-config-perms`, `copy-php-conf` sequenziell durchlaufen
- **THEN** ist `/var/www/html/data` mit `chown 33:33` + `chmod 0770` gesetzt bevor der Haupt-Container startet
- **AND** `notify_push` wartet nach dem Hauptcontainer-Start bis das `notify_push`-Binary und `config.php` verfügbar sind, bevor es sich ausführt

#### Scenario: notify_push Push-Daemon
- **GIVEN** der `notify_push`-Sidecar läuft und das Binary ist unter `apps/notify_push/bin/<arch>/notify_push` verfügbar
- **WHEN** ein Client eine Dateiänderung auslöst
- **THEN** leitet Apache `/push/` via Proxy an `localhost:7867` weiter, so dass iOS/Desktop-Clients Push-Benachrichtigungen erhalten

---

### Requirement: Admin Path ACL Bypass

The system SHALL allow administrators to access any Nextcloud file path without restriction,
stripping any leading slash from the returned normalized path.

#### Scenario: Admin greift auf fremden Client-Ordner zu

- **GIVEN** ein Nutzer hat `isAdmin: true`
- **WHEN** `assertPathAllowed('Clients/other/file.pdf', { isAdmin: true, username: 'admin' })` aufgerufen wird
- **THEN** gibt die Funktion `'Clients/other/file.pdf'` zurück ohne Fehler

#### Scenario: Admin-Pfad mit führendem Slash

- **GIVEN** ein Nutzer hat `isAdmin: true`
- **WHEN** `assertPathAllowed('/some/random/path', { isAdmin: true, username: 'admin' })` aufgerufen wird
- **THEN** gibt die Funktion `'some/random/path'` zurück (führender Slash wird entfernt)

---

### Requirement: Customer Path Restriction to Own Client Folder

The system SHALL restrict non-admin users to paths within their own client folder
(`Clients/<username>/`) and SHALL throw an error matching `/Zugriff.*verweigert|Pfad.*nicht.*erlaubt|not allowed/`
when a path outside that folder is requested.

#### Scenario: Kunde greift auf eigenen Ordner zu

- **GIVEN** ein Nutzer hat `isAdmin: false` und `username: 'max.mustermann'`
- **WHEN** `assertPathAllowed('Clients/max.mustermann/report.pdf', ...)` aufgerufen wird
- **THEN** gibt die Funktion `'Clients/max.mustermann/report.pdf'` zurück ohne Fehler

#### Scenario: Kunde greift auf fremden Client-Ordner zu

- **GIVEN** ein Nutzer hat `isAdmin: false` und `username: 'max.mustermann'`
- **WHEN** `assertPathAllowed('Clients/other/report.pdf', ...)` aufgerufen wird
- **THEN** wirft die Funktion einen Fehler der auf `/Zugriff.*verweigert|Pfad.*nicht.*erlaubt|not allowed/` passt

---

### Requirement: Path Traversal Prevention

The system SHALL reject any path containing traversal sequences (`../`) for non-admin users,
preventing access to files outside the Nextcloud data directory.

#### Scenario: Einfacher Traversal-Versuch

- **GIVEN** ein Nutzer hat `isAdmin: false` und `username: 'max.mustermann'`
- **WHEN** `assertPathAllowed('../etc/passwd', ...)` aufgerufen wird
- **THEN** wirft die Funktion einen Fehler (beliebige Fehlermeldung)

#### Scenario: Traversal innerhalb eines erlaubten Basispfads

- **GIVEN** ein Nutzer hat `isAdmin: false` und `username: 'max.mustermann'`
- **WHEN** `assertPathAllowed('Clients/max.mustermann/../../etc', ...)` aufgerufen wird
- **THEN** wirft die Funktion einen Fehler, obwohl der Pfad mit dem eigenen Ordner beginnt

---

### Requirement: Empty and Whitespace-Only Path Rejection

The system SHALL reject empty strings and paths consisting solely of whitespace characters,
throwing an error before any path normalization or ACL check occurs.

#### Scenario: Leerer Pfad

- **GIVEN** ein Nutzer hat `isAdmin: false` und `username: 'max.mustermann'`
- **WHEN** `assertPathAllowed('', ...)` aufgerufen wird
- **THEN** wirft die Funktion einen Fehler

#### Scenario: Pfad aus nur Leerzeichen

- **GIVEN** ein Nutzer hat `isAdmin: false` und `username: 'max.mustermann'`
- **WHEN** `assertPathAllowed('  ', ...)` aufgerufen wird
- **THEN** wirft die Funktion einen Fehler

---

### Requirement: Path Normalization

The system SHALL normalize file paths by collapsing consecutive slashes into a single slash
before performing ACL checks and returning the canonical path.

#### Scenario: Doppelter Slash im Pfad wird normalisiert

- **GIVEN** ein Nutzer hat `isAdmin: false` und `username: 'max.mustermann'`
- **WHEN** `assertPathAllowed('Clients/max.mustermann//report.pdf', ...)` aufgerufen wird
- **THEN** gibt die Funktion `'Clients/max.mustermann/report.pdf'` zurück (doppelter Slash entfernt)

---

### Requirement: Username Validation

The system SHALL validate Nextcloud usernames against the pattern `[a-zA-Z0-9._@-]+`,
throwing an `Invalid username` error for any username containing characters outside this set.

#### Scenario: Gültiger Benutzername

- **GIVEN** ein Benutzername enthält nur Buchstaben, Zahlen und die Zeichen `.`, `_`, `@`, `-`
- **WHEN** `getClientFolderPath(username)` aufgerufen wird
- **THEN** gibt die Funktion den Pfad `Clients/<username>/` zurück ohne Fehler

#### Scenario: Ungültiger Benutzername mit Sonderzeichen

- **GIVEN** ein Benutzername enthält ein nicht erlaubtes Sonderzeichen (z. B. `/`, `<`, Leerzeichen)
- **WHEN** `getClientFolderPath(username)` aufgerufen wird
- **THEN** wirft die Funktion einen Fehler mit der Meldung `Invalid username: <username>`

---

### Requirement: WORKSPACE_NAMESPACE Namespace Targeting

The system SHALL use `${WORKSPACE_NAMESPACE:-workspace}` (never the hardcoded string `-n workspace`) in every Taskfile task and script that touches workspace resources, so that korczewski-targeted operations land in `workspace-korczewski` and not silently in mentolder's `workspace` namespace.

#### Scenario: Post-Setup für korczewski-Brand

- **GIVEN** `ENV=korczewski` ist gesetzt und `env-resolve.sh` hat `WORKSPACE_NAMESPACE=workspace-korczewski` exportiert
- **WHEN** `task workspace:post-setup ENV=korczewski` ausgeführt wird (z. B. OIDC-Redirects, Talk-Signaling konfigurieren)
- **THEN** werden alle `kubectl` Aufrufe gegen `-n workspace-korczewski` ausgeführt
- **AND** der `workspace` Namespace (mentolder) bleibt unverändert

#### Scenario: Neuer Task berührt workspace-Ressourcen

- **GIVEN** ein neuer Taskfile-Task wird hinzugefügt, der `kubectl` Befehle auf Namespace-Ressourcen ausführt
- **WHEN** der Task implementiert wird
- **THEN** verwendet er `${WORKSPACE_NAMESPACE:-workspace}` (oder `${NAMESPACE:-${WORKSPACE_NAMESPACE:-workspace}}` in Scripts) als Namespace-Referenz
- **AND** er sourcet `env-resolve.sh` vor dem ersten `kubectl`-Aufruf, damit `WORKSPACE_NAMESPACE` korrekt gesetzt ist

---

### Requirement: Explicit ENV= for All Env-Sensitive Deploys

The system SHALL require an explicit `ENV=` parameter for all environment-sensitive tasks (`workspace:deploy`, `workspace:post-setup`, `workspace:talk-setup`, `docs:deploy`, etc.); tasks SHALL default to `ENV=dev` when unset, and the kubectl-context mismatch check SHALL only run when `ENV != dev`, so that a missing `ENV=` with the wrong active context silently targets whatever cluster is current.

#### Scenario: Deploy ohne ENV=-Angabe

- **GIVEN** der Entwickler führt `task workspace:deploy` ohne `ENV=` aus
- **WHEN** der Task die aktive kubectl-Context prüft
- **THEN** verwendet der Task `ENV=dev` als Default und deployt in den k3d-Dev-Cluster (kein Kontext-Mismatch-Check greift)
- **AND** es wird kein Warn-Fehler für falschen Produktions-Kontext ausgelöst

#### Scenario: Nextcloud OIDC-Konfiguration auf fleet für mentolder

- **GIVEN** der Operator will die Nextcloud OIDC-Konfiguration auf dem fleet-Cluster für mentolder aktualisieren
- **WHEN** `task workspace:post-setup ENV=mentolder` ausgeführt wird
- **THEN** wird `ENV=mentolder` (Alias `fleet-mentolder`) zum fleet-Kontext aufgelöst und die Konfiguration in `workspace` geschrieben
- **AND** das Weglassen von `ENV=mentolder` hätte den Dev-k3d-Cluster verändert, ohne Fehlermeldung

---

### Requirement: Cross-Cutting Changes Apply to Both Brand Namespaces

The system SHALL apply cross-cutting changes (DB password rotation, OIDC client configuration, Nextcloud schema migrations) explicitly to both `workspace` (mentolder) and `workspace-korczewski` (korczewski) namespaces on the fleet cluster, because both brands share a single fleet cluster but run as independent per-namespace deployments with no automatic cross-namespace propagation.

#### Scenario: OIDC-Client-Anpassung für beide Brands

- **GIVEN** eine Änderung an der Keycloak OIDC-Client-Konfiguration für Nextcloud wird durchgeführt (z. B. Redirect-URL hinzufügen)
- **WHEN** `task workspace:post-setup ENV=mentolder` und anschließend `task workspace:post-setup ENV=korczewski` ausgeführt werden
- **THEN** ist die OIDC-Konfiguration in beiden Namespaces (`workspace` und `workspace-korczewski`) konsistent aktualisiert
- **AND** ein einzelner `ENV=mentolder`-Aufruf allein hinterließe den korczewski-Namespace mit der alten Konfiguration

#### Scenario: Mergen auf main deployt nicht automatisch

- **GIVEN** ein PR mit einer Nextcloud-Konfigurationsänderung wird auf `main` gemergt
- **WHEN** der Merge abgeschlossen ist
- **THEN** werden KEINE Änderungen automatisch auf den fleet-Cluster ausgerollt (kein GitOps-Reconciler vorhanden)
- **AND** der Operator muss explizit `task workspace:deploy ENV=mentolder` und `task workspace:deploy ENV=korczewski` ausführen, um beide Brands zu aktualisieren

---

### Requirement: Cross-Brand Shared Infrastructure Isolation

The system SHALL maintain strict namespace-level isolation between brands (`workspace` for mentolder, `workspace-korczewski` for korczewski) on the shared fleet cluster, even though both brands share cluster-level infrastructure (cert-manager, Sealed Secrets controller, shared-db, Keycloak realm); each brand's Nextcloud instance SHALL operate exclusively within its own namespace and SHALL NOT access resources of the other brand's namespace.

#### Scenario: Shared-DB mit namespace-getrennten Nextcloud-Instanzen

- **GIVEN** beide Brands teilen sich dieselbe `shared-db` PostgreSQL-Instanz auf dem fleet-Cluster
- **WHEN** Nextcloud (mentolder, Namespace `workspace`) und Nextcloud (korczewski, Namespace `workspace-korczewski`) gleichzeitig laufen
- **THEN** greift jede Instanz ausschließlich auf ihre eigene Datenbank (`nextcloud` vs. `nextcloud_korczewski` o. ä.) zu
- **AND** ein Datenbankpasswort-Wechsel muss in beiden Namespaces via SealedSecret (`environments/sealed-secrets/mentolder.yaml` und `korczewski.yaml`) durchgeführt werden

#### Scenario: Keycloak-Realm-Konfiguration je Brand

- **GIVEN** Keycloak als zentraler OIDC-Provider läuft auf dem fleet-Cluster ohne Brand-spezifische Trennung auf Cluster-Ebene
- **WHEN** OIDC-Clients für Nextcloud konfiguriert werden
- **THEN** erhält jede Brand-Instanz einen eigenen OIDC-Client mit brand-spezifischen `redirect_uris` (z. B. `https://cloud.mentolder.de` vs. `https://cloud.korczewski.de`)
- **AND** ein Token, der für mentolder ausgestellt wurde, wird von der korczewski-Nextcloud-Instanz abgelehnt

---

### Requirement: Spec-BATS smoke coverage
The system SHALL provide an initial BATS test file covering the nextcloud-integration specification so that CI tracks its test presence.

#### Scenario: Initial smoke test passes
- **GIVEN** the `tests/spec/nextcloud-integration.bats` file exists
- **WHEN** `bats tests/spec/nextcloud-integration.bats` runs
- **THEN** the smoke test exits successfully

## Testszenarien

<!-- merged from Playwright e2e tests -->

### Requirement: Talk UI Accessibility
<!-- e2e: fa-03-video.spec.ts | e2e: fa-ios-talk.spec.ts -->

The system SHALL serve the Nextcloud Talk (`/apps/spreed`) interface reachably for authenticated users and redirect unauthenticated users to the login flow (Nextcloud login page or Keycloak OIDC auto-redirect).

#### Scenario: Talk-Oberfläche öffnen *(E2E)*
- **GIVEN** `TEST_NC_URL` ist gesetzt und Nextcloud ist erreichbar
- **WHEN** ein nicht authentifizierter Browser `/apps/spreed` (oder Fallback `/index.php/apps/spreed`) aufruft
- **THEN** ist eines der Elemente `[data-app-id="spreed"]`, `.app-spreed`, `#body-login`, `[data-login-form]`, `.pf-v5-c-login__main`, `#kc-form-login` sichtbar (Talk-App oder Login-Redirect)

#### Scenario: Talk-Link ohne Login aufrufbar (Gast) *(E2E)*
- **GIVEN** ein frischer Browser-Kontext ohne gespeicherte Session und `TEST_NC_URL` ist gesetzt
- **WHEN** der Browser `/apps/spreed` aufruft
- **THEN** ist einer der Selektoren `#body-login`, `[data-login-form]`, `.pf-v5-c-login__main`, `#kc-form-login`, `h2` sichtbar — die URL ist erreichbar und wird korrekt behandelt (kein 5xx)

---

### Requirement: HPB Signaling Server Availability
<!-- e2e: fa-03-video.spec.ts -->

The system SHALL expose the spreed-signaling HTTP API at `/api/v1/welcome` and return a JSON response with a `version` field, confirming the HPB backend is alive and the NATS connection is healthy.

#### Scenario: HPB Signaling-Server erreichbar *(E2E)*
- **GIVEN** `TEST_SIGNALING_URL` ist gesetzt und NATS-Backend läuft
- **WHEN** `GET <SIGNALING_URL>/api/v1/welcome` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 200 und einem JSON-Body, der das Feld `version` enthält

---

### Requirement: notify_push Push Endpoint
<!-- e2e: fa-ios-talk.spec.ts -->

The system SHALL expose the `notify_push` daemon at `/push` on the Nextcloud domain; the endpoint SHALL respond with HTTP 200, 400, or 405 (not 5xx), confirming the push daemon is alive and the Apache proxy to `localhost:7867` is active.

#### Scenario: notify_push endpoint antwortet *(E2E)*
- **GIVEN** `TEST_NC_URL` ist gesetzt und der `notify_push`-Sidecar läuft
- **WHEN** `GET <NC_URL>/push` aufgerufen wird
- **THEN** antwortet der Server mit einem der Statuscodes 200, 400 oder 405 (kein 5xx)

---

### Requirement: Talk Responsive Layout for Mobile (iOS/WebKit)
<!-- e2e: fa-ios-talk.spec.ts -->

The system SHALL render the Nextcloud Talk interface without horizontal overflow on iPhone viewport sizes (WebKit), so that mobile clients can use Talk without horizontal scrolling.

#### Scenario: Talk Viewport passt für iPhone (responsive layout) *(E2E)*
- **GIVEN** `TEST_NC_URL` ist gesetzt und ein WebKit-Browser mit iPhone-Viewport-Größe wird verwendet
- **WHEN** `/apps/spreed` aufgerufen wird
- **THEN** ist `document.documentElement.scrollWidth` nicht größer als `clientWidth + 10px` (kein horizontales Scrollen)

---

### Requirement: File Attachment API Authentication
<!-- e2e: fa-04-files.spec.ts -->

The system SHALL protect all project file attachment endpoints (`/api/portal/projekte`, `/api/admin/projekte/attachments/upload`, `/api/admin/projekte/attachments/delete`, `/api/admin/projekte/create`) with authentication, returning HTTP 401 or 403 for unauthenticated requests.

#### Scenario: Projektliste erfordert Authentifizierung *(E2E)*
- **GIVEN** kein Authentifizierungs-Token ist im Request enthalten
- **WHEN** `GET /api/portal/projekte` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 401 oder 403

#### Scenario: Datei-Upload erfordert Admin-Authentifizierung *(E2E)*
- **GIVEN** kein Admin-Token ist im Request enthalten
- **WHEN** `POST /api/admin/projekte/attachments/upload` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 401 oder 403

#### Scenario: Datei-Löschen erfordert Admin-Authentifizierung *(E2E)*
- **GIVEN** kein Admin-Token ist im Request enthalten
- **WHEN** `POST /api/admin/projekte/attachments/delete` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 401 oder 403

#### Scenario: Projekt-Anlegen erfordert Admin-Authentifizierung *(E2E)*
- **GIVEN** kein Admin-Token ist im Request enthalten
- **WHEN** `POST /api/admin/projekte/create` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 401 oder 403

#### Scenario: Portal-Projekte-Sektion leitet nicht authentifizierte Nutzer um *(E2E)*
- **GIVEN** kein Nutzer ist eingeloggt
- **WHEN** die Seite `/portal?section=projekte` aufgerufen wird
- **THEN** leitet der Browser den Nutzer weg von `/portal` (Redirect zur Login-Seite oder ähnlichem)

---

### Requirement: Communication System Test (Systemtest-03)
<!-- e2e: systemtest-03-kommunikation.spec.ts -->

The system SHALL complete all steps of System-Test 3 (Kommunikation) — covering the Chat-Widget, Inbox, and E-Mail flows — and submit the test results successfully.

#### Scenario: Alle Kommunikations-Systemtest-Schritte abschließen *(E2E)*
- **GIVEN** ein Admin-Passwort ist als Umgebungsvariable gesetzt (`ADMIN_PASSWORD`)
- **WHEN** der Systemtest-Runner alle 5 Schritte von Template 3 (Chat-Widget, Inbox, E-Mail) durchläuft
- **THEN** werden alle Schritte erfolgreich ausgeführt und das Systemtest-Formular abgesendet

<!-- merged from change delta nextcloud-integration.md (0e31d98f8905) -->