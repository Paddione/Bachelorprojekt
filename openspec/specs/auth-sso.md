# auth-sso

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

## Purpose

Keycloak ist der einzige Identity Provider der Plattform. Alle Services authentifizieren sich
ausschliesslich über den OIDC Authorization Code Flow gegen das `workspace`-Realm. Direkte
Passwortvergabe, implizite Flows und Self-Registration sind deaktiviert. Der Realm wird beim
Pod-Start idempotent aus einem Template importiert — unaufgelöste Platzhalter führen zu einem
Pod-Fehler, bevor ein kaputtes Realm in die Datenbank geschrieben wird.

---

## Requirements

### Requirement: Single-Sign-On für alle Platform-Services

The system SHALL use Keycloak as the sole OIDC identity provider for all workspace services
(Website, Nextcloud, Vaultwarden, Docs, Traefik-Dashboard, Mailpit, Brett, Claude Code,
ComfyUI, Brainstorm).

#### Scenario: Erster Login über Keycloak

- **GIVEN** ein Nutzer ist nicht eingeloggt und öffnet einen geschützten Service
- **WHEN** der Service leitet ihn an `auth.<domain>/realms/workspace/protocol/openid-connect/auth` weiter
- **THEN** der Nutzer sieht das Keycloak-Loginformular des `workspace`-Realms
- **AND** nach erfolgreichem Login wird er mit einem Authorization Code zurück an den Service weitergeleitet

#### Scenario: Kein direkter API-Zugang ohne OIDC

- **GIVEN** ein Client versucht, Tokens via Resource Owner Password Credentials (ROPC) zu erhalten
- **WHEN** `directAccessGrantsEnabled` für den Client `false` ist
- **THEN** lehnt Keycloak die Anfrage ab (HTTP 401/400)

---

### Requirement: Realm-Import mit Platzhalter-Validierung beim Start

The system SHALL import the `workspace` realm from a template on pod startup, substituting all
`${VAR}` placeholders with environment variables, and SHALL abort (exit 1) if any placeholder
remains unresolved after substitution.

#### Scenario: Erfolgreiches Import beim ersten Cluster-Start

- **GIVEN** alle Umgebungsvariablen (OIDC-Secrets, Domains, SMTP) sind gesetzt
- **WHEN** der Keycloak-Pod startet und `import-entrypoint.sh` ausgeführt wird
- **THEN** wird `realm-workspace.json` mit `envsubst`-kompatiblem sed substituiert
- **AND** Keycloak importiert den Realm mit `kc.sh import --override false`
- **AND** der Server startet danach mit `kc.sh start`

#### Scenario: Fehlschlag bei fehlendem Secret

- **GIVEN** mindestens eine der Variablen (z.B. `NEXTCLOUD_OIDC_SECRET`) ist nicht gesetzt
- **WHEN** `import-entrypoint.sh` die substituierte Datei prüft
- **THEN** findet `grep '\${[A-Z_]*}'` einen unaufgelösten Platzhalter
- **AND** das Script gibt eine Fehlermeldung aus und beendet sich mit Exit-Code 1
- **AND** der Pod startet nicht (CrashLoopBackOff), statt einen kaputten Realm zu produzieren

#### Scenario: Idempotenter Re-Import bei Pod-Neustart

- **GIVEN** der Realm wurde bereits erfolgreich importiert und die Datenbank enthält ihn
- **WHEN** der Pod neu startet
- **THEN** überschreibt `--override false` den bestehenden Realm nicht
- **AND** der Server startet normal ohne Datenverlust

---

### Requirement: Website-OIDC mit serverseitiger Cookie-Session

The system SHALL implement the OIDC Authorization Code Flow for the website client, persist
sessions in a PostgreSQL `web_sessions` table (keyed by an opaque 32-byte session ID), and
store the session ID in an `HttpOnly; SameSite=Lax` cookie named `workspace_session`.

#### Scenario: Code-Exchange und Session-Erstellung

- **GIVEN** Keycloak hat den Nutzer erfolgreich authentifiziert und an `/api/auth/callback` weitergeleitet
- **WHEN** der Server den Authorization Code gegen `TOKEN_ENDPOINT` (intern via Cluster-DNS) eintauscht
- **THEN** werden `access_token`, `refresh_token` und Nutzerinfos von Keycloak abgerufen
- **AND** eine Session-Zeile mit 8-Stunden-TTL in `web_sessions` angelegt
- **AND** das `workspace_session`-Cookie im Response gesetzt

