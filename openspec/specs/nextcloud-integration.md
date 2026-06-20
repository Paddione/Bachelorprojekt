# nextcloud-integration

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

Nextcloud ist die zentrale Dateiablage und Videokonferenz-Plattform der Workspace-Plattform.
Diese Spec beschreibt den Integrationsvertrag zwischen Nextcloud (Files + Talk) und den
umgebenden Plattformdiensten: Keycloak (SSO), Redis (Cache/Locking), PostgreSQL (Daten),
Collabora (Office), spreed-signaling/HPB (Talk-Signaling), CoTURN (TURN/ICE), dem
Talk-Transcriber und dem Talk-Recording-Backend.

---

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
