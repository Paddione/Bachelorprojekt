# auth-sso

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

## Purpose

Pocket ID ist der einzige Identity Provider der Plattform. Alle Services authentifizieren sich
ausschliesslich über den OIDC Authorization Code Flow. Direkte Passwortvergabe, implizite Flows
und Self-Registration sind deaktiviert. Pocket ID kennt **keine Realms** — die OIDC-Clients liegen
in seiner eigenen Datenbank (`pocket_id.oidc_clients`) und werden bei jedem Deploy idempotent vom
`pocket-id-client-seed`-Job über die Admin-REST-API provisioniert.

---

## Requirements

### Requirement: Single-Sign-On für alle Platform-Services
<!-- bats: auth-sso.bats -->

The system SHALL use Pocket ID as the sole OIDC identity provider on `auth.<domain>`. No Keycloak
realm-import artifact SHALL remain in the repository: `scripts/import-entrypoint.sh` and
`prod/import-entrypoint.sh` SHALL NOT exist, `k3d/deploy.sh` SHALL NOT create a
`keycloak-import-script` ConfigMap, and no Kustomize base or overlay SHALL reference a
`realm-template` or `keycloak-import-script` generator. `scripts/lib/keycloak-helpers.sh`
SHALL NOT exist. The `KEYCLOAK_DB_PASSWORD` and
`KEYCLOAK_ADMIN_PASSWORD` keys SHALL be absent from `environments/schema.yaml` and from every
`environments/.secrets/<env>.yaml`, and the shared-database backup/restore helpers SHALL NOT
offer `keycloak` as a database target.

#### Scenario: Realm-Import-Skripte und -Helper existieren nicht mehr *(BATS)*
- **GIVEN** das Repository auf `main`
- **WHEN** nach `scripts/import-entrypoint.sh`, `prod/import-entrypoint.sh` und `scripts/lib/keycloak-helpers.sh` gesucht wird
- **THEN** existiert keine der drei Dateien

#### Scenario: deploy.sh legt keine keycloak-import-script ConfigMap an *(BATS)*
- **GIVEN** `k3d/deploy.sh`
- **WHEN** der Skriptinhalt gelesen wird
- **THEN** enthält er weder `keycloak-import-script` noch `import-entrypoint.sh`

#### Scenario: Kustomize-Bases referenzieren keine Keycloak-Generatoren *(BATS)*
- **GIVEN** `k3d/kustomization.yaml`, `prod/kustomization.yaml`, `prod-mentolder/kustomization.yaml`, `prod-korczewski/kustomization.yaml` und `prod-fleet/staging/kustomization.yaml`
- **WHEN** die Dateien gelesen werden
- **THEN** enthält keine davon `realm-template` oder `keycloak-import-script`

#### Scenario: KEYCLOAK_*-Keys sind aus Schema und Secrets entfernt *(BATS)*
- **GIVEN** `environments/schema.yaml` und alle `environments/.secrets/*.yaml`
- **WHEN** nach Zeilen gesucht wird, die mit `KEYCLOAK_DB_PASSWORD:` oder `KEYCLOAK_ADMIN_PASSWORD:` beginnen
- **THEN** wird kein Treffer gefunden

#### Scenario: Backup-Restore kennt kein keycloak-Ziel mehr *(BATS)*
- **GIVEN** `scripts/backup-restore-lib.sh`, `scripts/backup-restore-db.sh` und `scripts/backup-restore.sh`
- **WHEN** die Dateien gelesen werden
- **THEN** enthält keine davon das Datenbank-Ziel `keycloak`

#### Scenario: shared-db exportiert keinen keycloak-db Alias-Service *(BATS)*
- **GIVEN** `k3d/shared-db.yaml`
- **WHEN** die Service-Namen gelesen werden
- **THEN** existiert kein Service `keycloak-db`

### Requirement: OIDC-Client-Provisionierung über den Seed-Job

The system SHALL provision all OIDC clients in Pocket ID through the `pocket-id-client-seed` Job
on every deploy, using the Pocket ID Admin REST API, and SHALL write the resulting client secrets
back into the `workspace-secrets` Secret. The Job SHALL be idempotent: re-running it against
already-provisioned clients SHALL NOT invalidate their existing secrets.

#### Scenario: Erstprovisionierung beim ersten Cluster-Start

- **GIVEN** Pocket ID läuft und `POCKET_ID_API_KEY` ist in `workspace-secrets` hinterlegt
- **WHEN** der `pocket-id-client-seed`-Job im Rahmen von `task workspace:deploy` läuft
- **THEN** legt er die konfigurierten OIDC-Clients über die Admin-REST-API in `pocket_id.oidc_clients` an
- **AND** schreibt die erzeugten Client-Secrets zurück nach `workspace-secrets`
- **AND** für den Website-Client zusätzlich nach `website-secrets` in der `website`-Namespace
  (RBAC dafür in `k3d/pocket-id-client-seed-website-rbac.yaml`)

#### Scenario: Fehlschlag bei fehlendem API-Key

- **GIVEN** `POCKET_ID_API_KEY` ist nicht gesetzt oder ungültig
- **WHEN** der Seed-Job die Admin-REST-API aufruft
- **THEN** antwortet Pocket ID mit einem Fehler-Statuscode
- **AND** der Job schlägt fehl, statt Clients ohne Secret zurückzulassen

#### Scenario: Idempotenter Re-Run bei erneutem Deploy

- **GIVEN** die Clients wurden bereits provisioniert und ihre Secrets liegen in `workspace-secrets`
- **WHEN** der Seed-Job bei einem weiteren Deploy erneut läuft
- **THEN** bleiben bestehende Clients und ihre Secrets unverändert gültig
- **AND** von Hand in der Pocket-ID-Oberfläche vorgenommene Änderungen werden dabei überschrieben —
  die Client-Konfiguration ist der Seed-Job, nicht die UI

---

### Requirement: Website-OIDC mit serverseitiger Cookie-Session