#### Scenario: Automatisches Token-Refresh bei ablaufendem Access Token

- **GIVEN** ein eingeloggter Nutzer macht eine Anfrage, und der Keycloak-Access-Token läuft in weniger als 60 Sekunden ab
- **WHEN** `getSession()` die Ablaufzeit des JWT prüft
- **THEN** wird der Token via `refresh_token` gegen Keycloak erneuert
- **AND** die Session-Zeile in `web_sessions` mit neuem Token und neuem 8-Stunden-TTL aktualisiert

#### Scenario: Session-Ablauf bei fehlgeschlagenem Refresh

- **GIVEN** der Refresh-Token ist abgelaufen oder Keycloak lehnt ihn ab
- **WHEN** `refreshTokens()` `null` zurückgibt
- **THEN** wird die Session-Zeile aus `web_sessions` gelöscht
- **AND** `getSession()` gibt `null` zurück (Nutzer wird ausgeloggt)

---

### Requirement: Realm-Sicherheitsrichtlinien

The system SHALL enforce the following security policies in the `workspace` realm:
brute-force protection (lockout after 5 failed attempts), password policy (minimum 12 chars,
upper, lower, digit, special character, PBKDF2-SHA512 hashing), no self-registration,
and login by email address.

#### Scenario: Konto-Sperrung nach Brute-Force

- **GIVEN** ein Angreifer versucht wiederholt, sich mit falschen Passwörtern anzumelden
- **WHEN** 5 fehlgeschlagene Versuche innerhalb von 12 Stunden aufgezeichnet werden
- **THEN** sperrt Keycloak den Zugang für mindestens 60 Sekunden (`waitIncrementSeconds`)
- **AND** die maximale Wartezeit beträgt 900 Sekunden (`maxFailureWaitSeconds`)

#### Scenario: Passwortrichtlinie bei Kontoerstellung

- **GIVEN** ein neuer Nutzer wird über die Admin-API angelegt und setzt sein Passwort
- **WHEN** das gewählte Passwort die Mindestanforderungen nicht erfüllt
- **THEN** lehnt Keycloak das Passwort ab
- **AND** das Passwort wird mit PBKDF2-SHA512 gehasht, wenn es akzeptiert wird

---

### Requirement: Programmatische Nutzerverwaltung über Admin-API

The system SHALL expose Keycloak user management (create, update, delete, role assignment,
password reset, email verification) exclusively through the website's internal Admin-API,
which authenticates against the Keycloak Admin REST API using `admin-cli` credentials.

#### Scenario: Neuen Nutzer anlegen

- **GIVEN** ein Admin sendet eine Create-User-Anfrage an die interne API
- **WHEN** `createUser()` einen POST an `/admin/realms/workspace/users` sendet
- **THEN** wird der Nutzer mit `emailVerified: false` und `requiredActions: ['UPDATE_PASSWORD', 'VERIFY_EMAIL']` angelegt
- **AND** eine E-Mail-Adresse darf im Realm nur einmal existieren (`duplicateEmailsAllowed: false`)

#### Scenario: Passwort-Reset per E-Mail

- **GIVEN** ein Nutzer hat sein Passwort vergessen
- **WHEN** `sendPasswordResetEmail()` `PUT /users/{id}/execute-actions-email` mit `['UPDATE_PASSWORD']` aufruft
- **THEN** schickt Keycloak eine Reset-E-Mail über den konfigurierten SMTP-Server

---

### Requirement: Arena-Audience im Website-Token

The system SHALL include the `arena` audience claim in the Keycloak access token issued for
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

### Requirement: Logout mit Keycloak-Session-Invalidierung

The system SHALL invalidate the local `web_sessions` database row on logout and redirect the
browser to Keycloak's OIDC logout endpoint, so that the Keycloak SSO session is also
terminated.

#### Scenario: Vollständiger Logout

