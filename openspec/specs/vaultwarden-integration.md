# vaultwarden-integration

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

Vaultwarden ist der self-hosted Bitwarden-kompatible Passwort-Manager der Workspace-Plattform.
Diese Spec beschreibt den Integrationsvertrag zwischen Vaultwarden und den umgebenden
Plattformdiensten: Keycloak (SSO-Login-Flow), PostgreSQL (Datenbank), SMTP (E-Mail-Benachrichtigungen),
dem Bitwarden-CLI (Seed-Job), sowie der Backup-Pipeline.

---

### Requirement: SSO-Only-Login via Keycloak OIDC

The system SHALL authenticate all Vaultwarden users exclusively via Keycloak OIDC using PKCE;
direct password-based logins SHALL be disabled (`SSO_ONLY=true`) so that kein lokaler
Account-Bypass möglich ist. Der OIDC-Client `vaultwarden` ist als confidential client im
Keycloak-Realm `workspace` registriert.

#### Scenario: Normaler Login-Flow via SSO
- **GIVEN** ein Nutzer ruft `https://vault.<PROD_DOMAIN>` auf
- **WHEN** er auf "Log in with SSO" klickt
- **THEN** wird er zum Keycloak-Realm `workspace` unter `https://auth.<PROD_DOMAIN>/realms/workspace` umgeleitet
- **AND** nach erfolgreichem Login leitet Keycloak zurück auf `/identity/connect/oidc-signin`; die E-Mail aus dem OIDC-Token wird als Vaultwarden-Account-Identität verwendet

#### Scenario: PKCE-Absicherung des Auth-Flows
- **GIVEN** `SSO_PKCE=true` und `SSO_SCOPES=email profile` sind konfiguriert
- **WHEN** Vaultwarden die OIDC-Authorization-Anfrage an Keycloak sendet
- **THEN** enthält die Anfrage einen `code_challenge`-Parameter (S256)
- **AND** Keycloak lehnt Requests ohne gültigen `code_verifier` beim Token-Austausch ab

#### Scenario: Dev vs. Prod OIDC-Endpoint
- **GIVEN** der Deployment-Context ist `dev` (k3d)
- **WHEN** Vaultwarden die `SSO_AUTHORITY` liest
- **THEN** zeigt sie auf `http://keycloak:8080/realms/workspace` (cluster-intern, kein TLS)
- **AND** in Prod (fleet) zeigt `SSO_AUTHORITY` auf `https://auth.<PROD_DOMAIN>/realms/workspace` (via prod-Patch `patch-vaultwarden.yaml`)

---

### Requirement: PostgreSQL-Datenbank auf shared-db

The system SHALL persist all Vaultwarden application state in a dedicated `vaultwarden`
database on the shared PostgreSQL instance (`shared-db:5432`); das Datenbankpasswort
SHALL zur Laufzeit aus dem Secret `workspace-secrets` (Key `VAULTWARDEN_DB_PASSWORD`)
injiziert werden und darf nie in einem ConfigMap oder Image hardcodiert sein.

#### Scenario: Startup-Reihenfolge mit Init-Container
- **GIVEN** der Vaultwarden-Pod startet
- **WHEN** der Init-Container `wait-for-db` läuft
- **THEN** wartet er bis `shared-db:5432` via TCP erreichbar ist (nc-Loop, 3-Sekunden-Intervall)
- **AND** der Hauptcontainer startet erst nach erfolgreichem Init, um "connection refused"-Starts zu verhindern

#### Scenario: Passwort-Injektion
- **GIVEN** `workspace-secrets` enthält den Key `VAULTWARDEN_DB_PASSWORD`
- **WHEN** der Vaultwarden-Container startet
- **THEN** wird `DATABASE_URL` als `postgresql://vaultwarden:$(VAULTWARDEN_DB_PASSWORD)@shared-db:5432/vaultwarden?sslmode=prefer` zusammengesetzt
- **AND** kein Datenbankpasswort erscheint in ConfigMaps oder Deployment-Specs im Klartext

