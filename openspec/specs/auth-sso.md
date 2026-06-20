# auth-sso

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

Keycloak ist der einzige Identity Provider der Plattform. Alle Services authentifizieren sich
ausschliesslich über den OIDC Authorization Code Flow gegen das `workspace`-Realm. Direkte
Passwortvergabe, implizite Flows und Self-Registration sind deaktiviert. Der Realm wird beim
Pod-Start idempotent aus einem Template importiert — unaufgelöste Platzhalter führen zu einem
Pod-Fehler, bevor ein kaputtes Realm in die Datenbank geschrieben wird.

---

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