- **GIVEN** ein Nutzer klickt auf "Logout"
- **WHEN** `getLogoutUrl(sessionId)` aufgerufen wird
- **THEN** wird die `web_sessions`-Zeile sofort gelöscht (best-effort)
- **AND** der Browser wird an `LOGOUT_ENDPOINT?client_id=website&post_logout_redirect_uri=<SITE_URL>` weitergeleitet
- **AND** Keycloak beendet die SSO-Session, sodass andere verbundene Clients ebenfalls ausgeloggt werden

---

### Requirement: Prod-Entrypoint-Escaping für Push-Deploy-Pipeline

The system SHALL double-escape all shell variable expansions in `prod/import-entrypoint.sh`
using `$$` so that the push-deploy pipeline's `sed -E 's/\$\$([a-zA-Z0-9_]|\{)/$\1/g'`
collapse produces syntactically valid single-`$` shell script identical in substitution
semantics to the dev entrypoint `k3d/realm-import-entrypoint.sh`.

#### Scenario: sed-Collapse ergibt gültige Shell-Expansion

- **GIVEN** die Datei `prod/import-entrypoint.sh` enthält `$$`-doppelte Variablen-Expansionen
- **WHEN** die Push-Deploy-Pipeline `sed -E 's/\$\$([a-zA-Z0-9_]|\{)/$\1/g'` auf die Datei anwendet
- **THEN** enthält der kollabierte Output die Zeile `eval val="${${var}:-}"` als korrekte indirekte Shell-Expansion
- **AND** der kollabierte Script besteht `sh -n` (POSIX-sh-Syntaxprüfung) ohne Fehler

#### Scenario: Prod-Entrypoint stimmt semantisch mit Dev-Entrypoint überein

- **GIVEN** `prod/import-entrypoint.sh` ($$-Form) und `k3d/realm-import-entrypoint.sh` (single-$-Form) existieren
- **WHEN** der Prod-Entrypoint durch die Push-sed-Pipeline kollabiert wird
- **THEN** enthält sowohl der kollabierte Prod-Output als auch der Dev-Entrypoint dieselbe indirekte Expansion `eval val="${${var}:-}"`
- **AND** beide enthalten die gleiche In-Place-Substitutionszeile `sed -i "s|${${var}}|${val}|g"`

---

### Requirement: Placeholder-Substitution in Realm-Template-Helpers

The system SHALL provide helper functions in `scripts/lib/keycloak-helpers.sh` that replace
`${VAR}` placeholders in realm template strings using an explicit key=value list, leave
unknown placeholders untouched, and handle values containing special characters (slashes,
pipes, ampersands) without corruption.

#### Scenario: Bekannte Variablen werden ersetzt, unbekannte bleiben erhalten

- **GIVEN** ein Template-String enthält `${FOO}` und `${UNKNOWN}` und die Substitutionsliste definiert nur `FOO=bar`
- **WHEN** `kc_substitute_placeholders` aufgerufen wird
- **THEN** wird `${FOO}` durch `bar` ersetzt
- **AND** `${UNKNOWN}` bleibt unverändert im Output erhalten

#### Scenario: Sonderzeichen in Werten werden nicht korrumpiert

- **GIVEN** ein Wert enthält Slashes, Pipes oder `&` (z.B. `URL=https://auth.localhost/path|q` oder `MSG=hello & goodbye`)
- **WHEN** `kc_substitute_placeholders` den Wert in den Template-String einsetzt
- **THEN** erscheint der Wert unverändert im Output ohne Shell- oder sed-Interpretation der Sonderzeichen

---

### Requirement: Erkennung verbleibender Platzhalter nach Substitution

The system SHALL provide a `kc_assert_no_placeholders` function that returns exit code 0
when the input string contains no `${...}` patterns, and returns a non-zero exit code
listing all unresolved variable names (sorted, deduplicated) when any placeholder remains.

#### Scenario: Vollständig aufgelöster String besteht die Prüfung

- **GIVEN** ein String enthält keine `${VAR}`-Muster mehr
- **WHEN** `kc_assert_no_placeholders` aufgerufen wird
- **THEN** gibt die Funktion Exit-Code 0 zurück ohne Ausgabe

#### Scenario: Verbleibende Platzhalter werden gemeldet und führen zu Fehler

- **GIVEN** ein String enthält noch unaufgelöste Platzhalter wie `${B}` und `${A}` (ggf. mehrfach)
- **WHEN** `kc_assert_no_placeholders` aufgerufen wird
- **THEN** gibt die Funktion einen Non-Zero Exit-Code zurück
- **AND** der Output nennt jeden unaufgelösten Variablennamen genau einmal in sortierter Reihenfolge

---

### Requirement: Extraktion von Clients und Gruppen aus Realm-Template als NDJSON

The system SHALL provide helper functions `kc_extract_clients_from_template` and
`kc_extract_groups_from_template` that parse a Keycloak realm JSON file and emit each
client or group object as a single NDJSON line; when the corresponding array is absent or
empty, the functions SHALL produce no output.

#### Scenario: Clients werden als NDJSON extrahiert

- **GIVEN** eine Realm-JSON-Datei enthält ein `clients`-Array mit zwei Einträgen (`alpha`, `beta`)
- **WHEN** `kc_extract_clients_from_template` auf die Datei angewendet wird
- **THEN** gibt die Funktion genau zwei Zeilen aus, je eine kompakte JSON-Zeile pro Client
- **AND** die erste Zeile enthält `"clientId":"alpha"`, die zweite `"clientId":"beta"`

#### Scenario: Leere oder fehlende Arrays ergeben leere Ausgabe

- **GIVEN** eine Realm-JSON-Datei hat ein leeres `clients`-Array oder kein `groups`-Feld
- **WHEN** `kc_extract_clients_from_template` bzw. `kc_extract_groups_from_template` aufgerufen wird
- **THEN** ist die Ausgabe leer (kein Output, Exit-Code 0)

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
sequence: first fetch the current user representation from `GET /admin/realms/{realm}/users/{id}`,
merge the new `key: [value]` into the existing `attributes` map, then write the merged map
back with `PUT /admin/realms/{realm}/users/{id}`, so that all previously set attributes are
preserved and only the targeted attribute is overwritten.

#### Scenario: Bestehendes Attribut bleibt erhalten, neues Attribut wird hinzugefügt

- **GIVEN** ein Keycloak-Nutzer mit `id = "u1"` hat das Attribut `existing: ["v"]` gesetzt
- **WHEN** `updateUserAttribute("u1", "phoneNumber", "+49 30 1")` aufgerufen wird
- **THEN** sendet die Funktion zuerst ein GET an `/admin/realms/workspace/users/u1` und liest die vorhandenen Attribute
- **AND** der anschließende PUT-Body enthält sowohl `attributes.existing = ["v"]` als auch `attributes.phoneNumber = ["+49 30 1"]`
- **AND** die Funktion gibt `true` zurück

#### Scenario: GET-Fehler verhindert einen blinden PUT

- **GIVEN** der Keycloak-Server antwortet auf das initiale GET mit einem Fehler-Statuscode (z. B. 404 oder 500)
- **WHEN** `updateUserAttribute` den GET-Response verarbeitet
- **THEN** wird kein PUT-Request abgesetzt
- **AND** die Funktion gibt `false` zurück

---

## Testszenarien

<!-- merged from BATS unit tests and Playwright e2e tests -->

### Requirement: OIDC Login-Redirect und Unauthenticated-State
<!-- e2e: fa-15-oidc.spec.ts -->

The system SHALL redirect unauthenticated users to Keycloak via `/api/auth/login` and SHALL
return `{ authenticated: false }` from `/api/auth/me` when no session is present.

#### Scenario: `/api/auth/login` leitet zu Keycloak um *(E2E)*
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

### Requirement: Falsches Passwort führt zu Keycloak-Fehlermeldung
<!-- e2e: sa-02-auth.spec.ts -->

The system SHALL display a Keycloak error message when incorrect credentials are submitted,
and SHALL automatically redirect `/login` to the Keycloak workspace realm.

#### Scenario: Falsches Passwort zeigt Keycloak-Fehlermeldung *(E2E)*
- **GIVEN** ein Nutzer öffnet `/login` auf der Website (force-SSO-Redirect zu Keycloak)
- **WHEN** er Username `testuser1` und das falsche Passwort `wrongpassword` eingibt und auf "Anmelden" klickt
- **THEN** zeigt Keycloak ein Fehlerfeedback-Element (`#input-error`, `.kc-feedback-text` oder `.alert-error`)

#### Scenario: `/login` leitet automatisch zu Keycloak weiter *(E2E)*
- **GIVEN** ein Nutzer ruft `/login` auf der Website auf
- **WHEN** die Seite lädt
- **THEN** landet der Browser auf einer URL, die dem Muster `realms/workspace` entspricht

---

### Requirement: Keycloak-SSO-Integration für Nextcloud und weitere Services
<!-- e2e: sa-08-sso.spec.ts -->

The system SHALL allow users authenticated in Keycloak to access Nextcloud via SSO, using
the existing Keycloak session without re-entering credentials.

#### Scenario: Keycloak Login via OIDC-Accountseite *(E2E)*
- **GIVEN** ein Nutzer öffnet die Keycloak Account-Seite `auth.<domain>/realms/workspace/account/`
- **WHEN** er gültige Zugangsdaten eingibt
- **THEN** erscheint die Account-Seite oder ein Post-Login-Element (kein Fehler-/Fehlerzustand)

#### Scenario: Nextcloud SSO-Login mit bestehender Keycloak-Session *(E2E)*
- **GIVEN** ein Nutzer ist bereits per OIDC in Keycloak eingeloggt (Keycloak-Session-Cookie vorhanden)
- **WHEN** er `files.<domain>/login` öffnet und auf den SSO-Button klickt (oder automatisch weiterleitet)
- **THEN** wird er ohne erneute Passworteingabe in Nextcloud eingeloggt

---

### Requirement: Session-Timeout-Werte DSGVO-konform
<!-- e2e: sa-04-session-timeout.spec.ts -->

The system SHALL configure Keycloak with `ssoSessionIdleTimeout` ≤ 1800s (30 min),
`accessTokenLifespan` ≤ 3600s (60 min), and an explicitly set `ssoSessionMaxLifespan` ≤ 86400s.

#### Scenario: SSO-Idle-Timeout und Access-Token-Lifespan sind DSGVO-konform *(E2E)*
- **GIVEN** Keycloak ist mit dem `workspace`-Realm konfiguriert und die Admin-API ist zugänglich
- **WHEN** die Realm-Konfiguration via Admin-REST-API abgerufen wird
- **THEN** ist `ssoSessionIdleTimeout` größer 0 und kleiner oder gleich 1800 Sekunden
- **AND** `accessTokenLifespan` ist kleiner oder gleich 3600 Sekunden

#### Scenario: Maximale Session-Dauer ist sinnvoll konfiguriert *(E2E)*
- **GIVEN** Keycloak ist mit dem `workspace`-Realm konfiguriert
- **WHEN** `ssoSessionMaxLifespan` aus der Admin-API gelesen wird
- **THEN** ist der Wert entweder 0 (nicht explizit gesetzt) oder kleiner oder gleich 86400 Sekunden

---

### Requirement: Korczewski-Realm JWT wird vom Arena-Server akzeptiert
<!-- e2e: sa-12-korczewski-jwt.spec.ts -->

The system SHALL accept JWTs issued by the korczewski Keycloak realm's `workspace` realm
for authenticated requests to the arena-server at `arena-ws.korczewski.de`.

#### Scenario: OIDC-Discovery des Korczewski-Keycloak ist erreichbar *(E2E)*
- **GIVEN** Keycloak auf `auth.korczewski.de` ist gestartet
- **WHEN** `GET auth.korczewski.de/realms/workspace/.well-known/openid-configuration` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 200 und einem JSON, dessen `issuer`-Feld `korczewski` enthält

#### Scenario: Korczewski-JWT wird vom Arena-Server als gültig akzeptiert *(E2E)*
- **GIVEN** ein Nutzer hat einen gültigen Access Token aus dem korczewski Keycloak-Realm (`arena`-Client)
- **WHEN** eine Anfrage mit diesem Bearer-Token an den Arena-Server (`/healthz`) gesendet wird
- **THEN** antwortet der Arena-Server mit HTTP 200

---

### Requirement: Gefälschte oder unvertrauenswürdige JWTs werden abgelehnt
<!-- e2e: sa-13-untrusted-jwt.spec.ts -->

The system SHALL reject JWTs that are structurally valid but signed with an unknown or
untrusted key (not in the Keycloak JWKS) with HTTP 401.

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
portal users via the full Keycloak OIDC flow, persisting `workspace_session` cookies in
storageState files for session reuse across test suites.

#### Scenario: Mentolder Admin-Login via Keycloak und Session-Persistenz *(E2E)*
- **GIVEN** `E2E_ADMIN_PASS` ist gesetzt und `web.mentolder.de` ist erreichbar
- **WHEN** `loginViaKeycloak` den OIDC-Flow für den Admin-User durchführt und zu `/admin` weiterleitet
- **THEN** gibt `/api/auth/me` `{ authenticated: true }` zurück
- **AND** der Browser-Context wird als `mentolder-website-admin.json` gespeichert

#### Scenario: Mentolder Portal-User-Login via Keycloak *(E2E)*
- **GIVEN** `E2E_USER_PASS` ist gesetzt
- **WHEN** `loginViaKeycloak` den OIDC-Flow für den Portal-User durchführt und zu `/portal` weiterleitet
- **THEN** gibt `/api/auth/me` `{ authenticated: true }` zurück
- **AND** der Browser-Context wird als `mentolder-website-user.json` gespeichert

#### Scenario: Korczewski Admin-Login via `/api/auth/login` und Keycloak-Redirect *(E2E)*
- **GIVEN** `TEST_ADMIN_PASSWORD` ist gesetzt und `web.korczewski.de` ist erreichbar
- **WHEN** der Browser zu `/api/auth/login?returnTo=/admin` navigiert, zu Keycloak weitergeleitet wird und Zugangsdaten eingibt
- **THEN** wird der Browser zurück an `web.korczewski.de` geleitet und `/api/auth/me` gibt `{ authenticated: true }` zurück
- **AND** der Browser-Context wird als `korczewski-website-admin.json` gespeichert

#### Scenario: Arena-Admin-Login via Keycloak (mentolder) *(E2E)*
- **GIVEN** `E2E_ADMIN_PASS` ist gesetzt und der Arena-Server ist erreichbar
- **WHEN** `loginViaKeycloak` den OIDC-Flow für den Admin-User durchführt
- **THEN** ist der Nutzer authentifiziert und der Arena-Session-Context wird als `mentolder-arena-admin.json` gespeichert

#### Scenario: Brett-Admin-Login via oauth2-proxy und Keycloak (mentolder) *(E2E)*
- **GIVEN** `E2E_ADMIN_PASS` ist gesetzt und `brett.mentolder.de/healthz` ist erreichbar
- **WHEN** `loginViaKeycloak` den Login via oauth2-proxy-Redirect zu Keycloak durchführt
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
`/admin`) without being redirected to the login or Keycloak flow.