---

### Requirement: Persistenter Datei-Storage via PVC

The system SHALL store Vaultwarden's local data directory (`/data`) — Attachment-Dateien,
RSA-Schlüssel, Icons-Cache, Config — auf einem dedizierten PersistentVolumeClaim mit
`ReadWriteOnce`-Access; die Deployment-Strategy MUSS `Recreate` sein, damit kein
Doppel-Mount entsteht.

#### Scenario: Deployment-Strategy Recreate
- **GIVEN** ein Rolling-Update von Vaultwarden wird ausgelöst
- **WHEN** Kubernetes das Update anwendet
- **THEN** wird der alte Pod vollständig beendet, bevor der neue Pod startet
- **AND** das PVC wird zu keinem Zeitpunkt von zwei Pods gleichzeitig gemountet

#### Scenario: Storage-Class-Wechsel in Prod (Longhorn)
- **GIVEN** der `prod-mentolder`-Overlay ist aktiv
- **WHEN** `patch-data-pvc-storage.yaml` angewendet wird
- **THEN** wechselt `vaultwarden-data-pvc` von `local-path` (node-pinned) zu `longhorn` (distributed)
- **AND** der PVC-Backup-CronJob kann das Volume von jedem Fleet-Node aus mounten, ohne Multi-Attach-Konflikte

---

### Requirement: Rate-Limiting am Ingress (Prod)

The system SHALL apply Traefik-seitige Rate-Limits auf alle Anfragen an `vault.<PROD_DOMAIN>`,
um Brute-Force-Angriffe auf den Master-Password-Flow zu erschweren; in Dev ist kein
Rate-Limit konfiguriert.

#### Scenario: Normaler Zugriff im Limit
- **GIVEN** der Middleware `rate-limit-vault` ist mit `average: 20` und `burst: 40` konfiguriert
- **WHEN** ein einzelner Client innerhalb einer Sekunde 20 Anfragen sendet
- **THEN** werden alle Anfragen durchgelassen ohne HTTP 429

#### Scenario: Brute-Force-Blockierung
- **GIVEN** ein Angreifer sendet mehr als 40 Anfragen pro Sekunde an `vault.<PROD_DOMAIN>`
- **WHEN** Traefik die `rate-limit-vault`-Middleware evaluiert
- **THEN** werden überzählige Anfragen mit HTTP 429 abgewiesen
- **AND** legitime Nutzer bleiben durch das `burst: 40`-Fenster unbeeinträchtigt

---

### Requirement: SMTP-E-Mail-Benachrichtigungen

The system SHALL versenden Vaultwarden-Systembenachrichtigungen (neue Login-Geräte,
Passwort-Hint-Anfragen, Org-Einladungen) via SMTP; in Dev wird Mailpit (kein TLS, Port 1025)
verwendet, in Prod ein externer SMTP-Server mit STARTTLS auf Port 587.

#### Scenario: Dev-Umgebung (Mailpit)
- **GIVEN** das Deployment läuft im k3d-Dev-Cluster
- **WHEN** Vaultwarden eine E-Mail versenden möchte
- **THEN** verbindet es sich mit `mailpit:1025` ohne TLS (`SMTP_SECURITY=off`)
- **AND** die E-Mail ist im Mailpit-UI unter `http://mailpit.localhost` sichtbar (nicht zugestellt)

#### Scenario: Prod-Umgebung (STARTTLS)
- **GIVEN** der `prod`-Overlay ist über `patch-vaultwarden.yaml` aktiv
- **WHEN** Vaultwarden eine E-Mail versenden möchte
- **THEN** verbindet es sich mit `${SMTP_HOST}:587` via STARTTLS
- **AND** Benutzername und Passwort werden aus `workspace-secrets` (Keys `SMTP_USER`, `SMTP_PASSWORD`) injiziert

---

### Requirement: Initialer Seed von Workspace-Service-URLs