The system SHALL implement the OIDC Authorization Code Flow for the website client, persist
sessions in a PostgreSQL `web_sessions` table (keyed by an opaque 32-byte session ID), and
store the session ID in an `HttpOnly; SameSite=Lax` cookie named `workspace_session`.

#### Scenario: Code-Exchange und Session-Erstellung

- **GIVEN** Pocket ID hat den Nutzer erfolgreich authentifiziert und an `/api/auth/callback` weitergeleitet
- **WHEN** der Server den Authorization Code gegen `TOKEN_ENDPOINT` (intern via Cluster-DNS) eintauscht
- **THEN** werden `access_token`, `refresh_token` und Nutzerinfos von Pocket ID abgerufen
- **AND** eine Session-Zeile mit 8-Stunden-TTL in `web_sessions` angelegt
- **AND** das `workspace_session`-Cookie im Response gesetzt

#### Scenario: Automatisches Token-Refresh bei ablaufendem Access Token

- **GIVEN** ein eingeloggter Nutzer macht eine Anfrage, und der Access-Token läuft in weniger als 60 Sekunden ab
- **WHEN** `getSession()` die Ablaufzeit des JWT prüft
- **THEN** wird der Token via `refresh_token` gegen Pocket ID erneuert
- **AND** die Session-Zeile in `web_sessions` mit neuem Token und neuem 8-Stunden-TTL aktualisiert

#### Scenario: Session-Ablauf bei fehlgeschlagenem Refresh

- **GIVEN** der Refresh-Token ist abgelaufen oder Pocket ID lehnt ihn ab
- **WHEN** `refreshTokens()` `null` zurückgibt
- **THEN** wird die Session-Zeile aus `web_sessions` gelöscht
- **AND** `getSession()` gibt `null` zurück (Nutzer wird ausgeloggt)

---

### Requirement: Anmeldesicherheit

The system SHALL rely on Pocket ID's passkey-first authentication and SHALL NOT enable
self-registration. Login is by email address.

#### Scenario: Keine Selbstregistrierung