#### Scenario: `/api/auth/me` gibt authentifizierten Nutzer zurück *(E2E)*
- **GIVEN** ein gültiger `workspace_session`-Cookie ist im Browser gesetzt (Admin-Login erfolgt)
- **WHEN** `GET /api/auth/me` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 200, `{ authenticated: true }` und dem Feld `username`

#### Scenario: `/api/portal/rooms` gibt JSON-Array zurück *(E2E)*
- **GIVEN** ein authentifizierter Nutzer ist eingeloggt
- **WHEN** `GET /api/portal/rooms` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 200 und einem JSON-Array (ggf. leer)

#### Scenario: `/portal` lädt ohne Redirect zu Login oder Keycloak *(E2E)*
- **GIVEN** ein Nutzer ist eingeloggt (Session-Cookie gesetzt)
- **WHEN** `GET /portal` aufgerufen wird
- **THEN** bleibt die URL auf der Website-Domain und enthält weder `api/auth/login` noch `realms/workspace`

#### Scenario: `/admin` lädt ohne Redirect zu Login oder Keycloak *(E2E)*
- **GIVEN** ein Admin-Nutzer ist eingeloggt
- **WHEN** `GET /admin` aufgerufen wird
- **THEN** bleibt die URL auf der Website-Domain ohne Redirect zu Login oder Keycloak

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
<!-- bats: keycloak-entrypoint-escaping.bats -->

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
<!-- bats: keycloak-sync.bats -->

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
<!-- bats: keycloak-sync.bats -->

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
<!-- bats: keycloak-sync.bats -->

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