The system SHALL beim ersten Einrichten des Passwort-Tresors eine vordefinierte Sammlung
von Workspace-Dienst-URLs (Nextcloud, Collabora, Keycloak, Portal, Docs) als Login-Items
anlegen; dies erfolgt einmalig über einen Kubernetes-Job, der die Bitwarden-CLI verwendet.

#### Scenario: Seed-Job Ausführung
- **GIVEN** ein Vaultwarden-Account (`BW_EMAIL`, `BW_PASSWORD`) existiert bereits
- **WHEN** `task workspace:vaultwarden:seed` den Job startet
- **THEN** erstellt der Job die Ordner `Infrastructure`, `Services` und `MCP Keys`
- **AND** jeder Workspace-Dienst (Nextcloud, Collabora, Keycloak, Portal, Docs) erscheint als Login-Item mit korrekter URL aus `domain-config`

#### Scenario: Idempotentes Upsert
- **GIVEN** der Seed-Job wurde bereits einmal ausgeführt
- **WHEN** er erneut läuft
- **THEN** löscht die `upsert_login`-Funktion vorhandene Items mit gleichem Namen zuerst
- **AND** legt neue Items mit aktuellen URLs an (kein Duplikat-Fehler)

---

### Requirement: Backup (Datenbank + PVC)

The system SHALL Vaultwarden in das plattformweite Backup-System einschließen: die
PostgreSQL-Datenbank `vaultwarden` wird via `pg_dump -Fc` gesichert, der lokale
Datei-PVC (`vaultwarden-data-pvc`) wird als verschlüsseltes tar-Archiv (`vaultwarden-data.tar.gz.enc`)
gesichert.

#### Scenario: Datenbank-Backup
- **GIVEN** der `backup-cronjob` läuft
- **WHEN** die Backup-Schleife über `(keycloak nextcloud vaultwarden website docuseal)` iteriert
- **THEN** wird `pg_dump -Fc` mit `VAULTWARDEN_DB_PASSWORD` aus `workspace-secrets` ausgeführt
- **AND** das Dump-File landet im verschlüsselten Backup-Archiv auf dem Remote-Storage

#### Scenario: PVC-Backup auf local-path (ohne Longhorn-Clone)
- **GIVEN** `vaultwarden-data-pvc` hat `storageClassName: local-path`
- **WHEN** der PVC-Backup-Job läuft
- **THEN** co-lokalisiert er sich via `podAffinity` mit dem laufenden Vaultwarden-Pod (gleicher Node)
- **AND** das Live-PVC wird direkt gemountet und als `vaultwarden-data.tar.gz.enc` archiviert (kein Longhorn-Clone erforderlich)

---

### Requirement: Sicherheits-Härtung des Containers

The system SHALL den Vaultwarden-Container mit minimalen Privilegien ausführen: kein
Root, kein Privilege-Escalation, alle Linux-Capabilities gedroppt, Seccomp-Profil
`RuntimeDefault`; nur der Admin-Token-Zugang zum `/admin`-Panel ist durch ein separates
Secret (`VAULTWARDEN_ADMIN_TOKEN`) gesichert.

#### Scenario: Non-Root-Ausführung
- **GIVEN** der Vaultwarden-Pod startet
- **WHEN** Kubernetes die Security-Context-Constraints prüft
- **THEN** läuft der Container als UID 65534 (nobody), `runAsNonRoot: true`, ohne `CAP_*`
- **AND** `allowPrivilegeEscalation: false` verhindert `setuid`/`setgid`-Eskalation

#### Scenario: Admin-Panel-Schutz
- **GIVEN** `ADMIN_TOKEN` ist aus `workspace-secrets` (Key `VAULTWARDEN_ADMIN_TOKEN`) injiziert
- **WHEN** jemand `/admin` im Browser aufruft
- **THEN** verlangt Vaultwarden den hashed Admin-Token als Zugangscode
- **AND** ohne gültigen Token ist das Admin-Panel nicht zugänglich, auch wenn der Ingress erreichbar ist
