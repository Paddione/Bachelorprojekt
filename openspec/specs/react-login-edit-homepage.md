# react-login-edit-homepage


<!-- merged from change delta react-login-edit-homepage.md on 2026-06-27 -->

## Purpose

### Requirement: React-Site-Login via Astro-Auth-Wiederverwendung

Die React-Site `react.mentolder.de` SHALL einen Login anbieten, der die bestehende
Astro-Website-Auth (Pocket-ID-OIDC) wiederverwendet, ohne ein eigenes Backend, ohne
Cookie-Domain-Erweiterung und ohne Änderung der OIDC-`redirect_uri`.

#### Scenario: Nicht eingeloggter Besucher startet Login

- **GIVEN** ein nicht eingeloggter Besucher auf `react.mentolder.de`
- **WHEN** er in der Navigation „Login" auslöst
- **THEN** wird er per Top-Level-Navigation zu `web.mentolder.de/api/auth/login?returnTo=https://react.mentolder.de/admin/homepage` geleitet
- **AND** nach erfolgreicher Pocket-ID-Authentifizierung landet er wieder auf `react.mentolder.de`

#### Scenario: Auth-Status wird cross-origin gelesen

- **GIVEN** ein eingeloggter Nutzer mit gültigem `workspace_session`-Cookie
- **WHEN** die React-App `GET web.mentolder.de/api/auth/me` mit `credentials:'include'` aufruft
- **THEN** wird der host-only `SameSite=Lax`-Cookie mitgesendet (same-site request)
- **AND** die Antwort trägt CORS-Header für die React-Origin und enthält `{ authenticated, user, isAdmin }`

#### Scenario: Logout

- **GIVEN** ein eingeloggter Nutzer auf `react.mentolder.de`
- **WHEN** er „Logout" auslöst
- **THEN** wird er zu `web.mentolder.de/api/auth/logout?returnTo=https://react.mentolder.de/` geleitet
- **AND** die Session wird invalidiert und er ist wieder ausgeloggt

## Requirements

### Requirement: „Edit Homepage"-Eintrag neben Admin-Menü/User-Profil

Die React-Navigation SHALL für eingeloggte Nutzer ein User-Profil-Menü zeigen und darin für
Admins einen „Edit Homepage"-Eintrag anbieten, der zum React-Block-Editor führt.

#### Scenario: Admin sieht „Edit Homepage"

- **GIVEN** ein eingeloggter Admin (`isAdmin === true`)
- **WHEN** er das User-Profil-Menü öffnet
- **THEN** sieht er Name/E-Mail, einen „Edit Homepage"-Eintrag und „Logout"
- **AND** „Edit Homepage" navigiert zu `/admin/homepage`

#### Scenario: Nicht-Admin sieht keinen Editor-Eintrag

- **GIVEN** ein eingeloggter Nicht-Admin
- **WHEN** er das User-Profil-Menü öffnet
- **THEN** ist kein „Edit Homepage"-Eintrag sichtbar
- **AND** ein direkter Aufruf von `/admin/homepage` leitet ihn zum Login/zur Startseite um

### Requirement: Versioniertes Homepage-Block-Dokument

Die Website SHALL ein versioniertes Homepage-Block-Dokument für die Brand `mentolder`
persistieren und ausliefern; die React-Homepage SHALL daraus rendern, mit Seed als Fallback.

#### Scenario: Öffentliches Lesen des Dokuments

- **GIVEN** ein gespeichertes Block-Dokument
- **WHEN** ein beliebiger Client `GET /api/homepage` aufruft
- **THEN** erhält er `{ schemaVersion, blocks }` ohne Authentifizierung

#### Scenario: Admin speichert mit Versionierung

- **GIVEN** ein eingeloggter Admin
- **WHEN** er `POST /api/admin/homepage/save` mit `{ baseVersion, payload }` aufruft und das Payload das Block-Schema erfüllt
- **THEN** wird das Dokument server-seitig zod-validiert, versioniert geschrieben und `{ version }` zurückgegeben
- **AND** bei `baseVersion`-Konflikt antwortet die API `409` mit `{ currentVersion, currentValue }`
- **AND** bei Schema-Verletzung antwortet die API `422` mit Feldfehlern

#### Scenario: Homepage rendert gespeichertes Dokument, fällt auf Seed zurück

- **GIVEN** die React-`HomePage` lädt
- **WHEN** `GET /api/homepage` ein gültiges Dokument liefert
- **THEN** rendert `BlockRenderer` dieses Dokument
- **AND** bei Fehler/leerer Antwort/ungültigem Schema rendert `BlockRenderer` den `homepageSeed`

### Requirement: Fail-closed Auth-Surface (CORS + returnTo-Allowlist)

Die neuen cross-origin-Pfade SHALL fail-closed sein: CORS nur für allowlisted Origins,
returnTo nur auf allowlisted Origins, Open-Redirect-Guard erhalten.

#### Scenario: Fremde Origin wird abgelehnt

- **GIVEN** eine Anfrage von einer nicht-allowlisted Origin
- **WHEN** sie einen der neuen Endpoints aufruft
- **THEN** werden keine CORS-Erlaubnis-Header gesetzt (Browser blockt die credentialed Antwort)

#### Scenario: Bösartiges returnTo wird verworfen

- **GIVEN** ein `returnTo` auf eine fremde Domain (z. B. `https://evil.example/`)
- **WHEN** der OIDC-Callback es verarbeitet
- **THEN** wird es ignoriert und auf den sicheren Default (`/admin` bzw. `/portal`) zurückgefallen