- **GIVEN** eine unbekannte Person öffnet die Pocket-ID-Anmeldung
- **WHEN** sie versucht, sich ohne vorher angelegtes Konto zu registrieren
- **THEN** bietet Pocket ID keinen Registrierungsweg an
- **AND** Konten entstehen ausschliesslich über die Admin-API (siehe Requirement
  „Programmatische Nutzerverwaltung über Admin-API")

> **Offen (T002179):** Die frühere Fassung dieses Requirements beschrieb Keycloak-spezifische
> Realm-Policies — Brute-Force-Sperre über `waitIncrementSeconds`/`maxFailureWaitSeconds` und
> eine Passwort-Policy mit PBKDF2-SHA512-Hashing. Beides sind Realm-Einstellungen, die es bei
> Pocket ID in dieser Form nicht gibt; Pocket ID ist passkey-first und kennt kein
> Realm-Konfigurationsobjekt. Welche äquivalenten Schutzmechanismen Pocket ID bietet
> (Rate-Limiting, Sperrzeiten) ist noch nicht belegt. Die Szenarien wurden deshalb entfernt
> statt umbenannt — eine erfundene Beschreibung wäre schlechter als eine fehlende, weil sie als
> Verhaltens-SSOT Vertrauen genießt. Nachzutragen, sobald am laufenden Pocket ID belegt.

---

### Requirement: Programmatische Nutzerverwaltung über Admin-API

The system SHALL expose Pocket ID user management (create, update, delete, role assignment,
account recovery) exclusively through the website's internal Admin-API, which authenticates
against the Pocket ID Admin REST API using the `X-API-KEY` header with `POCKET_ID_API_KEY`.

> Pocket ID v2.9.0 akzeptiert **kein** `Authorization: Bearer` auf der Admin-API — der
> API-Key-Header ist der einzige unterstützte Weg (siehe `website/src/lib/identity.ts`).

#### Scenario: Neuen Nutzer anlegen

- **GIVEN** ein Admin sendet eine Create-User-Anfrage an die interne API
- **WHEN** `createUser()` einen POST an `/api/users` sendet
- **THEN** wird der Nutzer in Pocket ID angelegt
- **AND** vorher prüft `GET /api/users?search=<email>`, dass die E-Mail-Adresse noch nicht vergeben ist

#### Scenario: Kontozugang wiederherstellen

- **GIVEN** ein Nutzer kann sich nicht mehr anmelden
- **WHEN** `sendPasswordResetEmail()` einen POST an `/api/users/{id}/one-time-access-token` sendet
- **THEN** stellt Pocket ID ein einmalig nutzbares Zugangstoken aus
- **AND** der Nutzer richtet darüber einen neuen Passkey ein — es gibt keinen
  Passwort-Reset-Mail-Flow wie bei einem passwortbasierten Provider

---

### Requirement: Arena-Audience im Website-Token

The system SHALL include the `arena` audience claim in the Pocket ID access token issued for
the `website` client, so that the arena-server can validate these tokens without a separate
login.

#### Scenario: Token mit Arena-Audience

- **GIVEN** ein Nutzer ist über die Website eingeloggt und hat einen gültigen Access Token
- **WHEN** der Token den Audience-Mapper `audience-arena` durchläuft
- **THEN** enthält das `aud`-Feld des JWT den Wert `arena`
- **AND** der arena-server akzeptiert den Token ohne separaten OIDC-Flow

#### Scenario: Automatischer Refresh bei fehlendem Arena-Audience (Legacy-Sessions)

- **GIVEN** eine bestehende Session wurde vor dem Hinzufügen des Audience-Mappers erstellt
- **WHEN** `getSession()` prüft, ob `arena` im Token vorhanden ist
- **THEN** wird der Token proaktiv per Refresh erneuert, auch wenn er noch nicht abgelaufen ist
- **AND** die aktualisierte Session enthält das `arena`-Audience-Claim

---

### Requirement: Magic-Link für System-Test-Sessions

The system SHALL provide a time-limited (5 minutes), single-use magic-link mechanism for
E2E system tests to establish an authenticated session without going through the interactive
OIDC flow.

#### Scenario: Magic-Link einlösen

- **GIVEN** ein Test-Setup hat einen Magic-Link für einen Seed-Nutzer geminted
- **WHEN** `GET /api/auth/magic?token=<token>` aufgerufen wird und der Token gültig, unbenutzt und nicht abgelaufen ist
- **THEN** wird der Token atomar als `used_at = now()` markiert
- **AND** eine `web_sessions`-Zeile für den Test-Nutzer angelegt
- **AND** das `workspace_session`-Cookie gesetzt und auf `redirect_uri` weitergeleitet

#### Scenario: Abgelaufener oder bereits genutzter Token

- **GIVEN** ein Magic-Token wurde bereits eingelöst oder ist älter als 5 Minuten
- **WHEN** ein zweiter Einlöseversuch erfolgt
- **THEN** gibt die API `{ ok: false, reason: 'used' | 'expired' }` zurück
- **AND** es wird keine neue Session angelegt

---

### Requirement: Logout mit Provider-Session-Invalidierung

The system SHALL invalidate the local `web_sessions` database row on logout and redirect the
browser to Pocket ID's OIDC end-session endpoint, so that the SSO session is also terminated.

#### Scenario: Vollständiger Logout

- **GIVEN** ein Nutzer klickt auf "Logout"
- **WHEN** `getLogoutUrl(sessionId)` aufgerufen wird
- **THEN** wird die `web_sessions`-Zeile sofort gelöscht (best-effort)
- **AND** der Browser wird an `${POCKET_ID_FRONTEND_URL}/api/oidc/end-session?client_id=website&post_logout_redirect_uri=<SITE_URL>` weitergeleitet
- **AND** Pocket ID beendet die SSO-Session, sodass andere verbundene Clients ebenfalls ausgeloggt werden

---

### Requirement: API-Auth-Gate blockiert unklassifizierte Endpunkte ohne Allowlist-Eintrag

The system SHALL run a gate script (`scripts/api-auth-check.mjs`) that validates every
API endpoint in the generated map: endpoints with auth type `admin`, `session`, `internal`,
or `cron` pass unconditionally; endpoints with auth type `unclassified` MUST have a
matching allowlist entry, otherwise the gate exits with code 1.

#### Scenario: Vollständig klassifizierte API besteht das Gate

- **GIVEN** alle Endpunkte in `api-map.json` haben auth-Typ `admin`, `session`, `internal` oder `cron`, und ein `unclassified`-Endpunkt (`/api/health`) ist in der Allowlist eingetragen
- **WHEN** `api-auth-check.mjs` ausgeführt wird
- **THEN** beendet sich das Script mit Exit-Code 0

#### Scenario: Unklassifizierter Endpunkt ohne Allowlist-Eintrag schlägt fehl

- **GIVEN** `api-map.json` enthält einen Endpunkt mit `"auth": "unclassified"` und die Allowlist ist leer oder enthält keinen passenden Eintrag
- **WHEN** `api-auth-check.mjs` ausgeführt wird
- **THEN** beendet sich das Script mit Exit-Code 1
- **AND** der Output enthält den Begriff `unclassified`

---

### Requirement: API-Auth-Gate erkennt Regressions-Downgrade von geschützten auf unklassifizierte Endpunkte

The system SHALL support a `--regression --main-map <file>` mode in `api-auth-check.mjs`
that compares the current endpoint map against the main-branch map and fails (exit 1) when
any endpoint's auth type was downgraded from a protected type (`session`, `admin`, etc.) to
`unclassified`.

#### Scenario: Auth-Downgrade wird als Regression erkannt

- **GIVEN** im Main-Branch hatte `/api/protected` den auth-Typ `session`, im aktuellen Branch ist er `unclassified` und fehlt in der Allowlist
- **WHEN** `api-auth-check.mjs --regression --main-map <main-map>` ausgeführt wird
- **THEN** beendet sich das Script mit Exit-Code 1
- **AND** der Output enthält das Wort `regression`

---

### Requirement: Einzelnes Nutzer-Attribut via GET-merge dann PUT aktualisieren

The system SHALL implement `updateUserAttribute(userId, key, value)` as a GET-then-PUT
sequence: first fetch the current user representation from `GET /api/users/{id}`,
merge the new `key: [value]` into the existing `attributes` map, then write the merged map
back with `PUT /api/users/{id}`, so that all previously set attributes are
preserved and only the targeted attribute is overwritten.

#### Scenario: Bestehendes Attribut bleibt erhalten, neues Attribut wird hinzugefügt

- **GIVEN** ein Pocket-ID-Nutzer mit `id = "u1"` hat das Attribut `existing: ["v"]` gesetzt
- **WHEN** `updateUserAttribute("u1", "phoneNumber", "+49 30 1")` aufgerufen wird
- **THEN** sendet die Funktion zuerst ein GET an `/api/users/u1` und liest die vorhandenen Attribute
- **AND** der anschließende PUT-Body enthält sowohl `attributes.existing = ["v"]` als auch `attributes.phoneNumber = ["+49 30 1"]`
- **AND** die Funktion gibt `true` zurück

#### Scenario: GET-Fehler verhindert einen blinden PUT

- **GIVEN** der Pocket-ID-Server antwortet auf das initiale GET mit einem Fehler-Statuscode (z. B. 404 oder 500)
- **WHEN** `updateUserAttribute` den GET-Response verarbeitet
- **THEN** wird kein PUT-Request abgesetzt
- **AND** die Funktion gibt `false` zurück

---

### Requirement: Cross-namespace OIDC discovery URL

The system SHALL resolve `POCKET_ID_URL` to a fully-qualified cluster DNS name
(`<service>.<namespace>.svc.cluster.local`) in every deploy path, including every
fallback default.

The website Deployment runs in namespace `website` while Pocket ID runs in `workspace`
(`workspace-korczewski` for the korczewski brand). A bare service short name such as
`http://pocket-id:1411` only resolves from inside Pocket ID's own namespace; from the
website pod it fails DNS resolution, so the server-side OIDC token exchange never
reaches the identity provider.

#### Scenario: Deploy without a resolved environment falls back to an FQDN

- **GIVEN** a deploy path where `POCKET_ID_URL` is not set because the environment was
  not resolved via `scripts/env-resolve.sh`
- **WHEN** the deploy renders the website manifests
- **THEN** the fallback value SHALL be a fully-qualified name ending in
  `.svc.cluster.local`
- **AND** it SHALL NOT contain an empty namespace segment (`pocket-id..svc`) even when
  `WORKSPACE_NAMESPACE` is unset

#### Scenario: Token exchange reaches the identity provider

- **GIVEN** a user who has completed the passkey challenge at the Pocket ID authorize
  endpoint
- **WHEN** the website handles the OIDC callback and exchanges the authorization code
- **THEN** the request SHALL reach Pocket ID's token endpoint and be answered with
  `POST /api/oidc/token` 200
- **AND** the callback SHALL NOT fail with a connection-level error such as
  `TypeError: fetch failed`

### Requirement: Configuration changes trigger a pod rollout

The system SHALL annotate the website pod template with a content hash of the rendered
configuration, computed after variable substitution, so that a changed configuration
value forces a new rollout.

`website-config` is consumed via `envFrom: configMapRef`. Those values are copied into
the process environment at container start and do not propagate when the ConfigMap is
updated — unlike a mounted ConfigMap volume. Without a checksum annotation a corrected
ConfigMap leaves running pods on the stale value indefinitely.

The hash MUST be computed after `envsubst`. A Kustomize `configMapGenerator` name-suffix
hash is not sufficient: the deploy pipeline renders with `kustomize build | envsubst`,
so Kustomize only ever sees the unsubstituted placeholder and produces an identical
suffix for both a correct and an incorrect value.

#### Scenario: Changed configuration value produces a different checksum

- **GIVEN** two deploys of the same manifests that differ only in the value substituted
  for `POCKET_ID_URL`
- **WHEN** each deploy computes the `checksum/config` annotation from its rendered
  output
- **THEN** the two annotation values SHALL differ
- **AND** applying the second manifest SHALL cause the Deployment to roll out new pods

#### Scenario: Every render path sets the annotation

- **GIVEN** the website is deployed through any supported path — the Taskfile dev
  branch, the Taskfile production overlay branch, or either brand job of the
  build-website workflow
- **WHEN** that path applies the website manifests
- **THEN** it SHALL set the `checksum/config` annotation from its own rendered output
- **AND** no path SHALL apply the manifests leaving the annotation placeholder
  unsubstituted

### Requirement: Prod oauth2-proxy gates MUST verify issuer TLS

All production oauth2-proxy deployments SHALL verify the TLS certificate of the OIDC issuer (`https://auth.${PROD_DOMAIN}`, Pocket-ID behind the Let's Encrypt wildcard certificate). The flag `--ssl-insecure-skip-verify` MUST NOT appear in any rendered production overlay. `--skip-oidc-discovery=true` with explicit `--login-url`/`--redeem-url`/`--oidc-jwks-url`/`--profile-url` endpoint flags remains the sanctioned configuration (decoupling pod start from issuer availability).

#### Scenario: Rendered prod overlay contains no TLS-skip flag

- **GIVEN** the production overlay `prod-fleet/mentolder` (or `prod-fleet/korczewski`)
- **WHEN** it is rendered with `kubectl kustomize --load-restrictor=LoadRestrictionsNone`
- **THEN** the rendered output contains no occurrence of `--ssl-insecure-skip-verify`

### Requirement: Gates MUST authorize via groups claim or explicit email allowlist

Every production oauth2-proxy gate SHALL use exactly one of two authorization methods: (a) Pocket-ID group membership via `--allowed-groups=workspace-users`, `--oidc-groups-claim=groups`, and `--scope=openid email profile groups`, or (b) an explicit email allowlist via `--authenticated-emails-file`. The wildcard authorization `--email-domain=*` MUST NOT appear in any production overlay.

#### Scenario: Group-based gates carry the groups-claim flags

- **GIVEN** the eight group-based gates (brain, brett, comfy, docs, downloads, mediaviewer, rustdesk-web, videovault) in the rendered `prod-fleet/mentolder` overlay
- **WHEN** their container args are inspected
- **THEN** each carries `--allowed-groups=workspace-users` and `--oidc-groups-claim=groups` and `--scope=openid email profile groups`, and none carries `--email-domain=*`

#### Scenario: Allowlist gates keep the email allowlist

- **GIVEN** the three allowlist gates (studio, traefik, mailpit) in the rendered `prod-fleet/mentolder` overlay
- **WHEN** their container args are inspected
- **THEN** each carries `--authenticated-emails-file` and none carries `--email-domain=*`

### Requirement: No insecure OIDC flags in prod overlays

Production oauth2-proxy gates SHALL enforce verified user emails. The flag `--insecure-oidc-allow-unverified-email` MUST NOT appear in any rendered production overlay. Before a production rollout of this enforcement, a staging (or live-token) verification MUST confirm that Pocket-ID issues `email_verified=true` for workspace users.

#### Scenario: Rendered prod overlay contains no unverified-email flag

- **GIVEN** the production overlay `prod-fleet/mentolder` (or `prod-fleet/korczewski`)
- **WHEN** it is rendered with `kubectl kustomize --load-restrictor=LoadRestrictionsNone`
- **THEN** the rendered output contains no occurrence of `--insecure-oidc-allow-unverified-email`

### Requirement: Seed job MUST provision the workspace-users group idempotently

The Pocket-ID client seed job (`k3d/pocket-id-client-seed.yaml`) SHALL idempotently ensure the user group `workspace-users` exists via the Pocket-ID Admin REST API (`X-API-KEY` auth, same pattern as client upsert). Group membership assignment is a documented one-time admin step, not automated by the seed job.

#### Scenario: Repeated seed runs converge

- **GIVEN** a Pocket-ID instance where the group `workspace-users` already exists
- **WHEN** the seed job runs again
- **THEN** the job does not create a duplicate group and exits successfully

### Requirement: REQ-AUTHSSO-DBINIT-001 — Deterministic Pocket-ID database role provisioning

The `pocket-id-db-init` Job SHALL provision the `pocket_id` PostgreSQL role and its password
deterministically and idempotently, and SHALL NOT rely on shell- or Kubernetes-expanded `$$`
dollar-quoting inside a container `command`/`args` block.

#### Scenario: Dollar-quoted SQL survives container command expansion

- **GIVEN** the db-init container definition in `k3d/pocket-id.yaml`
- **WHEN** Kubernetes expands the container `command` (where `$$` is the escape for a literal `$`)
- **THEN** no PL/pgSQL dollar-quoted block is corrupted
- **AND** the psql session logs no `syntax error at or near "$"`

#### Scenario: Role password converges to the value in workspace-secrets

- **GIVEN** the `pocket_id` role already exists with an outdated password
- **WHEN** the db-init Job runs
- **THEN** the role password is set to the current `workspace-secrets` value via an idempotent
  `ALTER ROLE … WITH LOGIN PASSWORD`
- **AND** the Pocket-ID application connects without `SQLSTATE 28P01`

### Requirement: REQ-AUTHSSO-DBINIT-002 — Database bootstrap fails loudly

The `pocket-id-db-init` Job SHALL exit non-zero when database or role provisioning fails, and
SHALL NOT print a success marker unless every mandatory statement succeeded.

#### Scenario: SQL error aborts the Job

- **GIVEN** a statement in the database/role provisioning block returns an error
- **WHEN** the db-init container runs
- **THEN** the container exits non-zero
- **AND** the Job is reported as `Failed`, not `Completed`

#### Scenario: Best-effort admin bootstrap stays non-fatal but honest

- **GIVEN** the optional T001853 admin/api-key bootstrap cannot complete
- **WHEN** the db-init container finishes
- **THEN** it prints an explicit `SKIP:` reason instead of the success marker
- **AND** the mandatory database/role provisioning still governs the exit code

### Requirement: REQ-AUTHSSO-DBINIT-003 — API-key bootstrap resolves the real admin user

The admin api-key bootstrap SHALL resolve the target `pocket_id.users` row by lookup instead of a
hardcoded UUID, and SHALL be a no-op when the key is already registered.

#### Scenario: Existing admin user with a different UUID

- **GIVEN** `pocket_id.users` contains an admin row whose id is not
  `a0000000-0000-4000-8000-000000000001`
- **WHEN** the bootstrap inserts the `seed-deploy` api key
- **THEN** the row references the existing admin user's real id
- **AND** no `api_keys_user_id_fkey` foreign key violation occurs

### Requirement: REQ-AUTHSSO-SEED-001 — Seed Job is re-appliable under Flux

The `pocket-id-client-seed` Job SHALL be re-appliable by Flux even when an older Job object with a
different pod template already exists in the target namespace.

#### Scenario: Changed pod template does not block the Kustomization

- **GIVEN** `Job/pocket-id-client-seed` exists in the cluster with an older `spec.template`
- **WHEN** Flux reconciles a revision whose Job manifest differs
- **THEN** the apply succeeds (the Job is replaced rather than patched)
- **AND** the Kustomization does not report `field is immutable`

#### Scenario: A failing seed Job does not silently freeze the brand

- **GIVEN** the seed Job fails after the apply succeeded
- **WHEN** the operator inspects the brand's Kustomization
- **THEN** the failure is attributable to the Job itself, not to a rejected apply
- **AND** the generic freeze/drift behaviour remains the concern of T002207

### Requirement: REQ-AUTHSSO-SEED-002 — No untracked seed scheduling in the cluster

Pocket-ID seeding SHALL only run from objects that exist as manifests under `k3d/`. Hand-applied
`CronJob`/`Job` objects for seeding SHALL NOT exist in any workspace namespace.

#### Scenario: Nightly seed CronJob is either tracked or removed

- **GIVEN** `CronJob/pocket-id-client-seed` runs in `workspace` without a manifest in `k3d/`
- **WHEN** the change is applied
- **THEN** the CronJob either exists as a committed manifest or is removed from the cluster
- **AND** no seed schedule exists that git cannot account for

## Testszenarien

<!-- merged from BATS unit tests and Playwright e2e tests -->

### Requirement: OIDC Login-Redirect und Unauthenticated-State
<!-- e2e: fa-15-oidc.spec.ts -->

The system SHALL redirect unauthenticated users to Pocket ID via `/api/auth/login` and SHALL
return `{ authenticated: false }` from `/api/auth/me` when no session is present.

#### Scenario: `/api/auth/login` leitet zu Pocket ID um *(E2E)*
- **GIVEN** kein Browser-Cookie ist gesetzt und ein Client ruft `/api/auth/login` auf
- **WHEN** die Website eine GET-Anfrage an `/api/auth/login` ohne Session-Cookie empfängt
- **THEN** antwortet der Server mit HTTP 302 und einem `Location`-Header, der `openid-connect/auth` und `client_id=website` enthält

#### Scenario: `/api/auth/me` gibt unauthenticated zurück *(E2E)*
- **GIVEN** kein Session-Cookie ist vorhanden
- **WHEN** `GET /api/auth/me` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 200 und `{ authenticated: false }` im Body

#### Scenario: `/api/auth/logout` leitet weiter *(E2E)*
- **GIVEN** ein Client ruft `/api/auth/logout` auf (mit oder ohne gültige Session)
- **WHEN** die Anfrage ohne `maxRedirects` gestellt wird
- **THEN** antwortet der Server mit HTTP 302

#### Scenario: Navigationsleiste zeigt "Anmelden" für nicht eingeloggte Nutzer *(E2E)*
- **GIVEN** ein nicht authentifizierter Nutzer öffnet die Startseite
- **WHEN** die Seite vollständig geladen ist
- **THEN** ist ein `<a href="/api/auth/login">`-Link sichtbar

#### Scenario: Navigationsleiste zeigt "Registrieren" für nicht eingeloggte Nutzer *(E2E)*
- **GIVEN** ein nicht authentifizierter Nutzer öffnet die Startseite
- **WHEN** die Seite vollständig geladen ist
- **THEN** ist ein `<a href="/registrieren">`-Link sichtbar

---

### Requirement: `/login` leitet per Force-SSO an Pocket ID weiter
<!-- e2e: sa-02-auth.spec.ts -->

The system SHALL automatically redirect `/login` to the Pocket ID authorize endpoint, so that
the website never renders its own credential form.

#### Scenario: Pocket-ID-Anmeldeseite erscheint *(E2E)*
- **GIVEN** ein Nutzer öffnet `/login` auf der Website
- **WHEN** die Seite lädt
- **THEN** landet der Browser auf einer URL, die `authorize` enthält

#### Scenario: `/login` leitet automatisch weiter *(E2E)*
- **GIVEN** ein Nutzer ruft `/login` ohne bestehende Session auf
- **WHEN** die Seite lädt
- **THEN** erfolgt der Redirect ohne Zwischenschritt auf der Website

---

### Requirement: SSO-Integration für Nextcloud und weitere Services
<!-- e2e: sa-08-sso.spec.ts -->

The system SHALL allow users authenticated in Pocket ID to access Nextcloud via SSO, using
the existing session without re-authenticating.

#### Scenario: Pocket-ID-Kontoseite ist erreichbar *(E2E)*
- **GIVEN** ein Nutzer öffnet die Pocket-ID-Oberfläche unter `${POCKET_ID_FRONTEND_URL}`
- **WHEN** er sich mit seinem Passkey anmeldet
- **THEN** erscheint die Kontoseite oder ein Post-Login-Element (kein Fehlerzustand)

#### Scenario: Nextcloud SSO-Login mit bestehender Pocket-ID-Session *(E2E)*
- **GIVEN** ein Nutzer ist bereits per OIDC in Pocket ID eingeloggt
- **WHEN** er `files.<domain>/login` öffnet und auf den SSO-Button klickt (oder automatisch weiterleitet)
- **THEN** wird er ohne erneute Anmeldung in Nextcloud eingeloggt

---

### Requirement: Session-Timeout-Werte DSGVO-konform
<!-- e2e: sa-04-session-timeout.spec.ts -->

The system SHALL bound the website session lifetime through its own `web_sessions` table
(8-hour TTL, refreshed on activity) and the `workspace_session` cookie's `Max-Age`, rather
than through provider-side realm settings.

> **Hinweis (T002179):** Die frühere Fassung forderte Keycloak-Realm-Werte
> (`ssoSessionIdleTimeout`, `accessTokenLifespan`, `ssoSessionMaxLifespan`), die über die
> Admin-REST-API ausgelesen wurden. Pocket ID kennt kein Realm-Konfigurationsobjekt mit diesen
> Feldern. Die Session-Begrenzung liegt heute vollständig bei der Website — der zugehörige
> E2E-Test `sa-04-session-timeout.spec.ts` prüft entsprechend die `web_sessions`-Tabelle und
> das Cookie, nicht mehr die Provider-Konfiguration.

#### Scenario: Website-Session ist DSGVO-konform begrenzt *(E2E)*
- **GIVEN** ein Nutzer ist über die Website eingeloggt
- **WHEN** die Session-Zeile in `web_sessions` und das `workspace_session`-Cookie geprüft werden
- **THEN** liegt die TTL bei 8 Stunden und wird bei Aktivität erneuert
- **AND** die Session endet spätestens mit dem Ablauf der Cookie-`Max-Age`

---

### Requirement: Korczewski-JWT wird vom Arena-Server akzeptiert

The system SHALL accept JWTs issued by the korczewski Pocket ID instance for authenticated
requests to the arena-server at `arena-ws.korczewski.de`.

#### Scenario: Gültiges Korczewski-JWT wird akzeptiert

- **GIVEN** ein Nutzer hat einen gültigen Access Token aus der korczewski-Pocket-ID-Instanz
- **WHEN** eine Anfrage mit diesem Bearer-Token an den Arena-Server (`/healthz`) gesendet wird
- **THEN** antwortet der Arena-Server mit HTTP 200

> **Offen (T002179):** Der referenzierte E2E-Test `sa-12-korczewski-jwt.spec.ts` **existiert
> nicht** (mehr) — die frühere `<!-- e2e: … -->`-Zuordnung zeigte ins Leere. Die beiden Szenarien
> beschrieben Keycloak-Discovery unter `auth.korczewski.de/realms/workspace/.well-known/…`; bei
> Pocket ID gibt es diesen Realm-Pfad nicht. Der tatsächliche Discovery-Pfad und der Weg, wie
> der Arena-Server die Token validiert, sind noch nicht belegt — die Szenarien wurden deshalb
> entfernt statt geraten. Nachzutragen zusammen mit einem neuen E2E-Test.

---

### Requirement: Gefälschte oder unvertrauenswürdige JWTs werden abgelehnt
<!-- e2e: sa-13-untrusted-jwt.spec.ts -->

The system SHALL reject JWTs that are structurally valid but signed with an unknown or
untrusted key (not in the Pocket ID JWKS) with HTTP 401.

#### Scenario: Strukturell gültiges JWT mit gefälschter Signatur wird konstruiert *(E2E)*
- **GIVEN** ein Angreifer baut ein JWT mit Header `RS256` und Payload (Issuer: untrusted.example.com, Audience: arena, Admin-Role)
- **WHEN** das JWT zusammengesetzt wird
- **THEN** enthält es genau drei Base64url-Segmente (gültige JWT-Struktur)

#### Scenario: Gefälschtes JWT wird vom Arena-Server abgelehnt *(E2E)*
- **GIVEN** ein strukturell valides JWT mit unbekannter Signatur (kein echter Key) liegt vor
- **WHEN** eine Anfrage mit diesem Bearer-Token an den Arena-Server gesendet wird
- **THEN** antwortet der Server mit HTTP 401

---

### Requirement: E2E-Auth-Setup — Mentolder und Korczewski
<!-- e2e: mentolder-auth-setup.spec.ts, korczewski-auth-setup.spec.ts, arena-mentolder-auth-setup.spec.ts, brett-mentolder-auth-setup.spec.ts -->

The system SHALL allow automated E2E tests to establish authenticated sessions for admin and
portal users via the full Pocket ID OIDC flow, persisting `workspace_session` cookies in
storageState files for session reuse across test suites.

#### Scenario: Mentolder Admin-Login via Pocket ID und Session-Persistenz *(E2E)*
- **GIVEN** `E2E_ADMIN_PASS` ist gesetzt und `web.mentolder.de` ist erreichbar
- **WHEN** `loginViaE2E` den OIDC-Flow für den Admin-User durchführt und zu `/admin` weiterleitet
- **THEN** gibt `/api/auth/me` `{ authenticated: true }` zurück
- **AND** der Browser-Context wird als `mentolder-website-admin.json` gespeichert

#### Scenario: Mentolder Portal-User-Login via Pocket ID *(E2E)*
- **GIVEN** `E2E_USER_PASS` ist gesetzt
- **WHEN** `loginViaE2E` den OIDC-Flow für den Portal-User durchführt und zu `/portal` weiterleitet
- **THEN** gibt `/api/auth/me` `{ authenticated: true }` zurück
- **AND** der Browser-Context wird als `mentolder-website-user.json` gespeichert

#### Scenario: Korczewski Admin-Login via `/api/auth/login` und Pocket-ID-Redirect *(E2E)*
- **GIVEN** `TEST_ADMIN_PASSWORD` ist gesetzt und `web.korczewski.de` ist erreichbar
- **WHEN** der Browser zu `/api/auth/login?returnTo=/admin` navigiert, zu Pocket ID weitergeleitet wird und Zugangsdaten eingibt
- **THEN** wird der Browser zurück an `web.korczewski.de` geleitet und `/api/auth/me` gibt `{ authenticated: true }` zurück
- **AND** der Browser-Context wird als `korczewski-website-admin.json` gespeichert

#### Scenario: Arena-Admin-Login via Pocket ID (mentolder) *(E2E)*
- **GIVEN** `E2E_ADMIN_PASS` ist gesetzt und der Arena-Server ist erreichbar
- **WHEN** `loginViaE2E` den OIDC-Flow für den Admin-User durchführt
- **THEN** ist der Nutzer authentifiziert und der Arena-Session-Context wird als `mentolder-arena-admin.json` gespeichert

#### Scenario: Brett-Admin-Login via oauth2-proxy und Pocket ID (mentolder) *(E2E)*
- **GIVEN** `E2E_ADMIN_PASS` ist gesetzt und `brett.mentolder.de/healthz` ist erreichbar
- **WHEN** `loginViaE2E` den Login via oauth2-proxy-Redirect zu Pocket ID durchführt
- **THEN** gibt `brett.mentolder.de/healthz` HTTP 200 zurück (authentifizierter Zugriff funktioniert)
- **AND** der Context wird als `mentolder-brett.json` gespeichert

---

### Requirement: Registrierungsformular ist zugänglich und valide
<!-- e2e: fa-14-registration.spec.ts -->

The system SHALL render the `/registrieren` page with a form containing fields for first
name, last name, and email, and SHALL display validation errors when the form is submitted
empty.

#### Scenario: Registrierungsseite lädt und zeigt Formular *(E2E)*
- **GIVEN** ein Nutzer navigiert zu `/registrieren`
- **WHEN** die Seite geladen ist
- **THEN** sind eine Überschrift mit dem Text "Registrieren", Felder für Vorname, Nachname und E-Mail sowie ein Absende-Button sichtbar

#### Scenario: Leeres Formular zeigt Validierungsfehler *(E2E)*
- **GIVEN** ein Nutzer befindet sich auf `/registrieren`
- **WHEN** er das Formular ohne Eingaben absendet
- **THEN** erscheint eine Fehlermeldung (Browser-native Validierung oder eigener Fehler-Text) oder mindestens ein `:invalid`-Eingabefeld

---

### Requirement: Authenticated API Flows nach Login
<!-- e2e: fa-45-authenticated-flows.spec.ts -->

The system SHALL allow users with a valid `workspace_session` cookie to access protected
API endpoints and pages (`/api/auth/me`, `/api/portal/rooms`, `/api/admin/*`, `/portal`,
`/admin`) without being redirected to the login or Pocket ID flow.

#### Scenario: `/api/auth/me` gibt authentifizierten Nutzer zurück *(E2E)*
- **GIVEN** ein gültiger `workspace_session`-Cookie ist im Browser gesetzt (Admin-Login erfolgt)
- **WHEN** `GET /api/auth/me` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 200, `{ authenticated: true }` und dem Feld `username`

#### Scenario: `/api/portal/rooms` gibt JSON-Array zurück *(E2E)*
- **GIVEN** ein authentifizierter Nutzer ist eingeloggt
- **WHEN** `GET /api/portal/rooms` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 200 und einem JSON-Array (ggf. leer)

#### Scenario: `/portal` lädt ohne Redirect zu Login oder Pocket ID *(E2E)*
- **GIVEN** ein Nutzer ist eingeloggt (Session-Cookie gesetzt)
- **WHEN** `GET /portal` aufgerufen wird
- **THEN** bleibt die URL auf der Website-Domain und enthält weder `api/auth/login` noch `realms/workspace`

#### Scenario: `/admin` lädt ohne Redirect zu Login oder Pocket ID *(E2E)*
- **GIVEN** ein Admin-Nutzer ist eingeloggt
- **WHEN** `GET /admin` aufgerufen wird
- **THEN** bleibt die URL auf der Website-Domain ohne Redirect zu Login oder Pocket ID

---

### Requirement: API-Auth-Gate — vollständige und korrekte Endpunkt-Klassifizierung
<!-- bats: api-auth-gate.bats -->

The system SHALL pass the API auth gate when all endpoints are classified and all
`unclassified` endpoints appear in the allowlist; it SHALL fail when any unclassified
endpoint is missing from the allowlist.

#### Scenario: Vollständig klassifizierte API mit Allowlist besteht das Gate *(BATS)*
- **GIVEN** `api-map.json` enthält Endpunkte mit auth-Typen `admin` und `unclassified`, wobei der `unclassified`-Endpunkt (`/api/health`) in der Allowlist eingetragen ist
- **WHEN** `api-auth-check.mjs` ausgeführt wird
- **THEN** beendet sich das Script mit Exit-Code 0

#### Scenario: Unklassifizierter Endpunkt ohne Allowlist-Eintrag schlägt fehl *(BATS)*
- **GIVEN** `api-map.json` enthält `/api/mystery` mit `"auth": "unclassified"` und die Allowlist ist leer
- **WHEN** `api-auth-check.mjs` ausgeführt wird
- **THEN** beendet sich das Script mit Exit-Code 1 und der Output enthält `unclassified`

#### Scenario: Unklassifizierter POST-Endpunkt ohne Allowlist-Eintrag schlägt fehl *(BATS)*
- **GIVEN** `api-map.json` enthält `/api/public-form` mit `"auth": "unclassified"` und die Allowlist ist leer
- **WHEN** `api-auth-check.mjs` ausgeführt wird
- **THEN** beendet sich das Script mit Exit-Code 1

#### Scenario: Endpunkte mit Typen admin/session/internal/cron passieren ohne Allowlist *(BATS)*
- **GIVEN** `api-map.json` enthält je einen Endpunkt mit auth-Typ `admin`, `session`, `internal` und `cron`, die Allowlist ist leer
- **WHEN** `api-auth-check.mjs` ausgeführt wird
- **THEN** beendet sich das Script mit Exit-Code 0

#### Scenario: Regression session→unclassified ohne Allowlist führt zu Exit 1 *(BATS)*
- **GIVEN** im Main-Branch hat `/api/protected` den auth-Typ `session`; im aktuellen Branch ist er `unclassified` und fehlt in der Allowlist
- **WHEN** `api-auth-check.mjs --regression --main-map <main-map>` ausgeführt wird
- **THEN** beendet sich das Script mit Exit-Code 1 und der Output enthält `regression`

---

> **Gestrichen (T002179).** Hier standen vier Requirements, die Helfer für den
> Keycloak-Realm-Import als Systemanforderung führten: das `$$`-Escaping in
> `prod/import-entrypoint.sh`, `kc_substitute_placeholders`,
> `kc_assert_no_placeholders` sowie `kc_extract_clients_from_template` /
> `kc_extract_groups_from_template`.
>
> Sie sind ersatzlos entfallen, nicht auf Pocket ID umgeschrieben — es gibt kein
> Äquivalent, weil Pocket ID keine Realm-Templates importiert. Belegkette:
>
> - `scripts/lib/keycloak-helpers.sh` enthält die vier `kc_*`-Funktionen weiterhin, ihr
>   einziger Konsument ist jedoch `docs/archive/keycloak-realms/keycloak-sync.sh:48` —
>   archivierter Code. Kein lebender Aufrufer im Repository.
> - Das Äquivalenz-Szenario verglich `prod/import-entrypoint.sh` gegen
>   `k3d/realm-import-entrypoint.sh`. Diese Datei existiert nicht; das Szenario war
>   unerfüllbar.
> - Die zugehörigen BATS-Dateien (`keycloak-sync.bats`,
>   `keycloak-entrypoint-escaping.bats`) existieren ebenfalls nicht — die
>   `<!-- bats: -->`-Zuordnungen zeigten ins Leere.
>
> Die Entfernung der verbliebenen Skripte (`scripts/lib/keycloak-helpers.sh`,
> `scripts/import-entrypoint.sh`, `prod/import-entrypoint.sh`) gehört in das
> Cleanup-Ticket T002205, nicht in eine Spec-Bereinigung.

---

### Requirement: Pocket ID OIDC clients are deploy-seeded

The system SHALL register and reconcile all OIDC clients in Pocket ID
automatically during `task workspace:deploy`, without manual UI steps, so that
every OIDC-protected endpoint authenticates after a single deploy.

#### Scenario: Seed Job upserts every client with a non-empty secret

- **GIVEN** Pocket ID is running and `workspace-secrets`/`website-secrets`
  contain the `POCKET_ID_*_SECRET` values
- **WHEN** the `pocket-id-client-seed` Job runs after a deploy
- **THEN** each client whose secret env is set is created (or PUT-updated if it
  already exists) in Pocket ID, and clients with an empty/absent secret are
  skipped without failing the Job.

### Requirement: Dev secret manifests carry the Pocket ID keys

The dev `workspace-secrets` and `website-secrets` manifests SHALL declare the
`POCKET_ID_*` keys so no OIDC-dependent pod enters `CreateContainerConfigError`.

#### Scenario: Pods start in a fresh k3d cluster

- **GIVEN** a fresh k3d cluster deployed from the `k3d/` base
- **WHEN** the OIDC-dependent pods (oauth2-proxy-*, website, brett, pocket-id) start
- **THEN** all required `POCKET_ID_*` secret keys resolve and the pods reach Ready.

<!-- merged from change delta auth-sso.md (e1f04b6c7d40) -->

<!-- merged from change delta auth-sso.md (05be6b0490b4) -->

<!-- merged from change delta auth-sso.md (725a117752f0) -->

<!-- merged from change delta auth-sso.md (0f8de2de2f78) -->