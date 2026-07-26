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

The system SHALL use Pocket ID as the sole OIDC identity provider for all workspace services
(Website, Nextcloud, Vaultwarden, Docs, Traefik-Dashboard, Mailpit, Brett, Claude Code,
ComfyUI, Brainstorm).

#### Scenario: Erster Login über Pocket ID

- **GIVEN** ein Nutzer ist nicht eingeloggt und öffnet einen geschützten Service
- **WHEN** der Service leitet ihn an den Authorize-Endpoint `${POCKET_ID_FRONTEND_URL}/authorize` weiter
- **THEN** der Nutzer sieht die Pocket-ID-Anmeldung (Passkey-first)
- **AND** nach erfolgreicher Anmeldung wird er mit einem Authorization Code zurück an den Service weitergeleitet

#### Scenario: Kein direkter API-Zugang ohne OIDC

- **GIVEN** ein Client versucht, Tokens ohne Authorization Code Flow zu erhalten
- **WHEN** der Client keinen gültigen Code gegen `${POCKET_ID_URL}/api/oidc/token` einlöst
- **THEN** lehnt Pocket ID die Anfrage ab (HTTP 401/400)

---

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

### Requirement: Prod-Entrypoint $$-Escaping — Push-Deploy-Pipeline-Kontrakt
<!-- bats: (T002179) frühere Zuordnung auf keycloak-entrypoint-escaping.bats zeigte ins Leere — Datei existiert nicht -->

The system SHALL double-escape shell variable expansions in `prod/import-entrypoint.sh`
so that the push-deploy pipeline's sed collapse produces a valid single-`$` shell script.

#### Scenario: Push-sed-Collapse ergibt gültige indirekte Shell-Expansion *(BATS)*
- **GIVEN** `prod/import-entrypoint.sh` enthält `$$`-doppelte Variablen-Expansionen
- **WHEN** `sed -E 's/\$\$([a-zA-Z0-9_]|\{)/$\1/g'` auf die Datei angewendet wird
- **THEN** enthält der kollabierte Output die Zeile `eval val="${${var}:-}"` (korrekte indirekte Expansion)

#### Scenario: Prod-Entrypoint enthält den $$-Escape-Kontrakt *(BATS)*
- **GIVEN** `prod/import-entrypoint.sh` ist die gültige Datei im Repository
- **WHEN** nach `eval val="\$${$${var}:-}"` gesucht wird
- **THEN** findet `grep` diese Zeile ($$-Double-Escaping ist vorhanden, kein Regression-Einzel-$)

#### Scenario: Kollabierter Prod-Entrypoint ist syntaktisch valides POSIX sh *(BATS)*
- **GIVEN** `prod/import-entrypoint.sh` nach Push-sed-Collapse
- **WHEN** der kollabierte Output durch `sh -n` geprüft wird
- **THEN** meldet `sh -n` keinen Syntaxfehler (Exit-Code 0)

#### Scenario: Kollabierter Prod-Entrypoint ist semantisch äquivalent zum Dev-Entrypoint *(BATS)*
- **GIVEN** `prod/import-entrypoint.sh` ($$-Form) und `k3d/realm-import-entrypoint.sh` (single-$-Form)
- **WHEN** der Prod-Entrypoint durch die Push-sed-Pipeline kollabiert wird
- **THEN** enthält sowohl der kollabierte Prod-Output als auch der Dev-Entrypoint die Zeile `eval val="${${var}:-}"`
- **AND** beide enthalten die gleiche In-Place-Substitutionszeile `sed -i "s|\${${var}}|${val}|g"`

---

### Requirement: Placeholder-Substitution in Realm-Template-Helpers
<!-- bats: (T002179) frühere Zuordnung auf keycloak-sync.bats zeigte ins Leere — Datei existiert nicht -->

The system SHALL provide `kc_substitute_placeholders` to correctly replace single and
multiple `${VAR}` placeholders, leave unknown placeholders untouched, and handle values
with special characters (slashes, pipes, ampersands) without corruption.

#### Scenario: Einzelner Platzhalter wird korrekt ersetzt *(BATS)*
- **GIVEN** ein Template-String `hello ${FOO} world` und Substitutionsliste `FOO=bar`
- **WHEN** `kc_substitute_placeholders` aufgerufen wird
- **THEN** ist der Output `hello bar world` (Exit-Code 0)

#### Scenario: Mehrere verschiedene Variablen werden ersetzt *(BATS)*
- **GIVEN** ein Template `${A}/${B}/${A}` und Substitutionsliste `A=x`, `B=y`
- **WHEN** `kc_substitute_placeholders` aufgerufen wird
- **THEN** ist der Output `x/y/x`

#### Scenario: Unbekannte Variablen bleiben unverändert *(BATS)*
- **GIVEN** ein Template `keep ${UNKNOWN}` und Substitutionsliste `FOO=bar`
- **WHEN** `kc_substitute_placeholders` aufgerufen wird
- **THEN** ist der Output `keep ${UNKNOWN}` (unbekannte Platzhalter werden nicht verändert)

#### Scenario: Werte mit Slashes und Pipes werden sicher eingesetzt *(BATS)*
- **GIVEN** ein Template `url=${URL}` und Substitutionsliste `URL=https://auth.localhost/path|q`
- **WHEN** `kc_substitute_placeholders` aufgerufen wird
- **THEN** ist der Output `url=https://auth.localhost/path|q` (keine sed-Interpretation)

#### Scenario: Werte mit `&` werden sicher eingesetzt *(BATS)*
- **GIVEN** ein Template `greet=${MSG}` und Substitutionsliste `MSG=hello & goodbye`
- **WHEN** `kc_substitute_placeholders` aufgerufen wird
- **THEN** ist der Output `greet=hello & goodbye` (kein Shell-Sonderzeichen-Escape-Problem)

---

### Requirement: Erkennung verbleibender Platzhalter nach Substitution
<!-- bats: (T002179) frühere Zuordnung auf keycloak-sync.bats zeigte ins Leere — Datei existiert nicht -->

The system SHALL provide `kc_assert_no_placeholders` returning exit code 0 when no
`${...}` patterns remain, and a non-zero code listing all unresolved variable names
(sorted, deduplicated) when any placeholder remains.

#### Scenario: Vollständig aufgelöster String besteht die Prüfung *(BATS)*
- **GIVEN** der String `fully resolved string` enthält keine `${VAR}`-Muster
- **WHEN** `kc_assert_no_placeholders` aufgerufen wird
- **THEN** ist der Exit-Code 0 ohne Ausgabe

#### Scenario: Verbleibender Platzhalter führt zu Non-Zero Exit und Ausgabe *(BATS)*
- **GIVEN** der String `still has ${LEFTOVER}` enthält einen unaufgelösten Platzhalter
- **WHEN** `kc_assert_no_placeholders` aufgerufen wird
- **THEN** ist der Exit-Code ungleich 0 und der Output enthält `LEFTOVER`

#### Scenario: Mehrere verbleibende Platzhalter werden sortiert und dedupliziert ausgegeben *(BATS)*
- **GIVEN** der String `${B} and ${A} and ${B}` enthält zwei verschiedene Platzhalter (B doppelt)
- **WHEN** `kc_assert_no_placeholders` aufgerufen wird
- **THEN** ist der Exit-Code ungleich 0 und der Output enthält sowohl `${A}` als auch `${B}` (je genau einmal)

---

### Requirement: Extraktion von Clients und Gruppen aus Realm-Template als NDJSON
<!-- bats: (T002179) frühere Zuordnung auf keycloak-sync.bats zeigte ins Leere — Datei existiert nicht -->

The system SHALL provide `kc_extract_clients_from_template` and
`kc_extract_groups_from_template` emitting one compact JSON line per entry, producing no
output for empty or absent arrays.

#### Scenario: Clients werden als NDJSON extrahiert (je eine Zeile pro Client) *(BATS)*
- **GIVEN** eine Realm-JSON-Datei enthält ein `clients`-Array mit den Einträgen `alpha` und `beta`
- **WHEN** `kc_extract_clients_from_template` auf die Datei angewendet wird
- **THEN** gibt die Funktion genau zwei Zeilen aus: Zeile 1 enthält `"clientId":"alpha"`, Zeile 2 `"clientId":"beta"`

#### Scenario: Leeres `clients`-Array ergibt leere Ausgabe *(BATS)*
- **GIVEN** eine Realm-JSON-Datei hat ein leeres `clients`-Array (`"clients": []`)
- **WHEN** `kc_extract_clients_from_template` aufgerufen wird
- **THEN** ist die Ausgabe leer und der Exit-Code ist 0

#### Scenario: Einzelne Gruppe wird als NDJSON extrahiert *(BATS)*
- **GIVEN** eine Realm-JSON-Datei enthält `"groups": [{"name":"recovery-access","path":"/recovery-access"}]`
- **WHEN** `kc_extract_groups_from_template` aufgerufen wird
- **THEN** enthält der Output `"name":"recovery-access"`

#### Scenario: Fehlende `groups`-Feld ergibt leere Ausgabe *(BATS)*
- **GIVEN** eine Realm-JSON-Datei hat kein `groups`-Feld
- **WHEN** `kc_extract_groups_from_template` aufgerufen wird
- **THEN** ist die Ausgabe leer und der Exit-Code ist 0

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